#!/usr/bin/env python3
"""HyperFocus Z0ne - Mission Control Session Start Hook.

Writes a .focus_session_start marker, checks both env files and
package.json, and pings the Express API if reachable.
Exits 0 on pass, 1 on hard failure.
"""

import socket
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSION_FILE = ROOT / ".focus_session_start"


def _api_reachable() -> bool:
    try:
        s = socket.create_connection(("127.0.0.1", 3011), timeout=2)
        s.close()
        return True
    except OSError:
        return False


def main() -> int:
    now = datetime.now()
    print("\n[SESSION START] HyperFocus Z0ne -- Mission Control")
    print("-" * 40)
    print("   Time    : " + now.strftime("%Y-%m-%d %H:%M:%S"))

    SESSION_FILE.write_text(now.isoformat())

    pkg_ok = (ROOT / "package.json").exists()
    env_local_ok = (ROOT / ".env.local").exists()
    server_env_ok = (ROOT / "server" / ".env").exists()
    api_ok = _api_reachable()

    print("   package : " + ("PASS found" if pkg_ok else "FAIL package.json missing"))
    print("   .env.local : " + ("PASS found" if env_local_ok else "WARN missing (.env.local)"))
    print("   server/.env: " + ("PASS found" if server_env_ok else "WARN missing (server/.env)"))
    print("   API :3011  : " + ("PASS reachable" if api_ok else "WARN offline (run npm run dev:full)"))
    print()

    if not pkg_ok:
        print("FAIL  Session start FAILED -- package.json not found.\n")
        return 1

    print("PASS  MC session started. BROski forever! Let's build!\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
