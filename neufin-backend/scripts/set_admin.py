#!/usr/bin/env python3
"""
scripts/set_admin.py — Grant admin access to a NeuFin user by email.

Usage:
    python scripts/set_admin.py --email your@email.com
    python scripts/set_admin.py --email your@email.com --revoke
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running from repo root or scripts/ directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import supabase


def set_admin(email: str, *, is_admin: bool = True) -> None:
    action = "Granting" if is_admin else "Revoking"
    print(f"{action} admin access for: {email}")

    # Look up the user in auth.users via Supabase admin API (service role)
    try:
        result = (
            supabase.table("user_profiles")
            .update({"is_admin": is_admin})
            .eq("email", email)
            .execute()
        )
        if result.data:
            print(f"✅ Done — is_admin={is_admin} for {email}")
        else:
            # user_profiles may not store email; try via auth lookup
            print("No row found by email in user_profiles — trying auth.users lookup...")
            auth_result = supabase.auth.admin.list_users()
            user = next((u for u in auth_result if u.email == email), None)
            if not user:
                print(f"❌ User not found: {email}")
                sys.exit(1)

            uid = user.id
            upsert_result = (
                supabase.table("user_profiles")
                .upsert({"id": uid, "email": email, "is_admin": is_admin})
                .execute()
            )
            if upsert_result.data:
                print(
                    f"✅ Done — created/updated profile for {email} (id={uid}) is_admin={is_admin}"
                )
            else:
                print("❌ Upsert returned no data. Check service role key.")
                sys.exit(1)
    except Exception as exc:
        print(f"❌ Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grant or revoke NeuFin admin access")
    parser.add_argument("--email", required=True, help="User email address")
    parser.add_argument("--revoke", action="store_true", help="Revoke admin (default: grant)")
    args = parser.parse_args()

    set_admin(args.email, is_admin=not args.revoke)
