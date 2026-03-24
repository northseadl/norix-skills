/**
 * Feishu Messaging CLI — Send messages, manage chats.
 *
 * Usage: ./feishu msg send|chats|chat-info|history
 */

import * as fs from "node:fs";
import * as lark from "@larksuiteoapi/node-sdk";
import { Log } from "./log.js";
import { createLarkClient, userRequest, getAllPages } from "./client.js";
import { parseArgs, respond, fail } from "./utils.js";
import { resolveMember } from "./members.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function resolveReceiveId(
  client: lark.Client,
  user: string,
  chatId: string,
  chatName: string
): Promise<{ id: string; type: string }> {
  if (chatId) return { id: chatId, type: "chat_id" };

  // Compound: resolve chat by name
  if (chatName) {
    const chats = await getAllPages(client, "/im/v1/chats", {
      page_size: "50",
    }) as Record<string, unknown>[];
    const keyword = chatName.toLowerCase();
    const matched = chats.filter(c =>
      ((c.name ?? "") as string).toLowerCase().includes(keyword)
    );
    if (!matched.length) fail(`No chat matching '${chatName}'`);
    if (matched.length > 1) {
      const names = matched.map(c => ({ name: c.name, chat_id: c.chat_id }));
      fail(
        `Multiple chats match '${chatName}' (${matched.length}). Specify --chat-id.`,
        JSON.stringify(names)
      );
    }
    const id = (matched[0]!.chat_id ?? "") as string;
    Log.ok(`Resolved chat: ${matched[0]!.name} → ${id}`);
    return { id, type: "chat_id" };
  }

  if (user) {
    const openId = await resolveMember(user, client);
    if (!openId) fail(`Cannot resolve user '${user}'`);
    return { id: openId, type: "open_id" };
  }
  fail("Specify --chat-id, --chat-name, or --user");
}

function buildPostContent(
  title: string,
  text: string
): { msgType: string; content: string } {
  const lines = text ? text.split("\\n") : [];
  const paragraphs: Record<string, unknown>[][] = [];

  for (const line of lines) {
    const elements: Record<string, unknown>[] = [];
    const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        elements.push({
          tag: "text",
          text: part.slice(2, -2),
          style: ["bold"],
        });
      } else if (part.startsWith("[") && part.includes("](")) {
        const m = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (m) {
          elements.push({ tag: "a", text: m[1], href: m[2] });
        } else {
          elements.push({ tag: "text", text: part });
        }
      } else if (part) {
        elements.push({ tag: "text", text: part });
      }
    }
    if (elements.length) paragraphs.push(elements);
  }

  const content = {
    zh_cn: { title, content: paragraphs },
  };
  return { msgType: "post", content: JSON.stringify(content) };
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function msgMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (command === "send") {
    const { id: receiveId, type: receiveIdType } = await resolveReceiveId(
      client,
      args.user ?? "",
      args["chat-id"] ?? "",
      args["chat-name"] ?? ""
    );

    let msgType: string;
    let content: string;

    if (args.card) {
      const cardJson = JSON.parse(fs.readFileSync(args.card, "utf-8"));
      msgType = "interactive";
      content = JSON.stringify(cardJson);
    } else if (args.post) {
      const result = buildPostContent(args.title ?? "", args.post);
      msgType = result.msgType;
      content = result.content;
    } else if (args.text) {
      msgType = "text";
      content = JSON.stringify({ text: args.text });
    } else {
      fail("Specify --text, --post, or --card");
    }

    const body: Record<string, unknown> = {
      receive_id: receiveId,
      msg_type: msgType!,
      content: content!,
    };
    if (args["reply-to"]) body.reply_message_id = args["reply-to"];

    const result = await userRequest(client, "POST", "/im/v1/messages", body, {
      receive_id_type: receiveIdType,
    });

    const code = result.code as number;
    if (code === 0) {
      const msgId = ((result.data as Record<string, unknown>)?.message_id ?? "?") as string;
      respond({ message_id: msgId, receive_id: receiveId }, `Message sent (id: ${msgId})`);
    } else {
      fail(`Send failed: ${result.msg ?? "?"} (code: ${code})`);
    }

  } else if (command === "chats") {
    let chats = (await getAllPages(client, "/im/v1/chats", {
      page_size: "50",
    })) as Record<string, unknown>[];

    if (args.name) {
      const keyword = args.name.toLowerCase();
      chats = chats.filter((c) =>
        ((c.name ?? "") as string).toLowerCase().includes(keyword)
      );
    }

    respond({
      chats: chats.map(c => ({
        chat_id: c.chat_id,
        name: c.name,
        chat_type: c.chat_type,
        user_count: c.user_count,
      })),
      count: chats.length,
    }, `${chats.length} chat(s)`);

  } else if (command === "chat-info") {
    if (!args["chat-id"]) fail("--chat-id required");
    const result = await userRequest(client, "GET", `/im/v1/chats/${args["chat-id"]}`);
    if ((result.code as number) !== 0) fail(`Chat info failed: ${result.msg ?? "?"}`);
    respond(result.data);

  } else if (command === "history") {
    if (!args["chat-id"]) fail("--chat-id required");
    const count = Math.min(Number(args.count ?? "20"), 50);
    const result = await userRequest(client, "GET", "/im/v1/messages", undefined, {
      page_size: String(count),
      container_id_type: "chat",
      container_id: args["chat-id"],
    });
    const items = ((result.data as Record<string, unknown>)?.items ??
      []) as Record<string, unknown>[];

    respond({
      messages: items.map(msg => {
        const bodyRaw = ((msg.body as Record<string, unknown>)?.content ?? "{}") as string;
        let text: string;
        try {
          const body = JSON.parse(bodyRaw);
          text = (body.text ?? bodyRaw.slice(0, 200)) as string;
        } catch {
          text = String(bodyRaw).slice(0, 200);
        }
        return {
          message_id: msg.message_id,
          sender_id: (msg.sender as Record<string, unknown>)?.id,
          msg_type: msg.msg_type,
          create_time: msg.create_time,
          text,
        };
      }),
      count: items.length,
    }, `${items.length} message(s)`);

  } else {
    respond({
      commands: ["send", "chats", "chat-info", "history"],
      usage: "./feishu msg <command>",
    }, "Messaging");
  }
}
