#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Doc Sentinel — document-code change notification system.

Four commands that map to Agent intentions:
  sentinel.py status  — What's the current state? (read-only, zero side-effects)
  sentinel.py bind    — Bind a document to source code
  sentinel.py plan    — What changed? Generate a reconciliation plan
  sentinel.py apply   — Execute a plan (idempotent)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from lib.identity import (
    DocMeta,
    compute_source_hash,
    format_frontmatter,
    get_head_commit,
    inject_frontmatter,
    now_iso,
    parse_frontmatter,
)
from lib.registry import DocRegistry


# ─── Commands ─────────────────────────────────────────────────────────

def cmd_status(args: argparse.Namespace) -> int:
    """Show document health status. Pure read-only, zero side-effects."""
    root = _resolve_root(args)

    registry = DocRegistry.load(root)
    if registry is None:
        registry = DocRegistry.scan(root)

    statuses = registry.check_staleness()

    if args.format == "json":
        report = registry.health_report()
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0

    total = len(statuses)
    if total == 0:
        print("📊 No traceable documents found.")
        print("   Use 'bind' to start tracking documents.")
        return 0

    icons = {
        "synced": "✅", "stale": "⚠️", "needs_review": "🔍",
        "draft": "📝", "source_missing": "❌",
    }

    counts: dict[str, int] = {}
    for s in statuses.values():
        counts[s] = counts.get(s, 0) + 1

    print("📊 Documentation Health Report")
    print(f"   Repository: {root}")
    print(f"   Documents:  {total}")
    print(f"   Synced:     {counts.get('synced', 0)}/{total} ({round(counts.get('synced', 0)/total*100)}%)")
    print()

    if args.doc:
        doc = registry.get(args.doc)
        if doc:
            status = statuses.get(args.doc, "unknown")
            icon = icons.get(status, "·")
            print(f"  {icon} {doc.doc_id}: {status}")
            print(f"     Sources: {', '.join(doc.source_paths)}")
            print(f"     File:    {doc.filepath}")
            print(f"     Hash:    {doc.source_tree_hash}")
        else:
            print(f"  ❌ Document not found: {args.doc}")
        return 0

    if args.source:
        docs = registry.find_by_source(args.source)
        if docs:
            print(f"  Documents tracking '{args.source}':")
            for doc in docs:
                status = statuses.get(doc.doc_id, "unknown")
                icon = icons.get(status, "·")
                print(f"    {icon} {doc.doc_id}: {status}")
        else:
            print(f"  No documents track '{args.source}'")
        return 0

    for doc_id, status in sorted(statuses.items()):
        icon = icons.get(status, "·")
        print(f"  {icon} {doc_id}: {status}")

    print(f"\n  Summary: ", end="")
    print(" | ".join(f"{k}: {v}" for k, v in sorted(counts.items())))

    return 0


def cmd_bind(args: argparse.Namespace) -> int:
    """Bind a document to source code by injecting/updating frontmatter."""
    root = _resolve_root(args)
    doc_path = Path(args.doc_path)

    if not doc_path.is_absolute():
        doc_path = root / doc_path

    if not doc_path.suffix == ".md":
        print(f"❌ Expected a .md file: {doc_path}", file=sys.stderr)
        return 1

    source_paths = args.source or []
    if not source_paths and args.auto_detect:
        doc_dir = doc_path.parent.relative_to(root)
        source_paths = [str(doc_dir)]

    if not source_paths:
        print("❌ No source paths specified. Use --source or --auto-detect.", file=sys.stderr)
        return 1

    try:
        doc_rel = doc_path.relative_to(root)
    except ValueError:
        doc_rel = doc_path

    doc_id = str(doc_rel).removesuffix(".md").replace("\\", "/")

    meta = {
        "doc_id": doc_id,
        "source_paths": source_paths,
        "source_tree_hash": compute_source_hash(root, source_paths),
        "last_sync_commit": get_head_commit(root),
        "sync_timestamp": now_iso(),
        "doc_version": 1,
        "status": "synced",
    }

    if doc_path.exists():
        content = doc_path.read_text(encoding="utf-8")
        existing_meta, _ = parse_frontmatter(content)
        if "doc_version" in existing_meta:
            meta["doc_version"] = existing_meta["doc_version"] + 1
        new_content = inject_frontmatter(content, meta)
    else:
        body = f"# {doc_id.split('/')[-1].replace('-', ' ').title()}\n\n> TODO: Document this module.\n"
        new_content = format_frontmatter(meta) + "\n" + body
        doc_path.parent.mkdir(parents=True, exist_ok=True)

    doc_path.write_text(new_content, encoding="utf-8")

    # Save to registry
    registry = DocRegistry.load(root) or DocRegistry.scan(root)
    registry.docs[doc_id] = DocMeta.from_dict(meta)
    registry.docs[doc_id].filepath = str(doc_path)
    registry.save(root)

    print(f"✅ Bound {doc_id}")
    print(f"   Sources: {', '.join(source_paths)}")
    print(f"   Hash:    {meta['source_tree_hash']}")
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    """Generate a reconciliation plan based on git changes."""
    from lib.reconciler import reconcile, save_change_plan

    root = _resolve_root(args)
    since = args.since or DocRegistry.get_last_sync_commit(root)

    if not since:
        print("ℹ️  No previous sync point. Establishing baseline...")
        head = get_head_commit(root)
        DocRegistry.save_last_sync_commit(root, head)
        print(f"   Sync point set to HEAD: {head[:8]}")
        print("   Run 'plan' again after new commits to detect changes.")
        return 0

    plan = reconcile(root, since)
    save_change_plan(root, plan)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(
            json.dumps(plan.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"📋 Plan written to {output_path}")

    if args.format == "json":
        print(json.dumps(plan.to_dict(), indent=2, ensure_ascii=False))
        return 0

    print(plan.summary())

    if plan.stable_items:
        print("\n📋 Stable actions (auto-executable):")
        for item in plan.stable_items:
            icon = {"update": "📝", "rename": "🔄", "archive": "🗄️",
                    "create": "✨"}.get(item.action.value, "·")
            target = item.doc_id or item.details.get("source", "?")
            print(f"  {icon} {item.action.value.upper()} → {target}")
            print(f"     Reason: {item.reason}")

    if plan.review_items:
        print("\n🔍 Review items (need confirmation):")
        for item in plan.review_items:
            target = item.doc_id or item.details.get("source", "?")
            print(f"  ⚠️  {item.action.value.upper()} → {target}")
            print(f"     Reason: {item.reason}")

    if plan.untracked_changes:
        print(f"\n📌 Untracked changes: {len(plan.untracked_changes)}")
        for uc in plan.untracked_changes[:10]:
            print(f"  · {uc}")

    print(f"\nRun 'apply' to execute stable actions. Use 'apply --dry-run' to preview.")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    """Execute the reconciliation plan. Idempotent."""
    from lib.reconciler import reconcile

    root = _resolve_root(args)
    dry_run = args.dry_run

    since = DocRegistry.get_last_sync_commit(root)
    if not since:
        print("⚠️  No sync point. Run 'plan' first.")
        return 1

    plan = reconcile(root, since)

    executable = plan.stable_items
    if not executable:
        print("✅ No actions to apply.")
        return 0

    prefix = "[DRY-RUN] " if dry_run else ""
    applied = 0
    skipped = 0

    for item in executable:
        if item.action.value == "rename":
            old_path = item.details.get("old_path", "")
            new_path = item.details.get("new_path", "")
            if item.filepath and Path(item.filepath).is_file():
                print(f"{prefix}🔄 RENAME in {item.doc_id}: {old_path} → {new_path}")
                if not dry_run:
                    _update_source_path(Path(item.filepath), old_path, new_path)
                applied += 1
            else:
                skipped += 1

        elif item.action.value == "archive":
            if item.filepath and Path(item.filepath).is_file():
                print(f"{prefix}🗄️  ARCHIVE {item.doc_id}")
                if not dry_run:
                    _set_doc_status(Path(item.filepath), "archived")
                applied += 1
            else:
                skipped += 1

        elif item.action.value == "update":
            if item.doc_id:
                print(f"{prefix}📝 UPDATE (mark stale) {item.doc_id}")
                if not dry_run and item.filepath and Path(item.filepath).is_file():
                    _set_doc_status(Path(item.filepath), "stale")
                applied += 1
            else:
                skipped += 1

    if not dry_run:
        head = get_head_commit(root)
        DocRegistry.save_last_sync_commit(root, head)
        print(f"\n✅ Applied: {applied} | Skipped: {skipped} | Sync point: {head[:8]}")
    else:
        print(f"\n🔍 Would apply: {applied} | Would skip: {skipped}")

    return 0


# ─── Helpers ──────────────────────────────────────────────────────────

def _resolve_root(args: argparse.Namespace) -> Path:
    root = Path(args.root).resolve() if hasattr(args, "root") and args.root else Path.cwd()
    if not (root / ".git").exists():
        print(f"⚠️  {root} is not a git repository.", file=sys.stderr)
    return root


def _update_source_path(filepath: Path, old_path: str, new_path: str) -> None:
    content = filepath.read_text(encoding="utf-8")
    meta, _ = parse_frontmatter(content)
    source_paths = meta.get("source_paths", [])
    if isinstance(source_paths, list):
        meta["source_paths"] = [new_path if sp == old_path else sp for sp in source_paths]
    meta["sync_timestamp"] = now_iso()
    meta["doc_version"] = meta.get("doc_version", 0) + 1
    filepath.write_text(inject_frontmatter(content, meta), encoding="utf-8")


def _set_doc_status(filepath: Path, status: str) -> None:
    content = filepath.read_text(encoding="utf-8")
    meta, _ = parse_frontmatter(content)
    meta["status"] = status
    meta["sync_timestamp"] = now_iso()
    filepath.write_text(inject_frontmatter(content, meta), encoding="utf-8")


# ─── CLI ──────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Doc Sentinel — document-code change notification system.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    p_status = sub.add_parser("status", help="Document health report (read-only)")
    p_status.add_argument("--root", help="Repository root (default: cwd)")
    p_status.add_argument("--doc", help="Query specific document by doc_id")
    p_status.add_argument("--source", help="Query documents tracking a source path")
    p_status.add_argument("--format", choices=["text", "json"], default="text",
                          help="Output format (default: text)")

    p_bind = sub.add_parser("bind", help="Bind a document to source code")
    p_bind.add_argument("doc_path", help="Path to the .md document")
    p_bind.add_argument("--root", help="Repository root (default: cwd)")
    p_bind.add_argument("--source", nargs="+", help="Source paths to track")
    p_bind.add_argument("--auto-detect", action="store_true",
                        help="Auto-detect source paths from document location")

    p_plan = sub.add_parser("plan", help="Generate reconciliation plan")
    p_plan.add_argument("--root", help="Repository root (default: cwd)")
    p_plan.add_argument("--since", help="Base commit (default: last sync)")
    p_plan.add_argument("--output", help="Write plan JSON to file")
    p_plan.add_argument("--format", choices=["text", "json"], default="text",
                        help="Output format (default: text)")

    p_apply = sub.add_parser("apply", help="Execute reconciliation plan")
    p_apply.add_argument("--root", help="Repository root (default: cwd)")
    p_apply.add_argument("--dry-run", action="store_true", help="Preview only")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    commands = {
        "status": cmd_status,
        "bind": cmd_bind,
        "plan": cmd_plan,
        "apply": cmd_apply,
    }

    handler = commands.get(args.command)
    if handler is None:
        print(f"Unknown command: {args.command}", file=sys.stderr)
        return 1

    try:
        return handler(args)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
