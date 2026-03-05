#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Repo Doc Engine — autonomous repository documentation management.

Usage:
    doc_engine.py scan   [--root PATH]
    doc_engine.py check  [--root PATH]
    doc_engine.py status [--root PATH]
    doc_engine.py sync   [--root PATH] [--since COMMIT]
    doc_engine.py apply  [--root PATH] [--dry-run]
    doc_engine.py index  [--root PATH] [--style auto|flat|hierarchical|categorical]
    doc_engine.py embed  [--root PATH]
    doc_engine.py search QUERY [--root PATH] [--top-k N]
    doc_engine.py vector-status [--root PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure lib/ is importable
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from lib.traceback import get_head_commit, now_iso
from lib.registry import DocRegistry, ENGINE_DIR


def cmd_scan(args: argparse.Namespace) -> int:
    """Scan repository and build document registry."""
    root = _resolve_root(args)
    print(f"📡 Scanning {root} ...")

    registry = DocRegistry.scan(root)
    saved = registry.save(root)

    print(f"✅ Found {len(registry.docs)} traceable documents")
    for doc in registry.all_docs():
        sources = ", ".join(doc.source_paths[:2])
        extra = f" (+{len(doc.source_paths) - 2})" if len(doc.source_paths) > 2 else ""
        print(f"  • {doc.doc_id} ← {sources}{extra}")

    print(f"\n📁 Registry saved to {saved}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    """Check staleness of all documents."""
    root = _resolve_root(args)
    print(f"🔍 Checking document staleness in {root} ...")

    registry = DocRegistry.load(root)
    if registry is None:
        registry = DocRegistry.scan(root)

    statuses = registry.check_all()
    registry.save(root)

    icons = {
        "synced": "✅", "stale": "⚠️", "needs_review": "🔍",
        "draft": "📝", "source_missing": "❌",
    }

    for doc_id, status in sorted(statuses.items()):
        icon = icons.get(status, "·")
        print(f"  {icon} {doc_id}: {status}")

    # Summary
    counts: dict[str, int] = {}
    for s in statuses.values():
        counts[s] = counts.get(s, 0) + 1

    print(f"\n📊 Total: {len(statuses)} | ", end="")
    print(" | ".join(f"{k}: {v}" for k, v in sorted(counts.items())))

    return 0


def cmd_status(args: argparse.Namespace) -> int:
    """Show document health report."""
    root = _resolve_root(args)

    registry = DocRegistry.load(root)
    if registry is None:
        print("⚠️  No registry found. Running scan first...")
        registry = DocRegistry.scan(root)
        registry.save(root)

    report = registry.health_report()

    print("📊 Documentation Health Report")
    print(f"   Repository: {root}")
    print(f"   Total docs: {report['total']}")
    print(f"   Synced:     {report['synced_pct']}%")
    print()

    for status, count in sorted(report["by_status"].items()):
        icon = {"synced": "✅", "stale": "⚠️", "draft": "📝",
                "needs_review": "🔍", "source_missing": "❌"}.get(status, "·")
        print(f"  {icon} {status}: {count}")

    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    """Analyze git diff and generate operation plan."""
    from lib.analyzer import full_analysis, save_change_report

    root = _resolve_root(args)
    since = args.since or DocRegistry.get_last_sync_commit(root)

    if not since:
        print("ℹ️  No previous sync point found. Run 'scan' first to establish baseline.")
        print("   After scan, commit and run 'sync' to detect changes.")
        # Save current HEAD as sync point
        head = get_head_commit(root)
        DocRegistry.save_last_sync_commit(root, head)
        print(f"   Sync point set to current HEAD: {head[:8]}")
        return 0

    print(f"🔄 Analyzing changes since {since[:8]}...")

    report = full_analysis(root, since)
    save_change_report(root, report)

    print(report.summary())

    if report.actions:
        print("\n📋 Planned Actions:")
        for action in report.actions:
            icon = {
                "update": "📝", "rename": "🔄", "archive": "🗄️",
                "create": "✨", "relocate": "📦",
            }.get(action.action.value, "·")
            target = action.doc_id or action.details.get("source", "?")
            print(f"  {icon} {action.action.value.upper()} → {target}")
            if action.details:
                for k, v in action.details.items():
                    print(f"      {k}: {v}")

    if report.untracked_changes:
        print(f"\n📌 Untracked changes: {len(report.untracked_changes)}")
        for uc in report.untracked_changes[:10]:
            print(f"  · {uc}")

    print(f"\nRun 'apply' to execute these actions. Use 'apply --dry-run' to preview.")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    """Execute the planned document operations."""
    from lib.analyzer import full_analysis
    from lib.traceback import DocMeta, inject_frontmatter, read_doc_meta

    root = _resolve_root(args)
    dry_run = args.dry_run

    since = DocRegistry.get_last_sync_commit(root)
    if not since:
        print("⚠️  No sync point. Run 'sync' first.")
        return 1

    report = full_analysis(root, since)

    if not report.actions:
        print("✅ No actions to apply.")
        return 0

    prefix = "[DRY-RUN] " if dry_run else ""
    applied = 0

    for action in report.actions:
        if action.action.value == "rename":
            old_path = action.details.get("old_path", "")
            new_path = action.details.get("new_path", "")
            if action.filepath and Path(action.filepath).is_file():
                print(f"{prefix}🔄 Updating source_paths in {action.doc_id}: {old_path} → {new_path}")
                if not dry_run:
                    _update_source_path(Path(action.filepath), old_path, new_path)
                applied += 1

        elif action.action.value == "archive":
            if action.filepath and Path(action.filepath).is_file():
                print(f"{prefix}🗄️ Archiving {action.doc_id}")
                if not dry_run:
                    _set_doc_status(Path(action.filepath), "archived")
                applied += 1

        elif action.action.value == "update":
            if action.doc_id:
                print(f"{prefix}📝 Marking {action.doc_id} as stale")
                if not dry_run and action.filepath and Path(action.filepath).is_file():
                    _set_doc_status(Path(action.filepath), "stale")
                applied += 1

        elif action.action.value == "create":
            source = action.details.get("source", "?")
            print(f"{prefix}✨ New source detected: {source} — consider creating documentation")

    if not dry_run:
        # Update sync point
        head = get_head_commit(root)
        DocRegistry.save_last_sync_commit(root, head)
        print(f"\n✅ Applied {applied} actions. Sync point updated to {head[:8]}.")
    else:
        print(f"\n🔍 {applied} actions would be applied. Remove --dry-run to execute.")

    return 0


def cmd_index(args: argparse.Namespace) -> int:
    """Generate or update index document."""
    from lib.indexer import generate_index

    root = _resolve_root(args)
    style = args.style

    print(f"📚 Generating index (style={style})...")

    content = generate_index(root, style=style)
    index_path = root / "INDEX.md"
    index_path.write_text(content, encoding="utf-8")

    lines = content.count("\n")
    print(f"✅ Index written to {index_path} ({lines} lines)")
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    """Chunk and embed all documents into the vector store."""
    from lib.retriever import embed_repository

    root = _resolve_root(args)
    print(f"🧮 Embedding documents from {root}...")

    stats = embed_repository(root)

    print(f"✅ Embedding complete:")
    print(f"   Documents: {stats['docs_processed']}")
    print(f"   Chunks:    {stats['chunks_created']}")
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    """Search documents using hierarchical retrieval."""
    from lib.registry import ENGINE_DIR
    from lib.retriever import HierarchicalRetriever, RetrievalConfig
    from lib.vector_store import create_store

    root = _resolve_root(args)
    query = args.query
    top_k = args.top_k

    store = create_store(root / ENGINE_DIR)
    registry = DocRegistry.load(root) or DocRegistry.scan(root)

    config = RetrievalConfig(top_k=top_k)
    retriever = HierarchicalRetriever(store, registry, config)

    results = retriever.search(query)
    print(retriever.format_results(results))

    return 0


def cmd_vector_status(args: argparse.Namespace) -> int:
    """Show vector store statistics."""
    from lib.vector_store import create_store

    root = _resolve_root(args)
    store = create_store(root / ENGINE_DIR)
    stats = store.stats()

    print("🧮 Vector Store Status")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    return 0


# ─── Helpers ──────────────────────────────────────────────────────────

def _resolve_root(args: argparse.Namespace) -> Path:
    """Resolve repository root from args or cwd."""
    root = Path(args.root).resolve() if hasattr(args, "root") and args.root else Path.cwd()
    # Validate it's a git repo
    if not (root / ".git").exists():
        print(f"⚠️  {root} is not a git repository. Proceeding anyway.", file=sys.stderr)
    return root


def _update_source_path(filepath: Path, old_path: str, new_path: str) -> None:
    """Update source_paths in a document's frontmatter."""
    from lib.traceback import inject_frontmatter, parse_frontmatter

    content = filepath.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(content)

    source_paths = meta.get("source_paths", [])
    if isinstance(source_paths, list):
        meta["source_paths"] = [new_path if sp == old_path else sp for sp in source_paths]
    meta["sync_timestamp"] = now_iso()
    meta["doc_version"] = meta.get("doc_version", 0) + 1

    filepath.write_text(inject_frontmatter(content, meta), encoding="utf-8")


def _set_doc_status(filepath: Path, status: str) -> None:
    """Update status field in a document's frontmatter."""
    from lib.traceback import inject_frontmatter, parse_frontmatter

    content = filepath.read_text(encoding="utf-8")
    meta, _ = parse_frontmatter(content)
    meta["status"] = status
    meta["sync_timestamp"] = now_iso()

    filepath.write_text(inject_frontmatter(content, meta), encoding="utf-8")


# ─── CLI ──────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Repo Doc Engine — autonomous repository documentation management.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    # L0 commands
    p_scan = sub.add_parser("scan", help="Scan for traceable documents")
    p_scan.add_argument("--root", help="Repository root (default: cwd)")

    p_check = sub.add_parser("check", help="Check document staleness")
    p_check.add_argument("--root", help="Repository root (default: cwd)")

    p_status = sub.add_parser("status", help="Document health report")
    p_status.add_argument("--root", help="Repository root (default: cwd)")

    # L1 commands
    p_sync = sub.add_parser("sync", help="Analyze git diff for doc operations")
    p_sync.add_argument("--root", help="Repository root (default: cwd)")
    p_sync.add_argument("--since", help="Base commit (default: last sync)")

    p_apply = sub.add_parser("apply", help="Execute planned doc operations")
    p_apply.add_argument("--root", help="Repository root (default: cwd)")
    p_apply.add_argument("--dry-run", action="store_true", help="Preview only")

    p_index = sub.add_parser("index", help="Generate index document")
    p_index.add_argument("--root", help="Repository root (default: cwd)")
    p_index.add_argument("--style", default="auto",
                         choices=["auto", "flat", "hierarchical", "categorical"],
                         help="Index style (default: auto)")

    # L2 commands
    p_embed = sub.add_parser("embed", help="Chunk and embed documents")
    p_embed.add_argument("--root", help="Repository root (default: cwd)")

    p_search = sub.add_parser("search", help="Semantic search")
    p_search.add_argument("query", help="Search query")
    p_search.add_argument("--root", help="Repository root (default: cwd)")
    p_search.add_argument("--top-k", type=int, default=5, help="Number of results")

    p_vec = sub.add_parser("vector-status", help="Vector store statistics")
    p_vec.add_argument("--root", help="Repository root (default: cwd)")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    commands = {
        "scan": cmd_scan,
        "check": cmd_check,
        "status": cmd_status,
        "sync": cmd_sync,
        "apply": cmd_apply,
        "index": cmd_index,
        "embed": cmd_embed,
        "search": cmd_search,
        "vector-status": cmd_vector_status,
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
