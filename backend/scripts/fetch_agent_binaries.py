"""Downloads the agent exe + installer from a GitHub Release at container start.

For hosts with no agent/dist bind mount (e.g. Render): set AGENT_RELEASE_URL
to a release download base such as
  https://github.com/<owner>/<repo>/releases/latest/download
and both files land in /app/agent_dist, where routes/agents.py serves them.
Each file is checked against the release's SHA256SUMS.txt before it's kept.

No-op when AGENT_RELEASE_URL is unset (local dev uses the bind mount). Never
fails the container start: on any error it logs and exits 0, so the API still
comes up and only the agent download routes return 404.
"""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

DEST = Path("/app/agent_dist")
FILES = ("truepositive-agent.exe", "truepositive-agent-setup.exe")


def _get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 - fixed https base from env
        return response.read()


def main() -> None:
    base = os.environ.get("AGENT_RELEASE_URL", "").rstrip("/")
    if not base:
        return
    if not base.startswith("https://"):
        print(f"[agent fetch] AGENT_RELEASE_URL must be https, got {base!r}; skipping", file=sys.stderr)
        return
    try:
        sums = {}
        for line in _get(f"{base}/SHA256SUMS.txt").decode().splitlines():
            digest, _, name = line.strip().partition("  ")
            sums[name] = digest.lower()
        DEST.mkdir(parents=True, exist_ok=True)
        for name in FILES:
            content = _get(f"{base}/{name}")
            if hashlib.sha256(content).hexdigest() != sums.get(name):
                print(f"[agent fetch] checksum mismatch for {name}; not saved", file=sys.stderr)
                continue
            (DEST / name).write_bytes(content)
            print(f"[agent fetch] saved {name} ({len(content)} bytes)")
    except Exception as exc:  # noqa: BLE001 - must never block API startup
        print(f"[agent fetch] failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
