#!/usr/bin/env python3
"""Restricted Notion API bridge for Hermes Console."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_ROOT = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"
MAX_PAYLOAD_BYTES = 1_000_000
NOTION_ID = re.compile(r"^[0-9a-fA-F]{32}$")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def notion_token() -> str:
    token = os.environ.get("NOTION_API_KEY", "").strip()
    hermes_home = os.environ.get("HERMES_HOME", "").strip()
    candidates = ([Path(hermes_home) / ".env"] if hermes_home else []) + [Path.home() / ".hermes" / ".env"]
    for candidate in candidates:
        if token:
            break
        token = load_env(candidate).get("NOTION_API_KEY", "").strip()
    if not token:
        fail("NOTION_API_KEY is not configured.", 2)
    return token


def normalize_id(value: str) -> str:
    compact = value.replace("-", "").strip()
    if not NOTION_ID.fullmatch(compact):
        fail("Expected a 32-character Notion page, block, or data-source ID.", 2)
    return compact


def payload_directory() -> Path:
    configured = os.environ.get("HERMES_NOTION_PAYLOAD_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path.home() / ".hermes" / "notion-payloads"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root.resolve()


def read_payload(file_name: str) -> Any:
    root = payload_directory()
    target = Path(file_name).expanduser().resolve()
    try:
        target.relative_to(root)
    except ValueError:
        fail(f"Payload files must be inside {root}.", 2)
    if not target.is_file():
        fail("Payload file does not exist.", 2)
    if target.stat().st_size > MAX_PAYLOAD_BYTES:
        fail("Payload is larger than 1 MB.", 2)
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Invalid JSON payload: {error}", 2)


def fail(message: str, status: int = 1) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    raise SystemExit(status)


def request(method: str, endpoint: str, payload: Any | None = None) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {notion_token()}",
        "Notion-Version": NOTION_VERSION,
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{API_ROOT}{endpoint}", data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read(MAX_PAYLOAD_BYTES).decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("message") or parsed.get("code") or f"HTTP {error.code}"
        except json.JSONDecodeError:
            message = f"HTTP {error.code}"
        fail(f"Notion API returned HTTP {error.code}: {message}")
    except urllib.error.URLError as error:
        fail(f"Could not reach Notion API: {error.reason}")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Restricted Notion API bridge for Hermes.")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Verify the saved Notion integration.")

    search = commands.add_parser("search", help="Search pages shared with the integration.")
    search.add_argument("query", nargs="?", default="")
    search.add_argument("--limit", type=int, default=20)

    get_page = commands.add_parser("get-page")
    get_page.add_argument("page_id")

    get_blocks = commands.add_parser("get-blocks")
    get_blocks.add_argument("block_id")
    get_blocks.add_argument("--limit", type=int, default=100)
    get_blocks.add_argument("--cursor", default="")

    for name in ("append-blocks", "replace-blocks", "update-page", "query-data-source"):
        command = commands.add_parser(name)
        command.add_argument("notion_id")
        command.add_argument("--json-file", required=True)

    create_page = commands.add_parser("create-page")
    create_page.add_argument("--json-file", required=True)
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "status":
        result = request("GET", "/users/me")
        output = {"ok": True, "connected": True, "type": result.get("type", "bot")}
    elif args.command == "search":
        limit = max(1, min(args.limit, 100))
        output = request("POST", "/search", {"query": args.query, "page_size": limit})
    elif args.command == "get-page":
        output = request("GET", f"/pages/{normalize_id(args.page_id)}")
    elif args.command == "get-blocks":
        query = {"page_size": max(1, min(args.limit, 100))}
        if args.cursor:
            query["start_cursor"] = args.cursor
        output = request(
            "GET",
            f"/blocks/{normalize_id(args.block_id)}/children?{urllib.parse.urlencode(query)}",
        )
    elif args.command == "append-blocks":
        output = request("PATCH", f"/blocks/{normalize_id(args.notion_id)}/children", read_payload(args.json_file))
    elif args.command == "replace-blocks":
        block_id = normalize_id(args.notion_id)
        payload = read_payload(args.json_file)
        cursor = ""
        archived = 0
        while True:
            query = {"page_size": 100}
            if cursor:
                query["start_cursor"] = cursor
            children = request("GET", f"/blocks/{block_id}/children?{urllib.parse.urlencode(query)}")
            for block in children.get("results", []):
                child_id = block.get("id", "")
                if child_id:
                    request("DELETE", f"/blocks/{normalize_id(child_id)}")
                    archived += 1
            if not children.get("has_more") or not children.get("next_cursor"):
                break
            cursor = children["next_cursor"]
        result = request("PATCH", f"/blocks/{block_id}/children", payload)
        output = {"ok": True, "archived": archived, "result": result}
    elif args.command == "update-page":
        output = request("PATCH", f"/pages/{normalize_id(args.notion_id)}", read_payload(args.json_file))
    elif args.command == "query-data-source":
        output = request("POST", f"/data_sources/{normalize_id(args.notion_id)}/query", read_payload(args.json_file))
    elif args.command == "create-page":
        output = request("POST", "/pages", read_payload(args.json_file))
    else:
        fail("Unsupported command.", 2)
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
