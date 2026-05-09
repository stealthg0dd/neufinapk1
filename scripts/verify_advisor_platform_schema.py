#!/usr/bin/env python3
"""
Verify the eight advisor-platform tables exist in Supabase PostgREST.
Uses SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY from env.
Does not print secrets.

Usage (from repo root):
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/verify_advisor_platform_schema.py
"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request


TABLES = (
    "advisor_clients",
    "client_portfolios",
    "portfolio_snapshots",
    "dna_score_snapshots",
    "behavioral_alerts",
    "client_meetings",
    "client_communications",
    "connected_accounts",
)


def main() -> int:
    base = (
        (
            os.environ.get("SUPABASE_URL")
            or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            or ""
        )
        .strip()
        .rstrip("/")
    )
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not base or not key:
        print(
            "ERROR: Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
            file=sys.stderr,
        )
        return 2

    ok = 0
    for name in TABLES:
        url = f"{base}/rest/v1/{name}?select=id&limit=0"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                code = resp.getcode()
                if code == 200:
                    print(f"OK    {name}")
                    ok += 1
                else:
                    print(f"FAIL  {name} (HTTP {code})")
        except urllib.error.HTTPError as e:
            if e.code in (404, 406):
                print(f"MISSING {name} (HTTP {e.code})")
            else:
                print(f"FAIL  {name} (HTTP {e.code})")
        except urllib.error.URLError as e:
            print(f"FAIL  {name} (network: {e.reason})")

    print(f"\nSummary: {ok}/{len(TABLES)} tables reachable.")
    return 0 if ok == len(TABLES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
