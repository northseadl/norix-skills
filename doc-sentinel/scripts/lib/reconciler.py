"""Reconciliation Plane — derive doc operations from git changes.

Event-driven architecture: git diff → ChangeEvent → Policy → ActionPlan.
Each action carries confidence, risk, and reason for Agent-consumable output.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from lib.registry import DocRegistry, ENGINE_DIR, CHANGE_LOG_FILE
from lib.identity import now_iso


# Read threshold from environment, fallback to default
SIGNIFICANCE_THRESHOLD = int(os.environ.get("DOC_SENTINEL_THRESHOLD", "5"))


class ActionType(Enum):
    UPDATE = "update"
    RENAME = "rename"
    ARCHIVE = "archive"
    CREATE = "create"
    NOOP = "noop"


class ActionRisk(Enum):
    STABLE = "stable"
    REVIEW = "review"


@dataclass
class DiffEntry:
    """A single entry from git diff --name-status."""
    status: str
    path: str
    old_path: str = ""
    similarity: int = 100

    @classmethod
    def parse_line(cls, line: str) -> DiffEntry | None:
        """Parse a single line from `git diff --name-status -M` output."""
        parts = line.split("\t")
        if len(parts) < 2:
            return None

        status_raw = parts[0].strip()
        status = status_raw[0]

        if status in ("R", "C") and len(parts) >= 3:
            similarity = int(status_raw[1:]) if len(status_raw) > 1 else 100
            return cls(status=status, old_path=parts[1], path=parts[2],
                       similarity=similarity)

        return cls(status=status, path=parts[1])


@dataclass
class PlanItem:
    """A planned document operation with confidence metadata."""
    action: ActionType
    risk: ActionRisk
    doc_id: str | None
    filepath: str
    reason: str
    confidence: float = 1.0
    details: dict[str, Any] = field(default_factory=dict)
    source_change: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "risk": self.risk.value,
            "doc_id": self.doc_id,
            "filepath": self.filepath,
            "reason": self.reason,
            "confidence": self.confidence,
            "details": self.details,
            "source_change": self.source_change,
        }


@dataclass
class ChangePlan:
    """Complete reconciliation plan."""
    since_commit: str
    head_commit: str
    diff_entries: list[DiffEntry] = field(default_factory=list)
    items: list[PlanItem] = field(default_factory=list)
    untracked_changes: list[str] = field(default_factory=list)
    timestamp: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "since_commit": self.since_commit,
            "head_commit": self.head_commit,
            "total_diffs": len(self.diff_entries),
            "total_items": len(self.items),
            "items_by_action": self._count_by_action(),
            "items": [item.to_dict() for item in self.items],
            "untracked_changes": self.untracked_changes,
            "timestamp": self.timestamp,
        }

    def _count_by_action(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in self.items:
            key = item.action.value
            counts[key] = counts.get(key, 0) + 1
        return counts

    def summary(self) -> str:
        """Human-readable summary."""
        lines = [
            f"Change Analysis: {self.since_commit[:8]}..{self.head_commit[:8]}",
            f"  Files changed: {len(self.diff_entries)}",
            f"  Plan items:    {len(self.items)}",
        ]
        for action_type, count in sorted(self._count_by_action().items()):
            icon = _ACTION_ICONS.get(action_type, "•")
            lines.append(f"    {icon} {action_type}: {count}")
        if self.untracked_changes:
            lines.append(f"  Untracked:     {len(self.untracked_changes)}")
        return "\n".join(lines)

    @property
    def stable_items(self) -> list[PlanItem]:
        return [i for i in self.items if i.risk == ActionRisk.STABLE]

    @property
    def review_items(self) -> list[PlanItem]:
        return [i for i in self.items if i.risk == ActionRisk.REVIEW]


_ACTION_ICONS = {
    "update": "📝", "rename": "🔄", "archive": "🗄️",
    "create": "✨", "noop": "·",
}


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
                  repo_root: Path, since_commit: str) -> list[PlanItem]:
    """Derive document plan items from a single diff entry."""
    items: list[PlanItem] = []

    if entry.status == "R":
        affected = registry.find_by_source(entry.old_path)
        for doc in affected:
            items.append(PlanItem(
                action=ActionType.RENAME,
                risk=ActionRisk.STABLE,
                doc_id=doc.doc_id,
                filepath=doc.filepath,
                reason=f"Source renamed: {entry.old_path} → {entry.path}",
                confidence=entry.similarity / 100.0,
                details={
                    "old_path": entry.old_path,
                    "new_path": entry.path,
                    "similarity": entry.similarity,
                },
                source_change=f"R{entry.similarity}\t{entry.old_path}\t{entry.path}",
            ))
        if not affected:
            items.append(PlanItem(
                action=ActionType.CREATE,
                risk=ActionRisk.REVIEW,
                doc_id=None,
                filepath="",
                reason=f"Renamed file has no tracking doc: {entry.path}",
                details={"source": entry.path, "origin": entry.old_path},
                source_change=f"R{entry.similarity}\t{entry.old_path}\t{entry.path}",
            ))

    elif entry.status == "D":
        affected = registry.find_by_source(entry.path)
        for doc in affected:
            remaining = [sp for sp in doc.source_paths if sp != entry.path]
            if not remaining:
                items.append(PlanItem(
                    action=ActionType.ARCHIVE,
                    risk=ActionRisk.STABLE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    reason=f"All source paths deleted: {entry.path}",
                    details={"deleted_source": entry.path},
                    source_change=f"D\t{entry.path}",
                ))
            else:
                items.append(PlanItem(
                    action=ActionType.UPDATE,
                    risk=ActionRisk.STABLE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    reason=f"Source deleted but other paths remain: {entry.path}",
                    details={"removed_source": entry.path,
                             "remaining_sources": remaining},
                    source_change=f"D\t{entry.path}",
                ))

    elif entry.status == "A":
        parent_doc = registry.find_parent_doc(entry.path)
        if parent_doc:
            items.append(PlanItem(
                action=ActionType.UPDATE,
                risk=ActionRisk.STABLE,
                doc_id=parent_doc.doc_id,
                filepath=parent_doc.filepath,
                reason=f"New file added in tracked directory: {entry.path}",
                details={"new_source": entry.path},
                source_change=f"A\t{entry.path}",
            ))
        else:
            items.append(PlanItem(
                action=ActionType.CREATE,
                risk=ActionRisk.REVIEW,
                doc_id=None,
                filepath="",
                reason=f"New file in untracked area: {entry.path}",
                details={"source": entry.path},
                source_change=f"A\t{entry.path}",
            ))

    elif entry.status == "M":
        affected = registry.find_by_source(entry.path)
        lines_changed = get_diff_stat(repo_root, entry.path, since_commit)

        for doc in affected:
            if lines_changed >= SIGNIFICANCE_THRESHOLD:
                items.append(PlanItem(
                    action=ActionType.UPDATE,
                    risk=ActionRisk.STABLE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    reason=f"Source modified ({lines_changed} lines): {entry.path}",
                    confidence=min(1.0, lines_changed / 50.0),
                    details={"modified_source": entry.path,
                             "lines_changed": lines_changed},
                    source_change=f"M\t{entry.path}",
                ))
            else:
                items.append(PlanItem(
                    action=ActionType.NOOP,
                    risk=ActionRisk.STABLE,
                    doc_id=doc.doc_id,
                    filepath=doc.filepath,
                    reason=f"Minor change ({lines_changed} lines < threshold {SIGNIFICANCE_THRESHOLD}): {entry.path}",
                    details={"modified_source": entry.path,
                             "lines_changed": lines_changed},
                    source_change=f"M\t{entry.path}",
                ))

    return items


def deduplicate_items(items: list[PlanItem]) -> list[PlanItem]:
    """Merge duplicate items for the same doc_id. Higher priority wins."""
    priority = {
        ActionType.ARCHIVE: 6, ActionType.RENAME: 5,
        ActionType.UPDATE: 2, ActionType.CREATE: 1, ActionType.NOOP: 0,
    }

    by_doc: dict[str | None, list[PlanItem]] = {}
    for item in items:
        key = item.doc_id or item.details.get("source", "")
        by_doc.setdefault(key, []).append(item)

    result: list[PlanItem] = []
    for _key, group in by_doc.items():
        if len(group) == 1:
            if group[0].action != ActionType.NOOP:
                result.append(group[0])
        else:
            group.sort(key=lambda a: priority.get(a.action, 0), reverse=True)
            best = group[0]
            if best.action != ActionType.NOOP:
                for other in group[1:]:
                    for k, v in other.details.items():
                        if k not in best.details:
                            best.details[k] = v
                result.append(best)

    return sorted(result, key=lambda a: (a.doc_id or "", a.action.value))


# ─── Full Reconciliation ─────────────────────────────────────────────

def reconcile(repo_root: Path, since_commit: str | None = None) -> ChangePlan:
    """Analyze all changes since last sync and generate a reconciliation plan."""
    from lib.identity import get_head_commit

    head = get_head_commit(repo_root)

    if since_commit is None:
        since_commit = DocRegistry.get_last_sync_commit(repo_root) or ""

    if not since_commit:
        return ChangePlan(
            since_commit="(initial)",
            head_commit=head,
            timestamp=now_iso(),
        )

    diff_entries = get_diff_entries(repo_root, since_commit, head)

    registry = DocRegistry.load(repo_root)
    if registry is None:
        registry = DocRegistry.scan(repo_root)

    all_items: list[PlanItem] = []
    untracked: list[str] = []

    for entry in diff_entries:
        entry_items = analyze_entry(entry, registry, repo_root, since_commit)
        if not entry_items:
            untracked.append(f"{entry.status}\t{entry.path}")
        else:
            all_items.extend(entry_items)

    items = deduplicate_items(all_items)

    return ChangePlan(
        since_commit=since_commit,
        head_commit=head,
        diff_entries=diff_entries,
        items=items,
        untracked_changes=untracked,
        timestamp=now_iso(),
    )


def save_change_plan(repo_root: Path, plan: ChangePlan) -> Path:
    """Persist change plan to .doc-sentinel/change_log.json."""
    engine_dir = repo_root / ENGINE_DIR
    engine_dir.mkdir(parents=True, exist_ok=True)

    log_path = engine_dir / CHANGE_LOG_FILE
    existing: list[dict] = []
    if log_path.is_file():
        try:
            existing = json.loads(log_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = []

    existing.append(plan.to_dict())
    if len(existing) > 50:
        existing = existing[-50:]

    log_path.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return log_path
