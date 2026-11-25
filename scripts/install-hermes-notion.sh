#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HERMES_ROOT="${HOME}/.hermes"
INSTALL_DIR="${HERMES_ROOT}/bin"
PAYLOAD_DIR="${HERMES_ROOT}/notion-payloads"
TARGET="${INSTALL_DIR}/hermes-notion"

mkdir -p "${INSTALL_DIR}" "${PAYLOAD_DIR}"
chmod 700 "${INSTALL_DIR}" "${PAYLOAD_DIR}"
install -m 700 "${PROJECT_DIR}/scripts/hermes-notion.py" "${TARGET}"

python3 - "${TARGET}" <<'PY'
from pathlib import Path
import sys

target = sys.argv[1]
home = Path.home()
roots = [
    home / ".hermes" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes" / "profiles" / "consoleparent" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes" / "profiles" / "consolechilda" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes" / "profiles" / "consolechildb" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes-console" / "agents" / "parent" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes-console" / "agents" / "child-a" / "skills" / "productivity" / "notion" / "SKILL.md",
    home / ".hermes-console" / "agents" / "child-b" / "skills" / "productivity" / "notion" / "SKILL.md",
]
marker = "<!-- hermes-console-notion-bridge -->"
write_marker = "<!-- hermes-console-notion-write-bridge-v2 -->"
guide = f"""{marker}
## Hermes Console stable transport

When running inside Hermes Console, use `{target}` instead of direct `curl` calls.
Run `{target} --help` for supported operations. JSON write payloads must be saved
under `~/.hermes/notion-payloads`; Console automatically approves edits only in
that directory. Use `replace-blocks` when the user explicitly asks to overwrite
a page. Never print or embed `NOTION_API_KEY`.

"""
write_guide = f"""{write_marker}
### Notion write workflow

1. Save the request body with `write_file` under `~/.hermes/notion-payloads`.
2. Invoke `{target}` directly with `append-blocks`, `replace-blocks`,
   `update-page`, `query-data-source`, or `create-page` and `--json-file`.
3. Do not use direct `curl`, shell pipes, temporary files elsewhere, or expose the token.

"""
for skill in roots:
    if not skill.is_file():
        continue
    content = skill.read_text(encoding="utf-8", errors="ignore")
    if marker not in content:
        content = guide + content
    if write_marker not in content:
        content = write_guide + content
    skill.write_text(content, encoding="utf-8")
PY

"${TARGET}" status
