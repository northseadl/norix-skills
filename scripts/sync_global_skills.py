#!/usr/bin/env python3
"""Sync norix-skills repository into global skill directories.

Supports two targets with different sync strategies:
  - Antigravity: full rsync (physical copy) — symlinks not followed by scanner
  - Codex: SKILL.md materialized + other entries symlinked — for fast dev iteration

Design goals:
  1. SAFETY — Only manage skills that originate from norix-skills.
     A persistent manifest (.norix-manifest.json) tracks managed skills.
     Skills installed from other sources are NEVER touched.

  2. RENAME SUPPORT — When a skill in norix-skills is renamed, the old
     copy is detected (its manifest entry's source_path no longer exists)
     and cleaned up automatically.

  3. IDEMPOTENCY — Running the script multiple times produces the same result.

Usage:
  python3 scripts/sync_global_skills.py [--dry-run] [--verbose]
  python3 scripts/sync_global_skills.py --target antigravity
  python3 scripts/sync_global_skills.py --target codex
  python3 scripts/sync_global_skills.py --target all --force
"""

from __future__ import annotations

import argparse
import filecmp
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


MANIFEST_FILENAME = ".norix-manifest.json"
MANIFEST_VERSION = 1
IGNORE_NAMES = {".DS_Store", "__pycache__", ".git", "node_modules", ".venv"}


# ─── Data Structures ────────────────────────────────────────────────

@dataclass
class ManagedSkill:
    """A skill entry tracked in the manifest."""
    source_path: str          # Resolved absolute path in norix-skills repo
    synced_at: str            # ISO 8601 timestamp of last sync

    def to_dict(self) -> dict:
        return {"source_path": self.source_path, "synced_at": self.synced_at}

    @classmethod
    def from_dict(cls, d: dict) -> ManagedSkill:
        return cls(source_path=d["source_path"], synced_at=d.get("synced_at", ""))


@dataclass
class Manifest:
    """Persistent tracking state for norix-managed skills."""
    version: int = MANIFEST_VERSION
    source_repo: str = ""
    managed_skills: dict[str, ManagedSkill] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "source_repo": self.source_repo,
            "managed_skills": {
                name: skill.to_dict()
                for name, skill in sorted(self.managed_skills.items())
            },
        }

    @classmethod
    def from_dict(cls, d: dict) -> Manifest:
        m = cls()
        m.version = d.get("version", MANIFEST_VERSION)
        m.source_repo = d.get("source_repo", "")
        m.managed_skills = {
            name: ManagedSkill.from_dict(entry)
            for name, entry in d.get("managed_skills", {}).items()
        }
        return m


@dataclass
class SyncStats:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ─── Manifest I/O ───────────────────────────────────────────────────

def load_manifest(target_dir: Path) -> Manifest:
    manifest_path = target_dir / MANIFEST_FILENAME
    if not manifest_path.is_file():
        return Manifest()
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return Manifest.from_dict(data)
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"⚠️  Corrupt manifest, starting fresh: {e}", file=sys.stderr)
        return Manifest()


def save_manifest(target_dir: Path, manifest: Manifest, dry_run: bool) -> None:
    if dry_run:
        return
    manifest_path = target_dir / MANIFEST_FILENAME
    manifest_path.write_text(
        json.dumps(manifest.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ─── Source Discovery ────────────────────────────────────────────────

def discover_source_skills(repo_root: Path) -> dict[str, Path]:
    """Find all valid skill directories in the source repo.

    Returns: {skill_name: resolved_path}
    """
    skills: dict[str, Path] = {}
    for child in sorted(repo_root.iterdir(), key=lambda p: p.name):
        if child.name.startswith("."):
            continue
        if not child.is_dir():
            continue
        if (child / "SKILL.md").is_file():
            skills[child.name] = child.resolve(strict=False)
    return skills


# ─── Sync Strategies ─────────────────────────────────────────────────

def rsync_skill(source_dir: Path, target_dir: Path, verbose: bool) -> None:
    """Full physical copy via rsync --delete. Used for Antigravity."""
    excludes = list(IGNORE_NAMES) + ["*.pyc"]
    cmd = ["rsync", "-a", "--delete"]
    for pattern in excludes:
        cmd.extend(["--exclude", pattern])
    if verbose:
        cmd.append("-v")
    cmd.extend([f"{source_dir}/", f"{target_dir}/"])
    subprocess.run(cmd, check=True, capture_output=not verbose)


def symlink_skill(source_dir: Path, target_dir: Path, verbose: bool) -> None:
    """Materialize SKILL.md + symlink other entries. Used for Codex.

    Codex scanners can read symlinked content but need SKILL.md as a
    real file. Other entries (scripts/, references/, etc.) are symlinked
    for zero-copy development iteration.
    """
    # Ensure target directory exists as a real directory
    target_dir.mkdir(parents=True, exist_ok=True)

    # Collect current entries in target for pruning
    existing_entries = {
        e.name for e in target_dir.iterdir() if e.name not in IGNORE_NAMES
    }
    source_entries: set[str] = set()

    for entry in sorted(source_dir.iterdir(), key=lambda p: p.name):
        if entry.name in IGNORE_NAMES:
            continue
        source_entries.add(entry.name)
        dst = target_dir / entry.name

        if entry.name == "SKILL.md":
            # Materialize: copy as real file
            _materialize_file(entry, dst, verbose)
        else:
            # Symlink: point to source
            _ensure_symlink(entry, dst, verbose)

    # Prune stale entries not in source
    for stale_name in existing_entries - source_entries:
        stale_path = target_dir / stale_name
        if verbose:
            log(f"  [prune] {stale_name}")
        _remove_path(stale_path)


def _materialize_file(src: Path, dst: Path, verbose: bool) -> None:
    """Copy a file, replacing symlinks/stale copies."""
    if dst.exists() and not dst.is_symlink():
        if dst.is_file() and filecmp.cmp(src, dst, shallow=False):
            return  # Already identical
    if dst.exists() or dst.is_symlink():
        _remove_path(dst)
    shutil.copy2(src, dst)
    if verbose:
        log(f"  [copy] {dst.name}")


def _ensure_symlink(src: Path, dst: Path, verbose: bool) -> None:
    """Create or update a symlink to source."""
    src_resolved = src.resolve(strict=False)
    if dst.is_symlink():
        current = dst.resolve(strict=False)
        if current == src_resolved:
            return  # Already correct
        dst.unlink()
    elif dst.exists():
        _remove_path(dst)

    dst.symlink_to(src_resolved, target_is_directory=src.is_dir())
    if verbose:
        log(f"  [link] {dst.name} → {src_resolved}")


def _remove_path(path: Path) -> None:
    """Remove a file, symlink, or directory tree."""
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


# ─── Content Comparison ─────────────────────────────────────────────

def skill_needs_update(source_dir: Path, target_dir: Path) -> bool:
    """Quick check: does the target need updating?

    Compares SKILL.md mtime as a fast heuristic.
    """
    src_skill = source_dir / "SKILL.md"
    dst_skill = target_dir / "SKILL.md"

    if not dst_skill.is_file():
        return True

    try:
        src_stat = src_skill.stat()
        dst_stat = dst_skill.stat()
    except OSError:
        return True

    if src_stat.st_size != dst_stat.st_size:
        return True

    if int(src_stat.st_mtime) != int(dst_stat.st_mtime):
        return True

    return False


# ─── Core Sync Logic ────────────────────────────────────────────────

def sync_skills(
    repo_root: Path,
    target_dir: Path,
    strategy: str,
    dry_run: bool = False,
    force: bool = False,
    verbose: bool = False,
) -> SyncStats:
    """Sync all skills from repo to target using the specified strategy.

    Args:
        strategy: "rsync" (full copy) or "symlink" (SKILL.md copy + symlink)
    """
    stats = SyncStats()
    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    sync_fn = rsync_skill if strategy == "rsync" else symlink_skill

    # Phase 0: ensure target directory exists
    if not target_dir.is_dir():
        if not dry_run:
            target_dir.mkdir(parents=True, exist_ok=True)
        log(f"📁 Created target directory: {target_dir}", verbose)

    # Phase 1: load manifest & discover source skills
    manifest = load_manifest(target_dir)
    manifest.source_repo = str(repo_root)
    source_skills = discover_source_skills(repo_root)

    log(f"📦 Source repo: {repo_root}", verbose)
    log(f"🎯 Target dir: {target_dir}", verbose)
    log(f"🔧 Strategy: {strategy}", verbose)
    log(f"🔍 Discovered {len(source_skills)} skills in source", verbose)
    log(f"📋 Manifest tracks {len(manifest.managed_skills)} managed skills", verbose)

    # Phase 2: detect and remove orphaned managed skills
    orphaned_names: list[str] = []
    for managed_name, managed_entry in manifest.managed_skills.items():
        source_path = Path(managed_entry.source_path)
        if not source_path.is_dir() or not (source_path / "SKILL.md").is_file():
            orphaned_names.append(managed_name)

    for orphan_name in orphaned_names:
        orphan_dir = target_dir / orphan_name
        log(f"🗑️  Removing orphaned skill: {orphan_name}", True)
        stats.removed.append(orphan_name)
        if not dry_run:
            _remove_path(orphan_dir)
            del manifest.managed_skills[orphan_name]

    # Phase 3: sync each source skill
    for skill_name, source_path in source_skills.items():
        skill_target = target_dir / skill_name
        source_str = str(source_path)

        # Detect renames: same source_path but different directory name
        old_names = [
            name for name, entry in manifest.managed_skills.items()
            if entry.source_path == source_str and name != skill_name
        ]
        for old_name in old_names:
            old_dir = target_dir / old_name
            log(f"🔄 Skill renamed: {old_name} → {skill_name}", True)
            stats.removed.append(old_name)
            if not dry_run:
                _remove_path(old_dir)
                if old_name in manifest.managed_skills:
                    del manifest.managed_skills[old_name]

        # Decide: create / update / skip
        is_new = not skill_target.is_dir()

        if is_new:
            log(f"✨ Creating skill: {skill_name}", True)
            stats.created.append(skill_name)
            if not dry_run:
                skill_target.mkdir(parents=True, exist_ok=True)
                sync_fn(source_path, skill_target, verbose)
                manifest.managed_skills[skill_name] = ManagedSkill(
                    source_path=source_str, synced_at=now_iso,
                )
        elif force or skill_needs_update(source_path, skill_target):
            log(f"🔁 Updating skill: {skill_name}", True)
            stats.updated.append(skill_name)
            if not dry_run:
                sync_fn(source_path, skill_target, verbose)
                manifest.managed_skills[skill_name] = ManagedSkill(
                    source_path=source_str, synced_at=now_iso,
                )
        else:
            log(f"✅ Unchanged: {skill_name}", verbose)
            stats.unchanged.append(skill_name)
            if skill_name not in manifest.managed_skills:
                manifest.managed_skills[skill_name] = ManagedSkill(
                    source_path=source_str, synced_at=now_iso,
                )

    # Phase 4: persist manifest
    save_manifest(target_dir, manifest, dry_run)

    return stats


# ─── Helpers ─────────────────────────────────────────────────────────

def log(message: str, show: bool = True) -> None:
    if show:
        print(message)


def resolve_path(path: Path) -> Path:
    return Path(os.path.expanduser(str(path))).resolve(strict=False)


def detect_dir(candidates: list[Path]) -> Path:
    """Find first existing directory from candidates, or first with existing parent."""
    for c in candidates:
        if c.exists():
            return c
    for c in candidates:
        if c.parent.exists():
            return c
    return candidates[0]


def default_antigravity_dir() -> Path:
    home = Path.home()
    return detect_dir([
        home / ".gemini" / "antigravity" / "skills",
        home / ".antigravity" / "skills",
    ])


def default_codex_dir() -> Path:
    codex_home = os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))
    return Path(codex_home) / "skills"


# ─── Target Configuration ───────────────────────────────────────────

@dataclass
class TargetConfig:
    name: str
    path: Path
    strategy: str  # "rsync" or "symlink"


def resolve_targets(target_choice: str, ag_dir: Path, codex_dir: Path) -> list[TargetConfig]:
    targets = []
    if target_choice in ("antigravity", "all"):
        targets.append(TargetConfig("antigravity", ag_dir, "rsync"))
    if target_choice in ("codex", "all"):
        targets.append(TargetConfig("codex", codex_dir, "symlink"))
    return targets


# ─── CLI ─────────────────────────────────────────────────────────────

def build_parser(default_repo: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Sync norix-skills repository into global skill directories.\n\n"
            "Supports Antigravity (full rsync) and Codex (SKILL.md copy + symlink).\n"
            "Only manages skills originating from the source repo.\n"
            "Skills installed from other sources are NEVER touched."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--target",
        choices=["antigravity", "codex", "all"],
        default="all",
        help="Sync destination (default: all)",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=default_repo,
        help=f"norix-skills repository root (default: {default_repo})",
    )
    parser.add_argument(
        "--antigravity-dir",
        type=Path,
        default=default_antigravity_dir(),
        help="Antigravity global skills directory",
    )
    parser.add_argument(
        "--codex-dir",
        type=Path,
        default=default_codex_dir(),
        help="Codex global skills directory",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force update all skills regardless of change detection",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned operations without making changes",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output including unchanged skills",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show current manifest status for all targets and exit",
    )
    return parser


def show_status(targets: list[TargetConfig]) -> int:
    """Display current manifest status for all targets."""
    for tc in targets:
        print(f"\n{'='*60}")
        print(f"📎 {tc.name.upper()} ({tc.path})")
        print(f"   Strategy: {tc.strategy}")
        print(f"{'='*60}")

        if not tc.path.is_dir():
            print("   ⚠️  Directory does not exist")
            continue

        manifest = load_manifest(tc.path)
        if not manifest.managed_skills:
            print("   📋 No managed skills in manifest")
            continue

        print(f"   📋 Source repo: {manifest.source_repo}")
        print(f"   📋 Managed: {len(manifest.managed_skills)}")
        print()

        all_dirs = sorted(
            d.name for d in tc.path.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        )
        managed_names = set(manifest.managed_skills.keys())

        for name in all_dirs:
            if name in managed_names:
                entry = manifest.managed_skills[name]
                source_exists = Path(entry.source_path).is_dir()
                icon = "✅" if source_exists else "⚠️  (source missing)"
                print(f"  {icon} {name}  ← norix-skills  [synced: {entry.synced_at[:19]}]")
            else:
                print(f"  🔒 {name}  ← other (not managed)")

    return 0


def print_summary(label: str, stats: SyncStats, dry_run: bool) -> None:
    prefix = "[DRY RUN] " if dry_run else ""
    parts = []
    if stats.created:
        parts.append(f"✨ created: {len(stats.created)}")
    if stats.updated:
        parts.append(f"🔁 updated: {len(stats.updated)}")
    if stats.removed:
        parts.append(f"🗑️  removed: {len(stats.removed)}")
    if stats.unchanged:
        parts.append(f"✅ unchanged: {len(stats.unchanged)}")
    if stats.errors:
        parts.append(f"❌ errors: {len(stats.errors)}")

    if not parts:
        print(f"  {prefix}{label}: nothing to do")
    else:
        print(f"  {prefix}{label}: {' | '.join(parts)}")


def main() -> int:
    script_path = Path(__file__).resolve(strict=False)
    default_repo = script_path.parent.parent
    parser = build_parser(default_repo=default_repo)
    args = parser.parse_args()

    repo_root = resolve_path(args.repo_root)
    ag_dir = resolve_path(args.antigravity_dir)
    codex_dir = resolve_path(args.codex_dir)
    targets = resolve_targets(args.target, ag_dir, codex_dir)

    if args.status:
        return show_status(targets)

    if not repo_root.is_dir():
        print(f"❌ Repository root does not exist: {repo_root}", file=sys.stderr)
        return 2

    source_skills = discover_source_skills(repo_root)
    if not source_skills:
        print(f"❌ No skills found under {repo_root}", file=sys.stderr)
        return 2

    if args.dry_run:
        print("🔍 DRY RUN — no changes will be made\n")

    has_error = False
    for tc in targets:
        print(f"\n{'─'*50}")
        print(f"🎯 Syncing to {tc.name.upper()} ({tc.path})")
        print(f"{'─'*50}")
        try:
            stats = sync_skills(
                repo_root=repo_root,
                target_dir=tc.path,
                strategy=tc.strategy,
                dry_run=args.dry_run,
                force=args.force,
                verbose=args.verbose,
            )
            print_summary(tc.name, stats, args.dry_run)
        except subprocess.CalledProcessError as e:
            print(f"❌ rsync failed for {tc.name}: {e}", file=sys.stderr)
            has_error = True
        except (OSError, RuntimeError) as e:
            print(f"❌ Sync error for {tc.name}: {e}", file=sys.stderr)
            has_error = True

    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
