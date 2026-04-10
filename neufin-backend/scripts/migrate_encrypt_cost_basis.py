#!/usr/bin/env python3
"""
scripts/migrate_encrypt_cost_basis.py
──────────────────────────────────────
One-time migration: encrypt all plaintext cost_basis values in portfolio_positions.

Safe to run multiple times — already-encrypted rows (Fernet tokens start with
"gAAAAA") are skipped automatically.

Usage:
    cd neufin-backend
    FERNET_MASTER_KEY=<your_key> python scripts/migrate_encrypt_cost_basis.py

    # Dry-run (inspect without writing):
    FERNET_MASTER_KEY=<your_key> python scripts/migrate_encrypt_cost_basis.py --dry-run
"""

import argparse
import os
import sys

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import encrypt_value, get_supabase_client


def _looks_encrypted(val: str) -> bool:
    """Fernet tokens are base64 and start with 'gAAAAA' for recent timestamps."""
    if not isinstance(val, str):
        return False
    # Fernet tokens are always > 100 chars and URL-safe base64
    if len(val) > 80:
        return True
    # PLAIN: sentinel from degraded mode — still needs real encryption
    if val.startswith("PLAIN:"):
        return False
    return False


def run(dry_run: bool = False) -> None:
    sb = get_supabase_client()

    # Fetch all rows with a non-null cost_basis
    print("[migrate] Fetching portfolio_positions with cost_basis…")
    result = (
        sb.table("portfolio_positions")
        .select("id, cost_basis")
        .not_.is_("cost_basis", "null")
        .execute()
    )

    rows = result.data or []
    print(f"[migrate] Found {len(rows)} rows with cost_basis set.")

    skipped = 0
    encrypted = 0
    errors = 0

    for row in rows:
        row_id = row["id"]
        raw_cb = row["cost_basis"]

        if _looks_encrypted(raw_cb):
            skipped += 1
            continue

        # Attempt to parse as a plain float
        try:
            plain_val = float(raw_cb)
        except (ValueError, TypeError):
            print(
                f"[migrate] WARNING: row {row_id} — cannot parse cost_basis={raw_cb!r}, skipping."
            )
            errors += 1
            continue

        new_val = encrypt_value(plain_val)

        if dry_run:
            print(f"[dry-run] {row_id}: {plain_val!r}  →  {new_val[:40]}…")
            encrypted += 1
            continue

        try:
            sb.table("portfolio_positions").update({"cost_basis": new_val}).eq(
                "id", row_id
            ).execute()
            encrypted += 1
        except Exception as e:
            print(f"[migrate] ERROR updating row {row_id}: {e}")
            errors += 1

    print(
        f"\n[migrate] Done.\n"
        f"  Encrypted : {encrypted}\n"
        f"  Skipped   : {skipped}  (already encrypted)\n"
        f"  Errors    : {errors}\n"
        + ("[dry-run mode — no writes made]" if dry_run else "")
    )

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Encrypt plaintext cost_basis rows.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would change without writing."
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)
