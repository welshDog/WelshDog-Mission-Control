#!/usr/bin/env python3
"""HyperFocus Z0ne - Mission Control Config Validator.

Enforces Sacred Rules on render.yaml / vercel.json:
  - NEVER docker.io image references
  - NEVER 'from backend.app.' in inline commands
  - WARN if a secret-looking env key has a hardcoded value: (not sync: false)

Usage:
    python scripts/mc_config_validator.py render.yaml
    python scripts/mc_config_validator.py vercel.json
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_BANNED_IMAGE_PREFIXES = ("docker.io/", "index.docker.io/")
_BANNED_IMPORT_RE = re.compile(r"from\s+backend\.app\.")
_SECRET_KEY_RE = re.compile(r"key:\s*(.*(?:TOKEN|SECRET|KEY|PASSWORD|PAT)\b)", re.IGNORECASE)


def _resolve_config(arg):
    p = Path(arg)
    if p.is_absolute():
        return p
    for base in (Path.cwd(), ROOT):
        candidate = base / p
        if candidate.exists():
            return candidate
    return Path.cwd() / p


def validate(config_path):
    errors = []
    warnings = []

    if not config_path.exists():
        errors.append("file not found: " + str(config_path))
        return errors, warnings

    lines = config_path.read_text(encoding="utf-8").splitlines()
    pending_secret_key = None

    for i, raw in enumerate(lines, start=1):
        stripped = raw.strip()
        if not stripped:
            continue

        for prefix in _BANNED_IMAGE_PREFIXES:
            if prefix in stripped:
                errors.append("line " + str(i) + ": docker.io reference -- " + repr(stripped))

        if _BANNED_IMPORT_RE.search(stripped):
            errors.append("line " + str(i) + ": forbidden 'from backend.app.*' -- " + repr(stripped))

        # Warn if a secret-looking key is followed by value: (not sync: false)
        m = _SECRET_KEY_RE.search(stripped)
        if m:
            pending_secret_key = (i, m.group(1).strip())
        elif pending_secret_key and stripped.startswith("value:"):
            src_line, key_name = pending_secret_key
            warnings.append(
                "line " + str(i) + ": secret key '" + key_name +
                "' has hardcoded value: -- prefer sync: false"
            )
            pending_secret_key = None
        elif pending_secret_key and (stripped.startswith("sync:") or stripped.startswith("key:")):
            pending_secret_key = None

    return errors, warnings


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/mc_config_validator.py <config-file>")
        return 2

    config_path = _resolve_config(sys.argv[1])

    print("\n[CONFIG VALIDATOR] HyperFocus Z0ne MC -- " + sys.argv[1])
    print("-" * 40)
    print("   Path: " + str(config_path))
    print()

    errors, warnings = validate(config_path)

    for w in warnings:
        print("   WARN  " + w)
    if warnings:
        print()

    if errors:
        for e in errors:
            print("   FAIL  " + e)
        print()
        print("FAIL  Validation FAILED -- " + str(len(errors)) + " error(s).\n")
        return 1

    print("PASS  " + config_path.name + " passed all Sacred Rules checks!")
    if warnings:
        print("      (" + str(len(warnings)) + " warning(s) -- non-blocking)")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
