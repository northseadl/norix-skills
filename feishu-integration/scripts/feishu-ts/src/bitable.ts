/**
 * Feishu Bitable (多维表格) Management CLI.
 *
 * Usage: ./feishu bitable list-tables|list-fields|list-records|get-record|
 *                         create-record|update-record|delete-record|
 *                         batch-create|batch-update|batch-delete|
 *                         create-table|delete-table|get-app|create-app|export
 */

import * as fs from "node:fs";
import { Log } from "./log.js";
import { createLarkClient, userRequest, getAllPages } from "./client.js";
import { parseArgs, respond, fail, sleep } from "./utils.js";

const TYPE_NAMES: Record<number, string> = {
  1: "Text", 2: "Number", 3: "Select", 4: "MultiSel",
  5: "DateTime", 7: "Check", 11: "Person", 13: "Phone",
  15: "Link", 17: "Attach", 18: "Relation", 19: "Lookup",
  20: "Formula", 22: "Created", 23: "Modified",
  1001: "CreatedBy", 1002: "ModifiedBy", 1005: "AutoNum",
};

function extractAppToken(urlOrToken: string): string {
  const match = urlOrToken.match(/\/base\/([A-Za-z0-9]+)/);
  if (match) return match[1]!;
  return urlOrToken.trim();
}

function parseFieldsJson(raw: string): Record<string, unknown> {
  if (fs.existsSync(raw)) {
    return JSON.parse(fs.readFileSync(raw, "utf-8"));
  }
  return JSON.parse(raw);
}

function flattenFieldValue(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === "object" && item !== null) {
        return (item as Record<string, string>).text ??
          (item as Record<string, string>).name ??
          (item as Record<string, string>).id ??
          item;
      }
      return item;
    });
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, string>;
    return obj.text ?? obj.link ?? val;
  }
  return val;
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function bitableMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (args["app-token"]) args["app-token"] = extractAppToken(args["app-token"]);

  const base = "/bitable/v1/apps";

  if (command === "get-app") {
    if (!args["app-token"]) fail("--app-token required");
    const result = await userRequest(client, "GET", `${base}/${args["app-token"]}`);
    if ((result.code as number) !== 0) fail(`Get app failed: ${result.msg ?? "?"}`);
    respond(result.data);

  } else if (command === "create-app") {
    if (!args.name) fail("--name required");
    const body: Record<string, unknown> = { name: args.name };
    if (args["folder-token"]) body.folder_token = args["folder-token"];
    const result = await userRequest(client, "POST", base, body);
    if ((result.code as number) !== 0) fail(`Create app failed: ${result.msg ?? "?"}`);
    const app = (result.data as Record<string, unknown>)?.app as Record<string, unknown>;
    const token = (app?.app_token ?? "?") as string;
    respond({
      app_token: token,
      url: `https://feishu.cn/base/${token}`,
      ...app,
    }, `Bitable created: ${token}`);

  } else if (command === "list-tables") {
    if (!args["app-token"]) fail("--app-token required");
    const items = await getAllPages(client, `${base}/${args["app-token"]}/tables`, { page_size: "20" });
    respond({
      tables: (items as Record<string, unknown>[]).map(t => ({
        table_id: t.table_id,
        name: t.name,
        revision: t.revision,
      })),
      count: items.length,
    }, `${items.length} table(s)`);

  } else if (command === "create-table") {
    if (!args["app-token"] || !args.name) fail("--app-token and --name required");
    const result = await userRequest(client, "POST", `${base}/${args["app-token"]}/tables`, {
      table: { name: args.name },
    });
    if ((result.code as number) !== 0) fail(`Create table failed: ${result.msg ?? "?"}`);
    respond(result.data, `Table created: ${(result.data as Record<string, unknown>)?.table_id ?? "?"}`);

  } else if (command === "delete-table") {
    if (!args["app-token"] || !args["table-id"]) fail("--app-token and --table-id required");
    const result = await userRequest(client, "DELETE", `${base}/${args["app-token"]}/tables/${args["table-id"]}`);
    if ((result.code as number) !== 0) fail(`Delete table failed: ${result.msg ?? "?"}`);
    respond(null, `Table ${args["table-id"]} deleted`);

  } else if (command === "list-fields") {
    if (!args["app-token"] || !args["table-id"]) fail("--app-token and --table-id required");
    const items = await getAllPages(
      client, `${base}/${args["app-token"]}/tables/${args["table-id"]}/fields`, { page_size: "100" }
    ) as Record<string, unknown>[];
    respond({
      fields: items.map(f => ({
        field_id: f.field_id,
        field_name: f.field_name,
        type: f.type,
        type_name: TYPE_NAMES[(f.type ?? 0) as number] ?? `type=${f.type}`,
        is_primary: f.is_primary ?? false,
      })),
      count: items.length,
    }, `${items.length} field(s)`);

  } else if (command === "create-field") {
    if (!args["app-token"] || !args["table-id"] || !args.name || !args.type)
      fail("--app-token, --table-id, --name, --type required");
    const result = await userRequest(
      client, "POST", `${base}/${args["app-token"]}/tables/${args["table-id"]}/fields`,
      { field_name: args.name, type: Number(args.type) }
    );
    if ((result.code as number) !== 0) fail(`Create field failed: ${result.msg ?? "?"}`);
    respond(result.data, "Field created");

  } else if (command === "list-records") {
    if (!args["app-token"] || !args["table-id"]) fail("--app-token and --table-id required");
    const params: Record<string, string> = { page_size: args["page-size"] ?? "100" };
    if (args["view-id"]) params.view_id = args["view-id"];
    if (args.filter) params.filter = args.filter;

    const items = await getAllPages(
      client, `${base}/${args["app-token"]}/tables/${args["table-id"]}/records`, params
    ) as Record<string, unknown>[];

    respond({
      records: items.map(r => {
        const fields = (r.fields ?? {}) as Record<string, unknown>;
        const flat: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) flat[k] = flattenFieldValue(v);
        return { record_id: r.record_id, fields: flat };
      }),
      count: items.length,
    }, `${items.length} record(s)`);

  } else if (command === "get-record") {
    if (!args["app-token"] || !args["table-id"] || !args["record-id"])
      fail("--app-token, --table-id, --record-id required");
    const result = await userRequest(client, "GET",
      `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/${args["record-id"]}`);
    if ((result.code as number) !== 0) fail(`Get record failed: ${result.msg ?? "?"}`);
    respond(result.data);

  } else if (command === "create-record") {
    if (!args["app-token"] || !args["table-id"] || !args.fields)
      fail("--app-token, --table-id, --fields required");
    const fields = parseFieldsJson(args.fields);
    const result = await userRequest(
      client, "POST", `${base}/${args["app-token"]}/tables/${args["table-id"]}/records`,
      { fields }
    );
    if ((result.code as number) !== 0) fail(`Create record failed: ${result.msg ?? "?"}`);
    const rid = ((result.data as Record<string, unknown>)?.record as Record<string, unknown>)?.record_id ?? "?";
    respond(result.data, `Record created: ${rid}`);

  } else if (command === "update-record") {
    if (!args["app-token"] || !args["table-id"] || !args["record-id"] || !args.fields)
      fail("--app-token, --table-id, --record-id, --fields required");
    const fields = parseFieldsJson(args.fields);
    const result = await userRequest(
      client, "PUT",
      `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/${args["record-id"]}`,
      { fields }
    );
    if ((result.code as number) !== 0) fail(`Update record failed: ${result.msg ?? "?"}`);
    respond(result.data, `Record ${args["record-id"]} updated`);

  } else if (command === "delete-record") {
    if (!args["app-token"] || !args["table-id"] || !args["record-id"])
      fail("--app-token, --table-id, --record-id required");
    const result = await userRequest(
      client, "DELETE",
      `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/${args["record-id"]}`
    );
    if ((result.code as number) !== 0) fail(`Delete record failed: ${result.msg ?? "?"}`);
    respond(null, `Record ${args["record-id"]} deleted`);

  } else if (command === "batch-create") {
    if (!args["app-token"] || !args["table-id"] || !args.file)
      fail("--app-token, --table-id, --file required");
    const records = JSON.parse(fs.readFileSync(args.file, "utf-8")) as Record<string, unknown>[];
    let created = 0;
    for (let start = 0; start < records.length; start += 500) {
      const batch = records.slice(start, start + 500);
      const result = await userRequest(
        client, "POST",
        `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/batch_create`,
        { records: batch.map((r) => ("fields" in r ? r : { fields: r })) }
      );
      if ((result.code as number) !== 0) fail(`Batch create failed at offset ${start}: ${result.msg ?? "?"}`);
      created += batch.length;
      if (start + 500 < records.length) await sleep(500);
    }
    respond({ created, total: records.length }, `Batch created ${created} records`);

  } else if (command === "batch-update") {
    if (!args["app-token"] || !args["table-id"] || !args.file)
      fail("--app-token, --table-id, --file required");
    const records = JSON.parse(fs.readFileSync(args.file, "utf-8")) as Record<string, unknown>[];
    let updated = 0;
    for (let start = 0; start < records.length; start += 500) {
      const batch = records.slice(start, start + 500);
      const result = await userRequest(
        client, "POST",
        `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/batch_update`,
        { records: batch }
      );
      if ((result.code as number) !== 0) fail(`Batch update failed at offset ${start}: ${result.msg ?? "?"}`);
      updated += batch.length;
      if (start + 500 < records.length) await sleep(500);
    }
    respond({ updated, total: records.length }, `Batch updated ${updated} records`);

  } else if (command === "batch-delete") {
    if (!args["app-token"] || !args["table-id"] || !args["record-ids"])
      fail("--app-token, --table-id, --record-ids required");
    const recordIds = args["record-ids"].split(",").map((r) => r.trim()).filter(Boolean);
    let deleted = 0;
    for (let start = 0; start < recordIds.length; start += 500) {
      const batch = recordIds.slice(start, start + 500);
      const result = await userRequest(
        client, "POST",
        `${base}/${args["app-token"]}/tables/${args["table-id"]}/records/batch_delete`,
        { records: batch }
      );
      if ((result.code as number) !== 0) fail(`Batch delete failed at offset ${start}: ${result.msg ?? "?"}`);
      deleted += batch.length;
      if (start + 500 < recordIds.length) await sleep(500);
    }
    respond({ deleted, total: recordIds.length }, `Batch deleted ${deleted} records`);

  } else if (command === "export") {
    if (!args["app-token"] || !args["table-id"]) fail("--app-token and --table-id required");
    const params: Record<string, string> = { page_size: "500" };
    if (args["view-id"]) params.view_id = args["view-id"];
    if (args.filter) params.filter = args.filter;

    const items = await getAllPages(
      client, `${base}/${args["app-token"]}/tables/${args["table-id"]}/records`, params
    ) as Record<string, unknown>[];

    if (!items.length) fail("No records to export");

    const format = args.format ?? "json";
    const records = items.map((r) => ({
      record_id: r.record_id,
      ...(r.fields as Record<string, unknown>),
    }));

    if (args.output) {
      let content: string;
      if (format === "csv") {
        const fieldNames = Object.keys((items[0]!.fields ?? {}) as Record<string, unknown>);
        const rows = [["record_id", ...fieldNames].join(",")];
        for (const rec of items) {
          const fields = (rec.fields ?? {}) as Record<string, unknown>;
          const row = [(rec.record_id ?? "") as string, ...fieldNames.map(n => {
            const v = flattenFieldValue(fields[n]);
            return String(v ?? "");
          })];
          rows.push(row.map((c) => `"${c.replace(/"/g, '""')}"`).join(","));
        }
        content = rows.join("\n");
      } else {
        content = JSON.stringify(records, null, 2);
      }
      fs.writeFileSync(args.output, content);
      respond({ count: items.length, output: args.output, format }, `Exported ${items.length} records to ${args.output}`);
    } else {
      respond({ records, count: items.length, format }, `${items.length} record(s) exported`);
    }

  } else {
    respond({
      commands: [
        "get-app", "create-app",
        "list-tables", "create-table", "delete-table",
        "list-fields", "create-field",
        "list-records", "get-record", "create-record", "update-record", "delete-record",
        "batch-create", "batch-update", "batch-delete",
        "export"
      ],
      usage: "./feishu bitable <command>",
    }, "Bitable management");
  }
}
