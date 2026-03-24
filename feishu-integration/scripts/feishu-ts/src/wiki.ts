/**
 * Feishu Wiki (Knowledge Base) Management CLI.
 *
 * Usage: ./feishu wiki space-list|space-get|space-create|node-list|node-get|
 *                      node-create|node-read|node-move|node-update|tree|
 *                      move-doc-to-wiki|import-from-drive|search|export
 */

import * as lark from "@larksuiteoapi/node-sdk";
import { Log } from "./log.js";
import {
  createLarkClient,
  userRequest,
  getAllPages,
} from "./client.js";
import { parseArgs, respond, fail, sleep } from "./utils.js";
import {
  exportDocument,
  readDocContent,
  readDocBlockList,
} from "./docx.js";

// ── Tree Builder (structured) ───────────────────────────────────────────────

interface WikiTreeNode {
  title: string;
  node_token: string;
  obj_token: string;
  obj_type: string;
  has_child: boolean;
  children?: WikiTreeNode[];
}

async function buildWikiTree(
  client: lark.Client, spaceId: string, parentToken: string, maxDepth: number, depth = 1
): Promise<WikiTreeNode[]> {
  if (depth > maxDepth) return [];
  const params: Record<string, string> = { page_size: "50" };
  if (parentToken) params.parent_node_token = parentToken;
  const items = await getAllPages(client, `/wiki/v2/spaces/${spaceId}/nodes`, params) as Record<string, unknown>[];
  const nodes: WikiTreeNode[] = [];
  for (const n of items) {
    const node: WikiTreeNode = {
      title: (n.title ?? "(unnamed)") as string,
      node_token: (n.node_token ?? "") as string,
      obj_token: (n.obj_token ?? "") as string,
      obj_type: (n.obj_type ?? "?") as string,
      has_child: !!n.has_child,
    };
    if (n.has_child) {
      node.children = await buildWikiTree(client, spaceId, node.node_token, maxDepth, depth + 1);
    }
    nodes.push(node);
    await sleep(100);
  }
  return nodes;
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function wikiMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (command === "space-list") {
    const items = await getAllPages(client, "/wiki/v2/spaces", { page_size: "50" }) as Record<string, unknown>[];
    respond({
      spaces: items.map(s => ({
        space_id: s.space_id,
        name: s.name,
        visibility: s.visibility,
        description: s.description,
      })),
      count: items.length,
    }, `${items.length} space(s)`);

  } else if (command === "space-get") {
    if (!args["space-id"]) fail("--space-id required");
    const result = await userRequest(client, "GET", `/wiki/v2/spaces/${args["space-id"]}`);
    if ((result.code as number) !== 0) fail(`Get space failed: ${result.msg ?? "?"}`);
    respond(result.data);

  } else if (command === "space-create") {
    if (!args.name) fail("--name required");
    const body: Record<string, unknown> = { name: args.name };
    if (args.description) body.description = args.description;
    const result = await userRequest(client, "POST", "/wiki/v2/spaces", body);
    if ((result.code as number) !== 0) fail(`Create space failed: ${result.msg ?? "?"}`);
    const space = (result.data as Record<string, unknown>)?.space as Record<string, unknown>;
    respond(space, `Wiki space created: ${space?.space_id ?? "?"}`);

  } else if (command === "node-list") {
    if (!args["space-id"]) fail("--space-id required");
    const params: Record<string, string> = { page_size: "50" };
    if (args["parent-node-token"]) params.parent_node_token = args["parent-node-token"];
    const items = await getAllPages(client, `/wiki/v2/spaces/${args["space-id"]}/nodes`, params) as Record<string, unknown>[];
    respond({
      nodes: items.map(n => ({
        node_token: n.node_token,
        title: n.title,
        obj_type: n.obj_type,
        obj_token: n.obj_token,
        has_child: n.has_child,
      })),
      count: items.length,
    }, `${items.length} node(s)`);

  } else if (command === "node-get") {
    if (!args.token) fail("--token required");
    const result = await userRequest(client, "GET", "/wiki/v2/spaces/get_node", undefined, { token: args.token });
    if ((result.code as number) !== 0) fail(`Get node failed: ${result.msg ?? "?"}`);
    respond((result.data as Record<string, unknown>)?.node);

  } else if (command === "node-create") {
    if (!args["space-id"]) fail("--space-id required");
    const body: Record<string, unknown> = {
      obj_type: args["obj-type"] ?? "docx",
      node_type: "origin",
    };
    if (args.title) body.title = args.title;
    if (args["parent-node-token"]) body.parent_node_token = args["parent-node-token"];
    const result = await userRequest(client, "POST", `/wiki/v2/spaces/${args["space-id"]}/nodes`, body);
    if ((result.code as number) !== 0) fail(`Create node failed: ${result.msg ?? "?"}`);
    const node = (result.data as Record<string, unknown>)?.node as Record<string, unknown>;
    respond(node, `Node created: ${node?.node_token ?? "?"}`);

  } else if (command === "node-read") {
    if (!args.token) fail("--token required");
    const info = await userRequest(client, "GET", "/wiki/v2/spaces/get_node", undefined, { token: args.token });
    const node = ((info.data as Record<string, unknown>)?.node ?? {}) as Record<string, unknown>;
    const objToken = (node.obj_token ?? "") as string;
    const objType = (node.obj_type ?? "") as string;
    const title = (node.title ?? "(untitled)") as string;

    if (!objToken) fail(`Cannot resolve node ${args.token}`);

    if (objType === "docx") {
      Log.info(`Reading: ${title} (obj_token=${objToken})`);
      if (args.blocks) {
        // Block list with positional index — for editing operations
        const result = await readDocBlockList(client, objToken);
        respond({ ...result, node_token: args.token, obj_token: objToken, title }, `${result.count} blocks`);
      } else if (args.raw) {
        // Raw unformatted text
        const result = await userRequest(client, "GET", `/docx/v1/documents/${objToken}/raw_content`);
        if ((result.code as number) !== 0) fail(`Read failed: ${result.msg ?? "?"}`);
        respond({
          content: ((result.data as Record<string, unknown>)?.content ?? "") as string,
          node_token: args.token,
          obj_token: objToken,
          title,
        }, `Wiki doc: ${title}`);
      } else {
        // Default: markdown-rendered content
        const result = await readDocContent(client, objToken);
        respond({ ...result, node_token: args.token, obj_token: objToken, title }, `${result.blocks_count} blocks rendered`);
      }
    } else if (objType === "bitable") {
      respond({
        node_token: args.token,
        obj_token: objToken,
        obj_type: objType,
        title,
        hint: `./feishu bitable list-tables --app-token ${objToken}`,
      }, `Bitable node: ${title}`);
    } else {
      respond({
        node_token: args.token,
        obj_token: objToken,
        obj_type: objType,
        title,
      }, `Node type '${objType}' — obj_token=${objToken}`);
    }

  } else if (command === "node-move") {
    if (!args["space-id"] || !args["node-token"] || !args["target-parent-token"])
      fail("--space-id, --node-token, --target-parent-token required");
    const body: Record<string, unknown> = { target_parent_token: args["target-parent-token"] };
    if (args["target-space-id"]) body.target_space_id = args["target-space-id"];
    const result = await userRequest(
      client, "POST",
      `/wiki/v2/spaces/${args["space-id"]}/nodes/${args["node-token"]}/move`,
      body
    );
    if ((result.code as number) !== 0) fail(`Move failed: ${result.msg ?? "?"}`);
    respond(null, `Node ${args["node-token"]} moved`);

  } else if (command === "node-update") {
    if (!args["space-id"] || !args["node-token"] || !args.title)
      fail("--space-id, --node-token, --title required");
    const result = await userRequest(
      client, "PUT",
      `/wiki/v2/spaces/${args["space-id"]}/nodes/${args["node-token"]}`,
      { title: args.title }
    );
    if ((result.code as number) !== 0) fail(`Update failed: ${result.msg ?? "?"}`);
    respond(null, `Node title updated to: ${args.title}`);

  } else if (command === "tree") {
    if (!args["space-id"]) fail("--space-id required");
    const maxDepth = Number(args.depth ?? "3");
    const tree = await buildWikiTree(client, args["space-id"], args["parent-node-token"] ?? "", maxDepth);
    respond({ space_id: args["space-id"], tree }, `Wiki tree (depth=${maxDepth})`);

  } else if (command === "move-doc-to-wiki") {
    if (!args["space-id"] || !args["obj-token"]) fail("--space-id, --obj-token required");
    const body: Record<string, unknown> = {
      obj_type: args["obj-type"] ?? "docx",
      obj_token: args["obj-token"],
    };
    if (args["parent-wiki-token"]) body.parent_wiki_token = args["parent-wiki-token"];

    const result = await userRequest(
      client, "POST",
      `/wiki/v2/spaces/${args["space-id"]}/nodes/move_docs_to_wiki`,
      body
    );
    if ((result.code as number) !== 0) fail(`Move failed: ${result.msg ?? "?"}`);
    const taskId = ((result.data as Record<string, unknown>)?.task_id ?? "") as string;

    if (args.wait && taskId) {
      Log.info(`Waiting for move task ${taskId}...`);
      const moved = await waitForMoveTask(client, taskId, Number(args.timeout ?? "30"));
      if (moved) {
        respond({ task_id: taskId, node: moved }, "Doc moved to wiki (completed)");
      } else {
        fail(`Move task ${taskId} did not complete in time.`, `./feishu wiki move-doc-to-wiki ... (retry)`);
      }
    } else {
      respond({ ...result.data as Record<string, unknown>, task_id: taskId }, "Doc move initiated" + (taskId ? ` (task_id: ${taskId})` : ""));
    }

  } else if (command === "import-from-drive") {
    if (!args["source-folder"] || !args["space-id"])
      fail("--source-folder, --space-id required");
    await importFromDrive(
      client,
      args["source-folder"],
      args["space-id"],
      args["parent-node-token"] ?? "",
      !!args["dry-run"]
    );

  } else if (command === "search") {
    if (!args.query) fail("--query required");

    if (args.recursive) {
      // Legacy: recursive tree walk with client-side title filter
      const keyword = args.query.toLowerCase();
      let spaces: Record<string, unknown>[];
      if (args["space-id"]) {
        spaces = [{ space_id: args["space-id"], name: args["space-id"] }];
      } else {
        spaces = await getAllPages(client, "/wiki/v2/spaces", { page_size: "50" }) as Record<string, unknown>[];
        if (!spaces.length) fail("No wiki spaces accessible.");
      }

      const collectNodes = async (
        spaceId: string, parentToken = "", nodePath = ""
      ): Promise<Record<string, unknown>[]> => {
        const params: Record<string, string> = { page_size: "50" };
        if (parentToken) params.parent_node_token = parentToken;
        const items = await getAllPages(client, `/wiki/v2/spaces/${spaceId}/nodes`, params) as Record<string, unknown>[];
        const results: Record<string, unknown>[] = [];
        for (const n of items) {
          const title = (n.title ?? "") as string;
          const p = nodePath ? `${nodePath}/${title}` : title;
          n._path = p;
          n._space_id = spaceId;
          results.push(n);
          if (n.has_child) {
            results.push(...await collectNodes(spaceId, (n.node_token ?? "") as string, p));
            await sleep(100);
          }
        }
        return results;
      };

      const allMatches: Record<string, unknown>[] = [];
      for (const space of spaces) {
        const sid = (space.space_id ?? "") as string;
        const sname = (space.name ?? sid) as string;
        Log.info(`Scanning: ${sname} ...`);
        const nodes = await collectNodes(sid);
        const matched = nodes.filter((n) =>
          ((n.title ?? "") as string).toLowerCase().includes(keyword)
        );
        for (const m of matched) m._space_name = sname;
        allMatches.push(...matched);
      }

      respond({
        results: allMatches.map(m => ({
          title: m.title,
          obj_type: m.obj_type,
          node_token: m.node_token,
          obj_token: m.obj_token,
          space_name: m._space_name,
          path: m._path,
        })),
        count: allMatches.length,
      }, `${allMatches.length} match(es) (recursive scan)`);

    } else {
      // Default: server-side content search API (fast, supports body search)
      const count = Math.min(Number(args.count ?? "20"), 50);
      const body: Record<string, unknown> = {
        search_key: args.query, count, offset: 0,
        owner_ids: [], chat_ids: [],
        docs_types: ["wiki"],
      };

      const result = await userRequest(client, "POST", "/suite/docs-api/search/object", body);
      const data = (result.data ?? {}) as Record<string, unknown>;
      const docs = (data.docs_entities ?? []) as Record<string, unknown>[];
      const total = (data.total ?? 0) as number;
      const hasMore = (data.has_more ?? false) as boolean;

      // Compound: --read auto-reads the first docx match
      let readContent: string | null = null;
      if (args.read && docs.length) {
        const first = docs[0]!;
        const firstToken = (first.docs_token ?? "") as string;
        if (firstToken) {
          Log.info(`Reading: ${first.title ?? "?"}`);
          try {
            const rc = await readDocContent(client, firstToken);
            readContent = rc.content;
          } catch {
            // Wiki node token may need resolution — fall back to raw_content
            const raw = await userRequest(client, "GET", `/docx/v1/documents/${firstToken}/raw_content`);
            if ((raw.code as number) === 0) {
              readContent = ((raw.data as Record<string, unknown>)?.content ?? "") as string;
            }
          }
        }
      }

      respond({
        results: docs.map(doc => ({
          title: doc.title,
          docs_type: doc.docs_type,
          docs_token: doc.docs_token,
          url: `https://feishu.cn/wiki/${doc.docs_token}`,
        })),
        count: docs.length,
        total,
        has_more: hasMore,
        ...(readContent !== null ? { read_content: readContent, read_token: docs[0]?.docs_token } : {}),
      }, `${docs.length}/${total} result(s)${readContent !== null ? " (first doc read)" : ""}`);
    }

  } else if (command === "export") {
    let token = args.token ?? "";
    if (!token && args.url) {
      const m = args.url.match(/\/wiki\/([A-Za-z0-9]+)/);
      if (m) token = m[1]!;
      else fail("Cannot extract wiki token from URL");
    }
    if (!token) fail("Provide --token or --url");

    const info = await userRequest(client, "GET", "/wiki/v2/spaces/get_node", undefined, { token });
    const node = ((info.data as Record<string, unknown>)?.node ?? {}) as Record<string, unknown>;
    const objToken = (node.obj_token ?? "") as string;
    const objType = (node.obj_type ?? "") as string;
    const title = (node.title ?? "(untitled)") as string;

    if (!objToken) fail(`Cannot resolve wiki node: ${token}`);
    if (objType !== "docx") fail(`Wiki export only supports docx nodes, got '${objType}'`);

    Log.info(`Exporting wiki: ${title} (obj_token=${objToken})`);
    const outPath = await exportDocument(client, objToken, args.output ?? "", !args["no-images"]);
    respond({ node_token: token, obj_token: objToken, output: outPath, title }, `Exported: ${outPath}`);

  } else {
    respond({
      commands: [
        "space-list", "space-get", "space-create",
        "node-list", "node-get", "node-create", "node-read", "node-move", "node-update",
        "tree", "move-doc-to-wiki",
        "import-from-drive", "search", "export"
      ],
      usage: "./feishu wiki <command>",
    }, "Wiki management");
  }
}

// ── Drive → Wiki Import Engine ──────────────────────────────────────────────

async function importFromDrive(
  client: lark.Client,
  sourceFolder: string,
  spaceId: string,
  parentNodeToken: string,
  dryRun: boolean
): Promise<void> {
  Log.info(`Scanning source folder: ${sourceFolder}`);
  const allFiles = await collectFilesRecursive(client, sourceFolder);
  const docs = allFiles.filter((f) => f.type !== "folder");
  const folders = allFiles.filter((f) => f.type === "folder");

  if (dryRun) {
    respond({
      files: allFiles.map(f => ({ type: f.type, name: f.name, path: f.path, token: f.token })),
      docs_count: docs.length,
      folders_count: folders.length,
      dry_run: true,
    }, `Dry run: ${docs.length} docs, ${folders.length} folders to import`);
    return;
  }

  if (!docs.length) fail("No documents found to import.");

  const rootResult = await userRequest(client, "GET", "/drive/explorer/v2/root_folder/meta");
  const rootToken = ((rootResult.data as Record<string, unknown>)?.token ?? "") as string;
  if (!rootToken) fail("Cannot determine root folder token.");

  const stagingName = `_wiki_import_${Math.floor(Date.now() / 1000)}`;
  const cr = await userRequest(client, "POST", "/drive/v1/files/create_folder", {
    name: stagingName, folder_token: rootToken,
  });
  const stagingToken = ((cr.data as Record<string, unknown>)?.token ?? "") as string;
  if (!stagingToken) fail(`Failed to create staging folder: ${cr.msg ?? "?"}`);
  Log.ok(`Staging folder created: ${stagingName} (${stagingToken})`);

  const wikiFolderMap: Record<string, string> = { "": parentNodeToken };

  for (const folder of folders) {
    const parentPath = folder.path.split("/").slice(0, -1).join("/");
    const parentWikiToken = wikiFolderMap[parentPath] ?? parentNodeToken;
    const body: Record<string, unknown> = { obj_type: "docx", node_type: "origin", title: folder.name };
    if (parentWikiToken) body.parent_node_token = parentWikiToken;
    const result = await userRequest(client, "POST", `/wiki/v2/spaces/${spaceId}/nodes`, body);
    const node = ((result.data as Record<string, unknown>)?.node ?? {}) as Record<string, unknown>;
    const nodeToken = (node.node_token ?? "") as string;
    if (!nodeToken) fail(`Failed to create Wiki folder: ${folder.name}`);
    wikiFolderMap[folder.path] = nodeToken;
    Log.ok(`  📂 Wiki folder: ${folder.name} → ${nodeToken}`);
    await sleep(500);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    Log.info(`  [${i + 1}/${docs.length}] ${doc.path}`);

    const copyResult = await userRequest(client, "POST", `/drive/v1/files/${doc.token}/copy`, {
      type: doc.type, folder_token: stagingToken, name: doc.name,
    });
    if ((copyResult.code as number) !== 0) {
      Log.error(`    Copy failed: ${copyResult.msg ?? "?"}`);
      failCount++;
      await sleep(1000);
      continue;
    }
    const copyToken = (((copyResult.data as Record<string, unknown>)?.file as Record<string, unknown>)?.token ?? "") as string;
    if (!copyToken) { Log.error("    Copy returned no token"); failCount++; continue; }

    const parentPath = doc.path.split("/").slice(0, -1).join("/");
    const parentWikiToken = wikiFolderMap[parentPath] ?? parentNodeToken;

    const moveBody: Record<string, unknown> = { obj_type: doc.type, obj_token: copyToken };
    if (parentWikiToken) moveBody.parent_wiki_token = parentWikiToken;
    const moveResult = await userRequest(
      client, "POST",
      `/wiki/v2/spaces/${spaceId}/nodes/move_docs_to_wiki`,
      moveBody
    );
    const moveData = (moveResult.data ?? {}) as Record<string, unknown>;

    if ((moveResult.code as number) !== 0) {
      Log.error(`    Move failed: ${moveResult.msg ?? "?"}`);
      failCount++;
      await sleep(1000);
      continue;
    }

    if (moveData.wiki_token) {
      Log.ok(`    → ${moveData.wiki_token}`);
      successCount++;
    } else if (moveData.task_id) {
      const node = await waitForMoveTask(client, moveData.task_id as string);
      if (node) { Log.ok(`    → ${node.node_token ?? "?"}`); successCount++; }
      else failCount++;
    } else {
      Log.warn("    Unexpected response");
      failCount++;
    }

    await sleep(1500);
  }

  // Cleanup: trash the staging folder
  try {
    await userRequest(client, "DELETE", `/drive/v1/files/${stagingToken}`, { type: "folder" });
    Log.ok(`Staging folder cleaned up: ${stagingName}`);
  } catch {
    Log.warn(`Could not cleanup staging folder: ${stagingName} (${stagingToken})`);
  }

  respond({
    success: successCount,
    failed: failCount,
    total: docs.length,
  }, `Import: ${successCount} success, ${failCount} failed / ${docs.length} total`);
}

interface DriveFile {
  token: string;
  name: string;
  type: string;
  path: string;
}

async function collectFilesRecursive(
  client: lark.Client, folderToken: string, prefix = ""
): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  const files = await getAllPages(client, "/drive/v1/files", {
    folder_token: folderToken, page_size: "200",
    order_by: "EditedTime", direction: "DESC",
  }, "files") as Record<string, unknown>[];

  for (const f of files) {
    const name = (f.name ?? "(unnamed)") as string;
    const ftype = (f.type ?? "?") as string;
    const token = (f.token ?? "") as string;
    const fpath = prefix ? `${prefix}/${name}` : name;

    if (ftype === "folder") {
      result.push({ token, name, type: "folder", path: fpath });
      result.push(...await collectFilesRecursive(client, token, fpath));
      await sleep(200);
    } else {
      result.push({ token, name, type: ftype, path: fpath });
    }
  }
  return result;
}

async function waitForMoveTask(
  client: lark.Client, taskId: string, maxWait = 30
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < maxWait; i++) {
    await sleep(1000);
    const result = await userRequest(client, "GET", `/wiki/v2/tasks/${taskId}`, undefined, { task_type: "move" });
    if ((result.code as number) !== 0) continue;
    const task = ((result.data as Record<string, unknown>)?.task ?? {}) as Record<string, unknown>;
    const moveResults = (task.move_result ?? []) as Record<string, unknown>[];
    if (!moveResults.length) continue;
    const mr = moveResults[0]!;
    const status = mr.status as number;
    if (status === 0) return (mr.node ?? {}) as Record<string, unknown>;
    if (status === 1) continue;
    Log.error(`  Task failed (status=${status}): ${mr.status_msg ?? "?"}`);
    return null;
  }
  Log.warn(`  Task ${taskId} timed out after ${maxWait}s`);
  return null;
}
