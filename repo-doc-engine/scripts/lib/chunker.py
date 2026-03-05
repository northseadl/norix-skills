"""Semantic Chunker — split documents into hierarchical chunks for vector indexing.

3-level chunking strategy:
  Level 0: Document summary (~200-300 tokens) for coarse filtering
  Level 1: Section-level (~500-1000 tokens) for precise search
  Level 2: Paragraph/code-block level (~200-500 tokens) for exact location
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

from lib.traceback import DocMeta, parse_frontmatter


@dataclass
class Chunk:
    """A semantic chunk of a document."""
    chunk_id: str              # Unique ID: "{doc_id}#s{section}p{para}"
    doc_id: str                # Parent document ID
    level: int                 # 0=summary, 1=section, 2=paragraph
    content: str               # The actual text
    heading: str               # Section heading or "[Summary]"
    parent_chunk_id: str | None = None
    sibling_chunk_ids: list[str] = field(default_factory=list)
    token_estimate: int = 0    # Rough token count (~words * 1.3)
    content_hash: str = ""     # SHA256 of content for change detection

    def __post_init__(self):
        if not self.token_estimate:
            self.token_estimate = _estimate_tokens(self.content)
        if not self.content_hash:
            self.content_hash = hashlib.sha256(
                self.content.encode()
            ).hexdigest()[:12]

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "level": self.level,
            "content": self.content,
            "heading": self.heading,
            "parent_chunk_id": self.parent_chunk_id,
            "sibling_chunk_ids": self.sibling_chunk_ids,
            "token_estimate": self.token_estimate,
            "content_hash": self.content_hash,
        }


@dataclass
class Section:
    """Intermediate representation of a document section."""
    heading: str
    level: int              # Heading level (2 for ##, 3 for ###)
    content: str
    start_line: int = 0


class SemanticChunker:
    """Chunk documents by their semantic structure (headings, paragraphs)."""

    def __init__(self, *, min_chunk_tokens: int = 50, max_chunk_tokens: int = 1000,
                 split_threshold: int = 800):
        self.min_chunk_tokens = min_chunk_tokens
        self.max_chunk_tokens = max_chunk_tokens
        self.split_threshold = split_threshold  # Only sub-split sections above this

    def chunk(self, doc: DocMeta, content: str) -> list[Chunk]:
        """Split a document into hierarchical chunks."""
        # Strip frontmatter
        _, body = parse_frontmatter(content)

        chunks: list[Chunk] = []
        summary_id = f"{doc.doc_id}#summary"

        # Level 0: Document summary
        summary = self._extract_summary(body)
        if summary:
            chunks.append(Chunk(
                chunk_id=summary_id,
                doc_id=doc.doc_id,
                level=0,
                content=summary,
                heading="[Summary]",
                parent_chunk_id=None,
            ))

        # Level 1: Split by headings (## level)
        sections = self._split_by_headings(body, target_level=2)
        section_ids: list[str] = []

        for i, section in enumerate(sections):
            section_id = f"{doc.doc_id}#s{i}"
            section_ids.append(section_id)

            chunks.append(Chunk(
                chunk_id=section_id,
                doc_id=doc.doc_id,
                level=1,
                content=section.content,
                heading=section.heading,
                parent_chunk_id=summary_id,
            ))

            # Level 2: Sub-split large sections
            if _estimate_tokens(section.content) > self.split_threshold:
                paragraphs = self._split_paragraphs(section.content)
                para_ids: list[str] = []

                for j, para in enumerate(paragraphs):
                    if _estimate_tokens(para) < self.min_chunk_tokens:
                        continue
                    para_id = f"{doc.doc_id}#s{i}p{j}"
                    para_ids.append(para_id)

                    chunks.append(Chunk(
                        chunk_id=para_id,
                        doc_id=doc.doc_id,
                        level=2,
                        content=para,
                        heading=f"{section.heading} > P{j}",
                        parent_chunk_id=section_id,
                    ))

                # Set sibling relationships for paragraphs
                for chunk in chunks:
                    if chunk.chunk_id in para_ids:
                        chunk.sibling_chunk_ids = [
                            pid for pid in para_ids if pid != chunk.chunk_id
                        ]

        # Set sibling relationships for sections
        for chunk in chunks:
            if chunk.chunk_id in section_ids:
                chunk.sibling_chunk_ids = [
                    sid for sid in section_ids if sid != chunk.chunk_id
                ]

        return chunks

    def _extract_summary(self, body: str) -> str:
        """Extract document summary from first paragraph or heading + intro."""
        lines = body.split("\n")
        summary_lines: list[str] = []

        for line in lines:
            stripped = line.strip()
            # Stop at first heading (after any initial heading)
            if stripped.startswith("## ") and summary_lines:
                break
            # Capture the title heading and first paragraph
            if stripped.startswith("# ") or stripped:
                summary_lines.append(stripped)
            elif summary_lines and not stripped:
                # Empty line after content — include if we haven't gotten much
                if _estimate_tokens("\n".join(summary_lines)) < 100:
                    summary_lines.append("")
                else:
                    break

        summary = "\n".join(summary_lines).strip()
        # Cap at ~300 tokens
        words = summary.split()
        if len(words) > 230:
            summary = " ".join(words[:230]) + "..."
        return summary

    def _split_by_headings(self, body: str, target_level: int = 2) -> list[Section]:
        """Split content by markdown headings at the target level."""
        pattern = re.compile(r"^(#{" + str(target_level) + r"})\s+(.+)$", re.MULTILINE)

        sections: list[Section] = []
        matches = list(pattern.finditer(body))

        if not matches:
            # No headings at target level — treat entire body as one section
            if body.strip():
                sections.append(Section(
                    heading="[Main]",
                    level=target_level,
                    content=body.strip(),
                ))
            return sections

        # Content before first heading
        pre_content = body[:matches[0].start()].strip()
        if pre_content and _estimate_tokens(pre_content) >= self.min_chunk_tokens:
            sections.append(Section(
                heading="[Preamble]",
                level=target_level,
                content=pre_content,
            ))

        for i, match in enumerate(matches):
            heading = match.group(2).strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
            content = body[start:end].strip()

            if content and _estimate_tokens(content) >= self.min_chunk_tokens:
                sections.append(Section(
                    heading=heading,
                    level=target_level,
                    content=content,
                    start_line=body[:match.start()].count("\n"),
                ))

        return sections

    def _split_paragraphs(self, text: str) -> list[str]:
        """Split text into paragraphs, keeping code blocks intact."""
        # Split on double newlines, preserving code blocks
        parts: list[str] = []
        current: list[str] = []
        in_code_block = False

        for line in text.split("\n"):
            if line.strip().startswith("```"):
                in_code_block = not in_code_block
                current.append(line)
                if not in_code_block:
                    # End of code block — flush
                    parts.append("\n".join(current))
                    current = []
            elif not in_code_block and line.strip() == "" and current:
                parts.append("\n".join(current))
                current = []
            else:
                current.append(line)

        if current:
            parts.append("\n".join(current))

        # Merge very small paragraphs with their neighbors
        merged: list[str] = []
        for part in parts:
            if merged and _estimate_tokens(part) < self.min_chunk_tokens:
                merged[-1] = merged[-1] + "\n\n" + part
            else:
                merged.append(part)

        return [p.strip() for p in merged if p.strip()]


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~1.3 tokens per word for English/mixed content."""
    words = len(text.split())
    return int(words * 1.3)
