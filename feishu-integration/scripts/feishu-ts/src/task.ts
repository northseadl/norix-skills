/**
 * Feishu Task v2 Management CLI.
 *
 * Usage: ./feishu task create|get|update|complete|delete|list|comment|...
 */

import * as lark from "@larksuiteoapi/node-sdk";
import * as fs from "node:fs";
import { Log } from "./log.js";
import {
  createLarkClient,
  userRequest,
  getAllPages,
} from "./client.js";
import { parseArgs, respond, fail, isoToTimestamp, sleep } from "./utils.js";
import { resolveMembers, resolveIdsToNames } from "./members.js";

const AGENT_ORIGIN = {
  platform_i18n_name: { zh_cn: "🤖 Agent", en_us: "🤖 Agent" },
  href: {
    url: "https://github.com/northseadl/norix-skills",
    title: "Agent Task",
  },
};

const AGENT_SIGNATURE = "[Agent] Automated action";

async function getMyOpenId(client: lark.Client): Promise<string> {
  const resp = await userRequest(client, "GET", "/authen/v1/user_info");
  return ((resp.data as Record<string, unknown>)?.open_id ?? "") as string;
}

function formatTs(msStr: string): string {
  if (!msStr || msStr === "0") return "";
  try {
    const ts = Number(msStr) / 1000;
    return new Date(ts * 1000).toISOString().slice(0, 10);
  } catch {
    return msStr;
  }
}

function formatTasks(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
  const allIds = new Set<string>();
  for (const t of tasks) {
    for (const m of (t.members ?? []) as Record<string, unknown>[]) {
      const mid = (m.id ?? "") as string;
      if (mid) allIds.add(mid);
    }
  }
  const idList = [...allIds].sort();
  const nameList = resolveIdsToNames(idList);
  const idToName: Record<string, string> = {};
  idList.forEach((id, i) => { idToName[id] = nameList[i]!; });

  return tasks.map(t => {
    const members = (t.members ?? []) as Record<string, unknown>[];
    const assignees = members
      .filter((m) => m.role === "assignee")
      .map((m) => idToName[(m.id ?? "") as string] ?? (m.id as string));
    const dueObj = t.due as Record<string, unknown> | undefined;
    const dueTs = typeof dueObj === "object" ? ((dueObj?.timestamp ?? "") as string) : "";
    return {
      guid: t.guid,
      summary: t.summary,
      completed: (t.completed_at ?? "0") !== "0",
      due: formatTs(dueTs) || null,
      assignees,
      url: t.url ?? null,
    };
  });
}

// ── Shared Body Builder (DRY: used by create + batch-create) ────────────────

async function buildTaskBody(
  client: lark.Client,
  args: Record<string, string>,
  taskData: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const summary = (taskData.summary ?? args.summary ?? "") as string;
  if (!summary) fail("--summary required");

  const body: Record<string, unknown> = { summary, origin: AGENT_ORIGIN };
  const desc = (taskData.description ?? args.description) as string | undefined;
  if (desc) body.description = desc;
  const due = (taskData.due ?? args.due) as string | undefined;
  if (due) body.due = { timestamp: isoToTimestamp(due) };
  const start = (taskData.start ?? args.start) as string | undefined;
  if (start) body.start = { timestamp: isoToTimestamp(start) };

  const members = (taskData.members ?? args.members) as string | string[] | undefined;
  if (members) {
    const mArr = typeof members === "string"
      ? (members.trim().startsWith("[") ? JSON.parse(members) as string[] : await resolveMembers(members, client))
      : members;
    body.members = mArr.map((m: string) => ({ id: m, role: "assignee" }));
  } else if (!args["no-assign"]) {
    const myId = await getMyOpenId(client);
    if (myId) body.members = [{ id: myId, role: "assignee" }];
  }

  if (args["tasklist-id"]) {
    const entry: Record<string, string> = { tasklist_guid: args["tasklist-id"] };
    if (args["section-id"]) entry.section_guid = args["section-id"];
    body.tasklists = [entry];
  }
  return body;
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function taskMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (command === "create") {
    const body = await buildTaskBody(client, args);
    const result = await userRequest(client, "POST", "/task/v2/tasks", body);
    if ((result.code as number) !== 0) fail(`Create failed: ${result.msg ?? "?"}`);
    const task = (result.data as Record<string, unknown>)?.task as Record<string, unknown>;
    respond(task, `Task created: ${task?.guid ?? "?"}`);

  } else if (command === "get") {
    if (!args["task-id"]) fail("--task-id required");
    const result = await userRequest(client, "GET", `/task/v2/tasks/${args["task-id"]}`);
    if ((result.code as number) !== 0) fail(`Get failed: ${result.msg ?? "?"}`);
    const task = (result.data as Record<string, unknown>)?.task as Record<string, unknown>;
    const formatted = formatTasks([task]);
    respond(formatted[0], `Task ${args["task-id"]}`);

  } else if (command === "update") {
    if (!args["task-id"]) fail("--task-id required");
    const fields: string[] = [];
    const taskBody: Record<string, unknown> = {};
    if (args.summary) { taskBody.summary = args.summary; fields.push("summary"); }
    if (args.description) { taskBody.description = args.description; fields.push("description"); }
    if (args.due) {
      taskBody.due = { timestamp: isoToTimestamp(args.due) };
      fields.push("due");
    } else if (args["clear-due"]) {
      fields.push("due");
    }
    if (args.start) {
      taskBody.start = { timestamp: isoToTimestamp(args.start) };
      fields.push("start");
    } else if (args["clear-start"]) {
      fields.push("start");
    }
    if (!fields.length) fail("At least one field required (--summary, --due, --description, etc.)");

    const result = await userRequest(
      client, "PATCH", `/task/v2/tasks/${args["task-id"]}`,
      { task: taskBody, update_fields: fields }
    );
    if ((result.code as number) !== 0) fail(`Update failed: ${result.msg ?? "?"}`);
    const updated = (result.data as Record<string, unknown>)?.task as Record<string, unknown>;
    respond(formatTasks([updated])[0], `Task ${args["task-id"]} updated`);

  } else if (command === "complete") {
    // Compound command: supports --task-id OR --keyword for atomic search+complete
    let taskId = args["task-id"] ?? "";

    if (!taskId && args.keyword) {
      Log.info(`Searching for task matching '${args.keyword}'...`);
      const all = await getAllPages(client, "/task/v2/tasks", { page_size: "100" });
      const kw = args.keyword.toLowerCase();
      const matched = (all as Record<string, unknown>[]).filter(
        (t) =>
          ((t.summary as string) ?? "").toLowerCase().includes(kw) &&
          (t.completed_at ?? "0") === "0"
      );
      if (!matched.length) fail(`No incomplete task matching '${args.keyword}'`);
      if (matched.length > 1) {
        const summaries = matched.map(t => ({ guid: t.guid, summary: t.summary }));
        fail(
          `Multiple tasks match '${args.keyword}' (${matched.length}). Specify --task-id.`,
          JSON.stringify(summaries)
        );
      }
      taskId = (matched[0]!.guid ?? "") as string;
      Log.ok(`Found: ${matched[0]!.summary} (${taskId})`);
    }

    if (!taskId) fail("--task-id or --keyword required");

    if (!args["no-comment"]) {
      await userRequest(client, "POST", "/task/v2/comments", {
        content: `${AGENT_SIGNATURE} — 标记任务完成`,
        resource_type: "task",
        resource_id: taskId,
      });
    }
    const result = await userRequest(
      client, "PATCH", `/task/v2/tasks/${taskId}`,
      {
        task: { completed_at: String(Date.now()) },
        update_fields: ["completed_at"],
      }
    );
    if ((result.code as number) !== 0) fail(`Complete failed: ${result.msg ?? "?"}`);
    const completed = (result.data as Record<string, unknown>)?.task as Record<string, unknown>;
    respond(formatTasks([completed])[0], `Task ${taskId} completed`);

  } else if (command === "delete") {
    if (!args["task-id"]) fail("--task-id required");
    const result = await userRequest(client, "DELETE", `/task/v2/tasks/${args["task-id"]}`);
    if ((result.code as number) !== 0) fail(`Delete failed: ${result.msg ?? "?"}`);
    respond(null, `Task ${args["task-id"]} deleted`);

  } else if (command === "list") {
    const keyword = args.keyword ?? "";
    let tasks: Record<string, unknown>[];

    if (keyword) {
      const all = await getAllPages(client, "/task/v2/tasks", { page_size: "100" });
      const kw = keyword.toLowerCase();
      tasks = (all as Record<string, unknown>[]).filter((t) => {
        const matchesText =
          ((t.summary as string) ?? "").toLowerCase().includes(kw) ||
          ((t.description as string) ?? "").toLowerCase().includes(kw);
        if (!matchesText) return false;
        // Respect --completed filter even in keyword search
        if (args.completed === "true") return (t.completed_at ?? "0") !== "0";
        if (args.completed === "false") return (t.completed_at ?? "0") === "0";
        return true;
      });
    } else {
      const pageSize = args["page-size"] ?? "20";
      const params: Record<string, string> = { page_size: pageSize };
      if (args["page-token"]) params.page_token = args["page-token"];
      if (args.completed) params.completed = args.completed;
      const result = await userRequest(client, "GET", "/task/v2/tasks", undefined, params);
      tasks = ((result.data as Record<string, unknown>)?.items ?? []) as Record<string, unknown>[];
    }

    // Filter by tasklist if specified
    if (args["tasklist-id"]) {
      const tlId = args["tasklist-id"];
      tasks = tasks.filter(t =>
        ((t.tasklists ?? []) as Record<string, unknown>[]).some(
          (tl) => (tl.tasklist_guid as string) === tlId
        )
      );
    }

    respond({
      tasks: formatTasks(tasks),
      count: tasks.length,
    }, `${tasks.length} task(s)`);

  } else if (command === "add-member") {
    if (!args["task-id"]) fail("--task-id required");
    let memberId = args["member-id"] ?? "";
    if (!memberId && args.name) {
      const resolved = await resolveMembers(args.name, client);
      if (!resolved.length) fail(`No member found for '${args.name}'`);
      memberId = resolved[0]!;
    }
    if (!memberId) fail("--member-id or --name required");
    const role = args.role ?? "assignee";
    const body = { members: [{ id: memberId, role }] };
    const result = await userRequest(client, "POST", `/task/v2/tasks/${args["task-id"]}/add_members`, body);
    if ((result.code as number) !== 0) fail(`Add member failed: ${result.msg ?? "?"}`);
    respond(null, `Member ${memberId} added as ${role}`);

  } else if (command === "remove-member") {
    if (!args["task-id"]) fail("--task-id required");
    let memberId = args["member-id"] ?? "";
    if (!memberId && args.name) {
      const resolved = await resolveMembers(args.name, client);
      if (!resolved.length) fail(`No member found for '${args.name}'`);
      memberId = resolved[0]!;
    }
    if (!memberId) fail("--member-id or --name required");
    const role = args.role ?? "assignee";
    const body = { members: [{ id: memberId, role }] };
    const result = await userRequest(client, "POST", `/task/v2/tasks/${args["task-id"]}/remove_members`, body);
    if ((result.code as number) !== 0) fail(`Remove member failed: ${result.msg ?? "?"}`);
    respond(null, `Member ${memberId} removed`);

  } else if (command === "tasklist-create") {
    if (!args.name) fail("--name required");
    const result = await userRequest(client, "POST", "/task/v2/tasklists", { name: args.name });
    if ((result.code as number) !== 0) fail(`Create tasklist failed: ${result.msg ?? "?"}`);
    const tl = (result.data as Record<string, unknown>)?.tasklist as Record<string, unknown>;
    respond(tl, `Tasklist created: ${tl?.guid ?? "?"}`);

  } else if (command === "tasklist-list") {
    const result = await userRequest(client, "GET", "/task/v2/tasklists", undefined, {
      page_size: args["page-size"] ?? "20",
    });
    respond((result.data as Record<string, unknown>)?.items ?? []);

  } else if (command === "tasklist-get") {
    if (!args["tasklist-id"]) fail("--tasklist-id required");
    const result = await userRequest(client, "GET", `/task/v2/tasklists/${args["tasklist-id"]}`);
    if ((result.code as number) !== 0) fail(`Get tasklist failed: ${result.msg ?? "?"}`);
    respond((result.data as Record<string, unknown>)?.tasklist);

  } else if (command === "tasklist-add-task") {
    if (!args["tasklist-id"] || !args["task-id"]) fail("--tasklist-id and --task-id required");
    const result = await userRequest(
      client, "POST", `/task/v2/tasks/${args["task-id"]}/add_tasklist`,
      { tasklist_guid: args["tasklist-id"] }
    );
    if ((result.code as number) !== 0) fail(`Add to tasklist failed: ${result.msg ?? "?"}`);
    respond(null, `Task ${args["task-id"]} added to tasklist ${args["tasklist-id"]}`);

  } else if (command === "tasklist-delete") {
    if (!args["tasklist-id"]) fail("--tasklist-id required");
    const result = await userRequest(client, "DELETE", `/task/v2/tasklists/${args["tasklist-id"]}`);
    if ((result.code as number) !== 0) fail(`Delete tasklist failed: ${result.msg ?? "?"}`);
    respond(null, `Tasklist ${args["tasklist-id"]} deleted`);

  } else if (command === "section-create") {
    if (!args["tasklist-id"] || !args.name) fail("--tasklist-id and --name required");
    const result = await userRequest(
      client, "POST", "/task/v2/sections",
      { name: args.name },
      { tasklist_guid: args["tasklist-id"] }
    );
    if ((result.code as number) !== 0) fail(`Create section failed: ${result.msg ?? "?"}`);
    respond((result.data as Record<string, unknown>)?.section, "Section created");

  } else if (command === "section-list") {
    if (!args["tasklist-id"]) fail("--tasklist-id required");
    const result = await userRequest(client, "GET", "/task/v2/sections", undefined, {
      tasklist_guid: args["tasklist-id"],
      page_size: "50",
    });
    respond((result.data as Record<string, unknown>)?.items ?? []);

  } else if (command === "batch-create") {
    if (!args.file) fail("--file required");
    const tasks = JSON.parse(fs.readFileSync(args.file, "utf-8")) as Record<string, unknown>[];
    let created = 0, failed = 0;
    const results: Record<string, unknown>[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]!;
      if (!(t.summary as string)) { Log.warn(`Skipping task ${i}: missing summary`); continue; }

      const body = await buildTaskBody(client, args, t);
      const result = await userRequest(client, "POST", "/task/v2/tasks", body);
      if ((result.code as number) === 0) {
        created++;
        const task = (result.data as Record<string, unknown>)?.task as Record<string, unknown>;
        results.push({ summary: t.summary, guid: task?.guid });
      } else {
        failed++;
        results.push({ summary: t.summary, error: result.msg });
      }
      await sleep(300);
    }
    respond({ created, failed, total: tasks.length, results },
      `Batch: ${created} created, ${failed} failed / ${tasks.length} total`);

  } else if (command === "comment") {
    if (!args["task-id"]) fail("--task-id required");
    if (args.content) {
      // Write mode: add comment
      const result = await userRequest(client, "POST", "/task/v2/comments", {
        content: args.content,
        resource_type: "task",
        resource_id: args["task-id"],
      });
      if ((result.code as number) !== 0) fail(`Comment failed: ${result.msg ?? "?"}`);
      respond((result.data as Record<string, unknown>)?.comment, `Comment added to task ${args["task-id"]}`);
    } else {
      // Read mode: list comments
      const result = await userRequest(client, "GET", "/task/v2/comments", undefined, {
        resource_type: "task",
        resource_id: args["task-id"],
        page_size: args["page-size"] ?? "20",
      });
      respond((result.data as Record<string, unknown>)?.items ?? []);
    }

  } else {
    respond({
      commands: [
        "create", "get", "update", "complete", "delete", "list",
        "add-member", "remove-member",
        "tasklist-create", "tasklist-list", "tasklist-get", "tasklist-delete", "tasklist-add-task",
        "section-create", "section-list",
        "batch-create", "comment"
      ],
      usage: "./feishu task <command>",
    }, "Task management");
  }
}
