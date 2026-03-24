/**
 * Feishu Approval (审批) Management CLI.
 *
 * Usage: ./feishu approval list-definitions|get-definition|create|get|list|
 *                          approve|reject|cancel
 */

import * as fs from "node:fs";
import {
  createLarkClient,
  userRequest,
} from "./client.js";
import { parseArgs, respond, fail } from "./utils.js";

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function approvalMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (command === "list-definitions") {
    const result = await userRequest(client, "GET", "/approval/v4/approvals", undefined, {
      page_size: args.limit ?? "20",
      locale: "zh-CN",
    });
    const data = (result.data ?? {}) as Record<string, unknown>;
    const definitions = (data.approval_list ?? []) as Record<string, unknown>[];
    respond({
      definitions: definitions.map(d => ({
        approval_code: d.approval_code,
        approval_name: d.approval_name,
        status: d.status,
      })),
      count: definitions.length,
    }, `${definitions.length} definition(s)`);

  } else if (command === "get-definition") {
    if (!args.code) fail("--code required");
    const result = await userRequest(client, "GET", `/approval/v4/approvals/${args.code}`);
    if ((result.code as number) !== 0) fail(`Get definition failed: ${result.msg ?? "?"}`);
    const data = (result.data ?? {}) as Record<string, unknown>;
    const formStr = ((data.form as Record<string, string>)?.form_content ?? "[]") as string;
    let formFields: unknown[];
    try { formFields = JSON.parse(formStr); } catch { formFields = []; }
    respond({
      approval_name: data.approval_name,
      approval_code: args.code,
      form_fields: formFields,
    });

  } else if (command === "create") {
    if (!args.code || !args.form) fail("--code and --form required");
    let formData = args.form;
    if (fs.existsSync(formData)) {
      formData = fs.readFileSync(formData, "utf-8");
    }

    const body: Record<string, unknown> = {
      approval_code: args.code,
      form: formData,
    };
    if (args.approvers) {
      const approverIds = args.approvers.split(",").map((a) => a.trim());
      body.approval_node_list = [{
        custom_node_id: "approval_node",
        type: "AND",
        approver_id_list: approverIds,
      }];
    }
    if (args.cc) {
      body.cc_id_list = args.cc.split(",").map((c) => c.trim());
    }

    const result = await userRequest(client, "POST", "/approval/v4/instances", body);
    if ((result.code as number) !== 0) fail(`Create failed: ${result.msg ?? "?"}`);
    const instanceId = ((result.data as Record<string, unknown>)?.instance_id ?? "?") as string;
    respond({ instance_id: instanceId }, `Approval created: ${instanceId}`);

  } else if (command === "get") {
    if (!args["instance-id"]) fail("--instance-id required");
    const result = await userRequest(client, "GET", `/approval/v4/instances/${args["instance-id"]}`);
    if ((result.code as number) !== 0) fail(`Get failed: ${result.msg ?? "?"}`);
    respond(result.data);

  } else if (command === "list") {
    if (!args.code) fail("--code required");
    const body: Record<string, unknown> = {
      approval_code: args.code,
      limit: Number(args.limit ?? "20"),
      offset: 0,
    };
    if (args.status) body.instance_status = args.status;
    if (args["start-time"]) body.start_time = args["start-time"];
    if (args["end-time"]) body.end_time = args["end-time"];

    const result = await userRequest(client, "POST", "/approval/v4/instances/query", body);
    const data = (result.data ?? {}) as Record<string, unknown>;
    const instances = (data.instance_list ?? []) as Record<string, unknown>[];
    respond({
      instances: instances.map(inst => ({
        instance_id: inst.instance_id,
        status: inst.status,
        start_time: inst.start_time,
      })),
      total: data.total ?? instances.length,
      count: instances.length,
    }, `${instances.length} instance(s)`);

  } else if (command === "approve") {
    if (!args["instance-id"] || !args["task-id"]) fail("--instance-id and --task-id required");
    const body: Record<string, unknown> = {
      approval_code: "",
      instance_code: args["instance-id"],
      task_id: args["task-id"],
    };
    if (args.comment) body.comment = args.comment;
    const result = await userRequest(client, "POST", "/approval/v4/tasks/approve", body);
    if ((result.code as number) !== 0) fail(`Approve failed: ${result.msg ?? "?"}`);
    respond(null, `Task ${args["task-id"]} approved`);

  } else if (command === "reject") {
    if (!args["instance-id"] || !args["task-id"]) fail("--instance-id and --task-id required");
    const body: Record<string, unknown> = {
      approval_code: "",
      instance_code: args["instance-id"],
      task_id: args["task-id"],
    };
    if (args.comment) body.comment = args.comment;
    const result = await userRequest(client, "POST", "/approval/v4/tasks/reject", body);
    if ((result.code as number) !== 0) fail(`Reject failed: ${result.msg ?? "?"}`);
    respond(null, `Task ${args["task-id"]} rejected`);

  } else if (command === "cancel") {
    if (!args["instance-id"]) fail("--instance-id required");
    const result = await userRequest(
      client, "POST",
      `/approval/v4/instances/${args["instance-id"]}/cancel`,
      { reason: args.reason ?? "Agent canceled" }
    );
    if ((result.code as number) !== 0) fail(`Cancel failed: ${result.msg ?? "?"}`);
    respond(null, `Instance ${args["instance-id"]} canceled`);

  } else {
    respond({
      commands: ["list-definitions", "get-definition", "create", "get", "list", "approve", "reject", "cancel"],
      usage: "./feishu approval <command>",
    }, "Approval management");
  }
}
