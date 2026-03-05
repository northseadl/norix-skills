"""Git Diff Change Analyzer — derive doc operations from code changes.

Parses `git diff --name-status -M` output and maps each file change
to a document-level operation (UPDATE, RENAME, ARCHIVE, CREATE, etc.).
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from lib.registry import DocRegistry
from lib.traceback import now_iso


class DocAction(Enum):
    UPDATE = "update"         # Source modified → doc content may need refresh
    RENAME = "rename"         # Source renamed → update source_paths + references
    RELOCATE = "relocate"     # Directory moved → cascade doc_id + source_paths
    MERGE = "merge"           # Multiple sources merged → consider merging docs
    SPLIT = "split"           # Source split into multiple → consider splitting doc
    ARCHIVE = "archive"       # All sources deleted → archive the doc
    CREATE = "create"         # New source with no tracking doc → may need new doc
    NOOP = "noop"             # Change doesn't affect documentation


@dataclass
class DiffEntry:
    """A single entry from git diff --name-status."""
    status: str               # A, M, D, R, C, T
    path: str                 # Current path (new path for renames)
    old_path: str = ""        # Original path (for renames/copies)
    similarity: int = 100     # Rename similarity percentage

    @classmethod
    def parse_line(cls, line: str) -> DiffEntry | None:
        """Parse a single line from `git diff --name-status -M` output."""
        parts = line.split("\t")
        if len(parts) < 2:
            return None

        status_raw = parts[0].strip()
        status = status_raw[0]  # R100 → R, C080 → C

        if status in ("R", "C") and len(parts) >= 3:
            similarity = int(status_raw[1:]) if len(status_raw) > 1 else 100
            return cls(status=status, old_path=parts[1], path=parts[2],
                       similarity=similarity)

        return cls(status=status, path=parts[1])


@dataclass
class ActionItem:
    """A planned document operation."""
    action: DocAction
    doc_id: str | None        # Affected doc (None for CREATE)
    filepath: str             # Affected doc filepath (empty for CREATE)
    details: dict[str, Any] = field(default_factory=dict)
    source_change: str = ""   # The git diff entry that triggered this

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "doc_id": self.doc_id,
            "filepath": self.filepath,
            "details": self.details,
            "source_change": self.source_change,
        }


@dataclass
class ChangeReport:
    """Complete analysis of changes since last sync."""
    since_commit: str
    head_commit: str
    diff_entries: list[DiffEntry] = field(default_factory=list)
    actions: list[ActionItem] = field(default_factory=list)
    untracked_changes: list[str] = field(default_factory=list)
    analysis_timestamp: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "since_commit": self.since_commit,
            "head_commit": self.head_commit,
            "total_diffs": len(self.diff_entries),
            "total_actions": len(self.actions),
            "actions_by_type": self._count_by_type(),
            "actions": [a.to_dict() for a in self.actions],
            "untracked_changes": self.untracked_changes,
            "analysis_timestamp": self.analysis_timestamp,
        }

    def _count_by_type(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in self.actions:
            key = a.action.value
            counts[key] = counts.get(key, 0) + 1
        return counts

    def summary(self) -> str:
        """Human-readable summary."""
        lines = [
            f"Change Analysis: {self.since_commit[:8]}..{self.head_commit[:8]}",
            f"  Files changed: {len(self.diff_entries)}",
            f"  Doc actions:   {len(self.actions)}",
        ]
        for action_type, count in sorted(self._count_by_type().items()):
            icon = _ACTION_ICONS.get(action_type, "•")
            lines.append(f"    {icon} {action_type}: {count}")
        if self.untracked_changes:
            lines.append(f"  Untracked:     {len(self.untracked_changes)}")
        return "\n".join(lines)


_ACTION_ICONS = {
    "update": "📝",
    "rename": "🔄",
    "relocate": "📦",
    "archive": "🗄️",
    "create": "✨",
    "merge": "🔀",
    "split": "✂️",
    "noop": "·",
}

# Minimum lines changed to trigger an UPDATE action
SIGNIFICANCE_THRESHOLD = 5


# ─── Core Analysis ────────────────────────────────────────────────────

def get_diff_entries(repo_root: Path, since_commit: str,
                     head: str = "HEAD") -> list[DiffEntry]:
    """Get all diff entries between two commits."""
    result = subprocess.run(
        ["git", "diff", "--name-status", "-M", since_commit, head],
        capture_output=True, text=True, cwd=repo_root,
    )
    if result.returncode != 0:
        return []

    entries = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        entry = DiffEntry.parse_line(line)
        if entry:
            entries.append(entry)
    return entries


def get_diff_stat(repo_root: Path, filepath: str,
                  since_commit: str, head: str = "HEAD") -> int:
    """Get number of lines changed for a specific file."""
    result = subprocess.run(
        ["git", "diff", "--numstat", since_commit, head, "--", filepath],
        capture_output=True, text=True, cwd=repo_root,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return 0
    parts = result.stdout.strip().split("\t")
    if len(parts) >= 2:
        added = int(parts[0]) if parts[0] != "-" else 0
        deleted = int(parts[1]) if parts[1] != "-" else 0
        return added + deleted
    return 0


def analyze_entry(entry: DiffEntry, registry: DocRegistry,
                  repo_root: Path, since_commit: str) -> list[ActionItem]:
    """Derive document actions from a single diff entry."""
    actions: list[ActionItem] = []

    if entry.status == "R":
        # Rename — update source_paths in all tracking docs
        affected = registry.find_by_source(entry.old_path)
        for doc in affected:
            actions.append(ActionItem(
                action=DocAction.RENAME,
                doc_id=doc.doc_id,
                filepath=doc.filepath,
                details={
                    "old_path": entry.old_path,
                    "new_path": entry.path,
                    "similarity": entry.similarity,
                },
                source_change=f"R{entry.similarity}\t{entry.old_path}\t{entry.path}",
            ))
        if not affected:
            # Renamed into an untracked area — might need new doc
            actions.append(ActionItem(
                action=DocAction.CREATE,
                doc_id=None,
                filepath="",
                details={"source": entry.path, "reason": "renamed_untracked"},
                source_change=f"R{entry.similarity}\t{entry.old_path}\t{entry.path}",
            ))

    elif entry.status == "D":
        # Delete — check if all sources for a doc are gone
        affected = registry.find_by_source(entry.path)
        for doc in affected:
            remaining = [sp for sp in doc.source_paths if sp != entry.path]
            if not remaining:
                actions.append(ActionItem(
                    action=DocAction.ARCHIVE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    details={"deleted_source": entry.path},
                    source_change=f"D\t{entry.path}",
                ))
            else:
                actions.append(ActionItem(
                    action=DocAction.UPDATE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    details={"removed_source": entry.path,
                             "remaining_sources": remaining},
                    source_change=f"D\t{entry.path}",
                ))

    elif entry.status == "A":
        # Add — check if it's in a tracked directory
        parent_doc = registry.find_parent_doc(entry.path)
        if parent_doc:
            actions.append(ActionItem(
                action=DocAction.UPDATE,
                doc_id=parent_doc.doc_id,
                filepath=parent_doc.filepath,
                details={"new_source": entry.path},
                source_change=f"A\t{entry.path}",
            ))
        else:
            # New file in untracked area
            actions.append(ActionItem(
                action=DocAction.CREATE,
                doc_id=None,
                filepath="",
                details={"source": entry.path, "reason": "new_file"},
                source_change=f"A\t{entry.path}",
            ))

    elif entry.status == "M":
        # Modify — only trigger UPDATE if change is significant
        affected = registry.find_by_source(entry.path)
        lines_changed = get_diff_stat(repo_root, entry.path, since_commit)

        for doc in affected:
            if lines_changed >= SIGNIFICANCE_THRESHOLD:
                actions.append(ActionItem(
                    action=DocAction.UPDATE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    details={"modified_source": entry.path,
                             "lines_changed": lines_changed},
                    source_change=f"M\t{entry.path}",
                ))
            else:
                actions.append(ActionItem(
                    action=DocAction.NOOP,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    details={"modified_source": entry.path,
                             "lines_changed": lines_changed,
                             "reason": "below_threshold"},
                    source_change=f"M\t{entry.path}",
                ))

    return actions


def deduplicate_actions(actions: list[ActionItem]) -> list[ActionItem]:
    """Merge duplicate actions for the same doc_id.

    Priority: ARCHIVE > RENAME > RELOCATE > UPDATE > CREATE > NOOP
    """
    priority = {
        DocAction.ARCHIVE: 6,
        DocAction.RENAME: 5,
        DocAction.RELOCATE: 4,
        DocAction.MERGE: 3,
        DocAction.UPDATE: 2,
        DocAction.CREATE: 1,
        DocAction.NOOP: 0,
    }

    by_doc: dict[str | None, list[ActionItem]] = {}
    for a in actions:
        key = a.doc_id or a.details.get("source", "")
        by_doc.setdefault(key, []).append(a)

    result: list[ActionItem] = []
    for key, group in by_doc.items():
        if len(group) == 1:
            if group[0].action != DocAction.NOOP:
                result.append(group[0])
        else:
            # Keep highest priority action, merge details
            group.sort(key=lambda a: priority.get(a.action, 0), reverse=True)
            best = group[0]
            if best.action != DocAction.NOOP:
                # Merge details from lower-priority actions
                for other in group[1:]:
                    for k, v in other.details.items():
                        if k not in best.details:
                            best.details[k] = v
                result.append(best)

    return sorted(result, key=lambda a: (a.doc_id or "", a.action.value))


# ─── Full Analysis ────────────────────────────────────────────────────

def full_analysis(repo_root: Path, since_commit: str | None = None) -> ChangeReport:
    """Analyze all changes since last sync and generate operation plan."""
    from lib.traceback import get_head_commit

    head = get_head_commit(repo_root)

    if since_commit is None:
        since_commit = DocRegistry.get_last_sync_commit(repo_root) or ""

    if not since_commit:
        # First run — no previous sync point
        return ChangeReport(
            since_commit="(initial)",
            head_commit=head,
            analysis_timestamp=now_iso(),
        )

    # Get diff entries
    diff_entries = get_diff_entries(repo_root, since_commit, head)

    # Load or scan registry
    registry = DocRegistry.load(repo_root)
    if registry is None:
        registry = DocRegistry.scan(repo_root)

    # Analyze each entry
    all_actions: list[ActionItem] = []
    untracked: list[str] = []

    for entry in diff_entries:
        entry_actions = analyze_entry(entry, registry, repo_root, since_commit)
        if not entry_actions:
            untracked.append(f"{entry.status}\t{entry.path}")
        else:
            all_actions.extend(entry_actions)

    # Deduplicate
    actions = deduplicate_actions(all_actions)

    return ChangeReport(
        since_commit=since_commit,
        head_commit=head,
        diff_entries=diff_entries,
        actions=actions,
        untracked_changes=untracked,
        analysis_timestamp=now_iso(),
    )


def save_change_report(repo_root: Path, report: ChangeReport) -> Path:
    """Persist change report to .doc-engine/change_log.json."""
    from lib.registry import ENGINE_DIR, CHANGE_LOG_FILE

    engine_dir = repo_root / ENGINE_DIR
    engine_dir.mkdir(parents=True, exist_ok=True)

    log_path = engine_dir / CHANGE_LOG_FILE

    # Append to existing log
    existing: list[dict] = []
    if log_path.is_file():
        try:
            existing = json.loads(log_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = []

    existing.append(report.to_dict())

    # Keep last 50 entries
    if len(existing) > 50:
        existing = existing[-50:]

    log_path.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return log_path
