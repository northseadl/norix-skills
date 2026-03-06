#!/usr/bin/env python3
"""Feishu Messaging CLI — Send messages, manage chats.

Usage via unified CLI:
  ./feishu msg send|chats|history
"""

import argparse
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from feishu_api import FeishuClient, Log, output


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _resolve_receive_id(client: FeishuClient, user: str = "", chat_id: str = "") -> tuple:
    """Resolve target to (receive_id, receive_id_type).

    Priority: chat_id > user name resolution.
    Returns (id, type) where type is 'chat_id' or 'open_id'.
    """
    if chat_id:
        return chat_id, "chat_id"
    if user:
        from members import resolve_member
        open_id = resolve_member(user, client)
        if not open_id:
            Log.error(f"Cannot resolve user '{user}'")
            sys.exit(1)
        return open_id, "open_id"
    Log.error("Specify --chat-id or --user")
    sys.exit(1)


def _build_text_content(text: str) -> tuple:
    """Build text message content. Returns (msg_type, content_json)."""
    return "text", json.dumps({"text": text})


def _build_interactive_content(card_path: str) -> tuple:
    """Build interactive card content from JSON file. Returns (msg_type, content_json)."""
    with open(card_path) as f:
        card = json.load(f)
    return "interactive", json.dumps(card)


def _build_post_content(title: str, text: str) -> tuple:
    """Build rich-text (post) message with inline formatting.

    Supports **bold** and [link text](url) syntax in text content.
    Each line becomes a paragraph in the Feishu post structure.
    """
    # Split text into lines, each becomes a paragraph in post
    lines = text.split("\n") if text else []
    paragraphs = []
    for line in lines:
        elements = []
        # Parse **bold** and [link](url)
        parts = re.split(r'(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))', line)
        for part in parts:
            if part.startswith("**") and part.endswith("**"):
                elements.append({"tag": "text", "text": part[2:-2], "style": ["bold"]})
            elif part.startswith("[") and "]" in part and "(" in part:
                m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', part)
                if m:
                    elements.append({"tag": "a", "text": m.group(1), "href": m.group(2)})
                else:
                    elements.append({"tag": "text", "text": part})
            elif part:
                elements.append({"tag": "text", "text": part})
        if elements:
            paragraphs.append(elements)

    content = {
        "zh_cn": {
            "title": title,
            "content": paragraphs,
        }
    }
    return "post", json.dumps(content)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="msg.py", description="Feishu Messaging")
    sub = parser.add_subparsers(dest="command")

    # Send message
    p = sub.add_parser("send", help="Send a message to chat or user")
    p.add_argument("--chat-id", default="", help="Target chat ID (oc_xxx)")
    p.add_argument("--user", default="", help="Target user name (resolved via member cache)")
    p.add_argument("--text", default="", help="Text message content")
    p.add_argument("--post", default="", help="Rich-text message content (supports **bold** and [link](url))")
    p.add_argument("--title", default="", help="Title for post/rich-text messages")
    p.add_argument("--card", default="", help="Path to interactive card JSON file")
    p.add_argument("--reply-to", default="", help="Message ID to reply to")

    # List chats
    p = sub.add_parser("chats", help="List joined chats/groups")
    p.add_argument("--name", default="", help="Filter by chat name keyword")
    p.add_argument("--json", action="store_true", dest="json_output", help="Output as JSON")

    # Get chat info
    p = sub.add_parser("chat-info", help="Get chat details")
    p.add_argument("--chat-id", required=True, help="Chat ID")

    # Message history
    p = sub.add_parser("history", help="Get message history of a chat")
    p.add_argument("--chat-id", required=True, help="Chat ID")
    p.add_argument("--count", type=int, default=20, help="Number of messages (default: 20)")
    p.add_argument("--json", action="store_true", dest="json_output", help="Output as JSON")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    client = FeishuClient()

    if args.command == "send":
        # Resolve target
        receive_id, receive_id_type = _resolve_receive_id(
            client, user=args.user, chat_id=args.chat_id
        )

        # Build content
        if args.card:
            msg_type, content = _build_interactive_content(args.card)
        elif args.post:
            msg_type, content = _build_post_content(args.title or "", args.post)
        elif args.text:
            msg_type, content = _build_text_content(args.text)
        else:
            Log.error("Specify --text, --post, or --card")
            sys.exit(1)

        # Send
        body = {
            "receive_id": receive_id,
            "msg_type": msg_type,
            "content": content,
        }
        if args.reply_to:
            body["reply_message_id"] = args.reply_to

        params = {"receive_id_type": receive_id_type}
        result = client.post("/im/v1/messages", body, params=params)

        code = result.get("code", -1)
        if code == 0:
            msg_id = result.get("data", {}).get("message_id", "?")
            Log.ok(f"Message sent (id: {msg_id})")
        else:
            Log.error(f"Send failed: {result.get('msg', '?')} (code: {code})")
            output(result)
            sys.exit(1)

    elif args.command == "chats":
        chats = client.get_all("/im/v1/chats", params={
            "page_size": "50",
        })

        if args.name:
            keyword = args.name.lower()
            chats = [c for c in chats if keyword in c.get("name", "").lower()]

        if args.json_output:
            output({"chats": chats, "count": len(chats)})
        else:
            if not chats:
                Log.warn("No chats found")
                sys.exit(0)
            for i, c in enumerate(chats, 1):
                name = c.get("name", "(unnamed)")
                chat_id = c.get("chat_id", "?")
                member_count = c.get("user_count", "?")
                chat_type = c.get("chat_type", "?")
                print(f"  {i:2}. {name}")
                print(f"       id: {chat_id}  type: {chat_type}  members: {member_count}")
            print(f"\n  Total: {len(chats)}")

    elif args.command == "chat-info":
        result = client.get(f"/im/v1/chats/{args.chat_id}")
        output(result)

    elif args.command == "history":
        params = {
            "page_size": str(min(args.count, 50)),
        }
        result = client.get(f"/im/v1/messages", params={
            **params,
            "container_id_type": "chat",
            "container_id": args.chat_id,
        })
        items = result.get("data", {}).get("items", [])

        if args.json_output:
            output({"messages": items, "count": len(items)})
        else:
            if not items:
                Log.warn("No messages found")
                sys.exit(0)
            for msg in items:
                sender_id = msg.get("sender", {}).get("id", "?")
                msg_type = msg.get("msg_type", "?")
                create_time = msg.get("create_time", "?")
                body_raw = msg.get("body", {}).get("content", "{}")
                try:
                    body = json.loads(body_raw)
                    text = body.get("text", body_raw[:100])
                except (json.JSONDecodeError, AttributeError):
                    text = str(body_raw)[:100]
                print(f"  [{create_time}] ({msg_type}) {sender_id}: {text}")
            print(f"\n  Messages: {len(items)}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
