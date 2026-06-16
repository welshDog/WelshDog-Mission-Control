#!/usr/bin/env python3
"""HyperFocus Z0ne - Mission Control Env Guard.

Checks required vars across both .env.local (frontend) and server/.env (backend).
Reads files and merges with os.environ (env takes priority).
Exits 0 on pass, 1 on failure.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FRONTEND_REQUIRED = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_ADMIN_ALLOWLIST",
]

SERVER_REQUIRED = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DISCORD_TOKEN",
]

_PLACEHOLDERS = {"", "changeme", "CHANGEME", "your_value_here", "paste_here",
                 "CHANGEME_REQUIRED", "your-anon-key-here"}


def _load_env(env_path):
    kv = {}
    if not env_path.exists():
        return kv
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        kv[k.strip()] = v.strip()
    return kv


def _check(label, env_path, required, merged_base):
    print("   [" + label + "]  " + str(env_path.relative_to(ROOT)))
    env_vals = _load_env(env_path)
    merged = {**merged_base, **env_vals, **os.environ}
    missing = []
    for var in required:
        val = merged.get(var, "")
        if not val or val in _PLACEHOLDERS:
            missing.append(var)
        else:
            print("      PASS  " + var)
    return missing


def main() -> int:
    print("\n[ENV GUARD] HyperFocus Z0ne -- Mission Control")
    print("-" * 40)

    all_missing = []

    all_missing += _check(
        "frontend", ROOT / ".env.local", FRONTEND_REQUIRED, {}
    )
    print()
    all_missing += _check(
        "server ", ROOT / "server" / ".env", SERVER_REQUIRED, {}
    )
    print()

    if all_missing:
        for v in all_missing:
            print("   FAIL  " + v + "  (missing or placeholder)")
        print()
        print("FAIL  Env guard FAILED -- " + str(len(all_missing)) + " var(s) not set.\n")
        return 1

    print("PASS  All required MC env vars present. Guard passed!\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
