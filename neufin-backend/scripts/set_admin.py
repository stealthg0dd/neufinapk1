#!/usr/bin/env python3
"""Grant or revoke NeuFin admin role by email.

Usage:
    python scripts/set_admin.py varun@ctechventures.com
    python scripts/set_admin.py someone@example.com --revoke
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase as supabase_admin  # service role when configured


def set_admin(email: str, admin: bool = True) -> None:
    role = "admin" if admin else "advisor"
    result = (
        supabase_admin.table("user_profiles")
        .update({"role": role, "is_admin": admin})
        .eq("email", email)
        .execute()
    )
    if result.data:
        print(f"✓ {email} -> {role}")
    else:
        print(f"✗ User not found: {email}")
        sys.exit(1)


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else input("Email: ")
    revoke = "--revoke" in sys.argv
    set_admin(email, not revoke)
