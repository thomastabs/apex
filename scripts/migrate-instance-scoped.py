#!/usr/bin/env python3
"""One-time migration to instance-scoped context storage.

Context files moved from `contextspec/<project_id>/…` to
`contextspec/<instance_id>/<project_id>/…` so the same project_id on different
Taiga instances (Cloud vs private) never collides. This relocates pre-migration
data — project dirs sitting directly at the contextspec root — into the instance
namespace they belong to.

Run once locally, and once against Azure with AZURE_STORAGE_CONNECTION_STRING
set (it uses the same StoragePath layer as the app). Idempotent: re-running after
a successful migration is a no-op.

Usage:
  python3 scripts/migrate-instance-scoped.py --instance-url https://api.taiga.io
  python3 scripts/migrate-instance-scoped.py            # derive from config taiga_url
  python3 scripts/migrate-instance-scoped.py --dry-run  # show what would move
  python3 scripts/migrate-instance-scoped.py --instance-id api_taiga_io  # explicit
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import context_manager as cm  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Migrate legacy contextspec dirs to instance-scoped storage.")
    ap.add_argument("--instance-url", default="", help="PM instance URL whose existing data is being migrated")
    ap.add_argument("--instance-id", default="", help="explicit namespace dir (overrides --instance-url)")
    ap.add_argument("--dry-run", action="store_true", help="show what would move; make no changes")
    args = ap.parse_args()

    if args.instance_id:
        instance_id = args.instance_id.strip()
    else:
        url = args.instance_url.strip()
        if not url:
            cfg = cm.load_config()
            url = (cfg.get("taiga_url") or cfg.get("jira_base_url") or "").strip()
        if not url:
            print(
                "ERROR: no instance to migrate to. Pass --instance-url / --instance-id, "
                "or set workspace config taiga_url.",
                file=sys.stderr,
            )
            return 2
        instance_id = cm.instance_key(url)

    legacy = [e.name for e in cm._BASE_CONTEXTSPEC.iterdir_dirs() if e.name.isdigit()]
    print(f"Storage mode:      {'Azure File Share' if os.getenv('AZURE_STORAGE_CONNECTION_STRING') else 'local disk'}")
    print(f"Target namespace:  contextspec/{instance_id}/")
    print(f"Legacy project dirs at root: {legacy or '(none)'}")

    if not legacy:
        print("Nothing to migrate.")
        return 0
    if args.dry_run:
        print("dry-run: no changes made.")
        return 0

    moved = cm.migrate_to_instance_scoped(instance_id)
    print(f"Migrated {moved} project dir(s) -> contextspec/{instance_id}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
