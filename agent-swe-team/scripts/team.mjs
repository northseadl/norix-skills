#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@openai/codex-sdk/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  Codex: () => Codex,
  Thread: () => Thread
});
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import path2 from "path";
import readline from "readline";
import { createRequire } from "module";
async function createOutputSchemaFile(schema) {
  if (schema === void 0) {
    return { cleanup: async () => {
    } };
  }
  if (!isJsonObject(schema)) {
    throw new Error("outputSchema must be a plain JSON object");
  }
  const schemaDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-output-schema-"));
  const schemaPath = path.join(schemaDir, "schema.json");
  const cleanup = async () => {
    try {
      await fs.rm(schemaDir, { recursive: true, force: true });
    } catch {
    }
  };
  try {
    await fs.writeFile(schemaPath, JSON.stringify(schema), "utf8");
    return { schemaPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeInput(input) {
  if (typeof input === "string") {
    return { prompt: input, images: [] };
  }
  const promptParts = [];
  const images = [];
  for (const item of input) {
    if (item.type === "text") {
      promptParts.push(item.text);
    } else if (item.type === "local_image") {
      images.push(item.path);
    }
  }
  return { prompt: promptParts.join("\n\n"), images };
}
function serializeConfigOverrides(configOverrides) {
  const overrides = [];
  flattenConfigOverrides(configOverrides, "", overrides);
  return overrides;
}
function flattenConfigOverrides(value, prefix, overrides) {
  if (!isPlainObject(value)) {
    if (prefix) {
      overrides.push(`${prefix}=${toTomlValue(value, prefix)}`);
      return;
    } else {
      throw new Error("Codex config overrides must be a plain object");
    }
  }
  const entries = Object.entries(value);
  if (!prefix && entries.length === 0) {
    return;
  }
  if (prefix && entries.length === 0) {
    overrides.push(`${prefix}={}`);
    return;
  }
  for (const [key, child] of entries) {
    if (!key) {
      throw new Error("Codex config override keys must be non-empty strings");
    }
    if (child === void 0) {
      continue;
    }
    const path3 = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) {
      flattenConfigOverrides(child, path3, overrides);
    } else {
      overrides.push(`${path3}=${toTomlValue(child, path3)}`);
    }
  }
}
function toTomlValue(value, path3) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Codex config override at ${path3} must be a finite number`);
    }
    return `${value}`;
  } else if (typeof value === "boolean") {
    return value ? "true" : "false";
  } else if (Array.isArray(value)) {
    const rendered = value.map((item, index) => toTomlValue(item, `${path3}[${index}]`));
    return `[${rendered.join(", ")}]`;
  } else if (isPlainObject(value)) {
    const parts = [];
    for (const [key, child] of Object.entries(value)) {
      if (!key) {
        throw new Error("Codex config override keys must be non-empty strings");
      }
      if (child === void 0) {
        continue;
      }
      parts.push(`${formatTomlKey(key)} = ${toTomlValue(child, `${path3}.${key}`)}`);
    }
    return `{${parts.join(", ")}}`;
  } else if (value === null) {
    throw new Error(`Codex config override at ${path3} cannot be null`);
  } else {
    const typeName = typeof value;
    throw new Error(`Unsupported Codex config override value at ${path3}: ${typeName}`);
  }
}
function formatTomlKey(key) {
  return TOML_BARE_KEY.test(key) ? key : JSON.stringify(key);
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function findCodexPath() {
  const { platform, arch } = process;
  let targetTriple = null;
  switch (platform) {
    case "linux":
    case "android":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-unknown-linux-musl";
          break;
        case "arm64":
          targetTriple = "aarch64-unknown-linux-musl";
          break;
        default:
          break;
      }
      break;
    case "darwin":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-apple-darwin";
          break;
        case "arm64":
          targetTriple = "aarch64-apple-darwin";
          break;
        default:
          break;
      }
      break;
    case "win32":
      switch (arch) {
        case "x64":
          targetTriple = "x86_64-pc-windows-msvc";
          break;
        case "arm64":
          targetTriple = "aarch64-pc-windows-msvc";
          break;
        default:
          break;
      }
      break;
    default:
      break;
  }
  if (!targetTriple) {
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
  }
  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  if (!platformPackage) {
    throw new Error(`Unsupported target triple: ${targetTriple}`);
  }
  let vendorRoot;
  try {
    const codexPackageJsonPath = moduleRequire.resolve(`${CODEX_NPM_NAME}/package.json`);
    const codexRequire = createRequire(codexPackageJsonPath);
    const platformPackageJsonPath = codexRequire.resolve(`${platformPackage}/package.json`);
    vendorRoot = path2.join(path2.dirname(platformPackageJsonPath), "vendor");
  } catch {
    throw new Error(
      `Unable to locate Codex CLI binaries. Ensure ${CODEX_NPM_NAME} is installed with optional dependencies.`
    );
  }
  const archRoot = path2.join(vendorRoot, targetTriple);
  const codexBinaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const binaryPath = path2.join(archRoot, "codex", codexBinaryName);
  return binaryPath;
}
var Thread, INTERNAL_ORIGINATOR_ENV, TYPESCRIPT_SDK_ORIGINATOR, CODEX_NPM_NAME, PLATFORM_PACKAGE_BY_TARGET, moduleRequire, CodexExec, TOML_BARE_KEY, Codex;
var init_dist = __esm({
  "node_modules/@openai/codex-sdk/dist/index.js"() {
    Thread = class {
      _exec;
      _options;
      _id;
      _threadOptions;
      /** Returns the ID of the thread. Populated after the first turn starts. */
      get id() {
        return this._id;
      }
      /* @internal */
      constructor(exec2, options, threadOptions, id = null) {
        this._exec = exec2;
        this._options = options;
        this._id = id;
        this._threadOptions = threadOptions;
      }
      /** Provides the input to the agent and streams events as they are produced during the turn. */
      async runStreamed(input, turnOptions = {}) {
        return { events: this.runStreamedInternal(input, turnOptions) };
      }
      async *runStreamedInternal(input, turnOptions = {}) {
        const { schemaPath, cleanup } = await createOutputSchemaFile(turnOptions.outputSchema);
        const options = this._threadOptions;
        const { prompt, images } = normalizeInput(input);
        const generator = this._exec.run({
          input: prompt,
          baseUrl: this._options.baseUrl,
          apiKey: this._options.apiKey,
          threadId: this._id,
          images,
          model: options?.model,
          sandboxMode: options?.sandboxMode,
          workingDirectory: options?.workingDirectory,
          skipGitRepoCheck: options?.skipGitRepoCheck,
          outputSchemaFile: schemaPath,
          modelReasoningEffort: options?.modelReasoningEffort,
          signal: turnOptions.signal,
          networkAccessEnabled: options?.networkAccessEnabled,
          webSearchMode: options?.webSearchMode,
          webSearchEnabled: options?.webSearchEnabled,
          approvalPolicy: options?.approvalPolicy,
          additionalDirectories: options?.additionalDirectories
        });
        try {
          for await (const item of generator) {
            let parsed;
            try {
              parsed = JSON.parse(item);
            } catch (error) {
              throw new Error(`Failed to parse item: ${item}`, { cause: error });
            }
            if (parsed.type === "thread.started") {
              this._id = parsed.thread_id;
            }
            yield parsed;
          }
        } finally {
          await cleanup();
        }
      }
      /** Provides the input to the agent and returns the completed turn. */
      async run(input, turnOptions = {}) {
        const generator = this.runStreamedInternal(input, turnOptions);
        const items = [];
        let finalResponse = "";
        let usage = null;
        let turnFailure = null;
        for await (const event of generator) {
          if (event.type === "item.completed") {
            if (event.item.type === "agent_message") {
              finalResponse = event.item.text;
            }
            items.push(event.item);
          } else if (event.type === "turn.completed") {
            usage = event.usage;
          } else if (event.type === "turn.failed") {
            turnFailure = event.error;
            break;
          }
        }
        if (turnFailure) {
          throw new Error(turnFailure.message);
        }
        return { items, finalResponse, usage };
      }
    };
    INTERNAL_ORIGINATOR_ENV = "CODEX_INTERNAL_ORIGINATOR_OVERRIDE";
    TYPESCRIPT_SDK_ORIGINATOR = "codex_sdk_ts";
    CODEX_NPM_NAME = "@openai/codex";
    PLATFORM_PACKAGE_BY_TARGET = {
      "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
      "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
      "x86_64-apple-darwin": "@openai/codex-darwin-x64",
      "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
      "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
      "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64"
    };
    moduleRequire = createRequire(import.meta.url);
    CodexExec = class {
      executablePath;
      envOverride;
      configOverrides;
      constructor(executablePath = null, env, configOverrides) {
        this.executablePath = executablePath || findCodexPath();
        this.envOverride = env;
        this.configOverrides = configOverrides;
      }
      async *run(args) {
        const commandArgs = ["exec", "--experimental-json"];
        if (this.configOverrides) {
          for (const override of serializeConfigOverrides(this.configOverrides)) {
            commandArgs.push("--config", override);
          }
        }
        if (args.model) {
          commandArgs.push("--model", args.model);
        }
        if (args.sandboxMode) {
          commandArgs.push("--sandbox", args.sandboxMode);
        }
        if (args.workingDirectory) {
          commandArgs.push("--cd", args.workingDirectory);
        }
        if (args.additionalDirectories?.length) {
          for (const dir of args.additionalDirectories) {
            commandArgs.push("--add-dir", dir);
          }
        }
        if (args.skipGitRepoCheck) {
          commandArgs.push("--skip-git-repo-check");
        }
        if (args.outputSchemaFile) {
          commandArgs.push("--output-schema", args.outputSchemaFile);
        }
        if (args.modelReasoningEffort) {
          commandArgs.push("--config", `model_reasoning_effort="${args.modelReasoningEffort}"`);
        }
        if (args.networkAccessEnabled !== void 0) {
          commandArgs.push(
            "--config",
            `sandbox_workspace_write.network_access=${args.networkAccessEnabled}`
          );
        }
        if (args.webSearchMode) {
          commandArgs.push("--config", `web_search="${args.webSearchMode}"`);
        } else if (args.webSearchEnabled === true) {
          commandArgs.push("--config", `web_search="live"`);
        } else if (args.webSearchEnabled === false) {
          commandArgs.push("--config", `web_search="disabled"`);
        }
        if (args.approvalPolicy) {
          commandArgs.push("--config", `approval_policy="${args.approvalPolicy}"`);
        }
        if (args.threadId) {
          commandArgs.push("resume", args.threadId);
        }
        if (args.images?.length) {
          for (const image of args.images) {
            commandArgs.push("--image", image);
          }
        }
        const env = {};
        if (this.envOverride) {
          Object.assign(env, this.envOverride);
        } else {
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== void 0) {
              env[key] = value;
            }
          }
        }
        if (!env[INTERNAL_ORIGINATOR_ENV]) {
          env[INTERNAL_ORIGINATOR_ENV] = TYPESCRIPT_SDK_ORIGINATOR;
        }
        if (args.baseUrl) {
          env.OPENAI_BASE_URL = args.baseUrl;
        }
        if (args.apiKey) {
          env.CODEX_API_KEY = args.apiKey;
        }
        const child = spawn(this.executablePath, commandArgs, {
          env,
          signal: args.signal
        });
        let spawnError = null;
        child.once("error", (err) => spawnError = err);
        if (!child.stdin) {
          child.kill();
          throw new Error("Child process has no stdin");
        }
        child.stdin.write(args.input);
        child.stdin.end();
        if (!child.stdout) {
          child.kill();
          throw new Error("Child process has no stdout");
        }
        const stderrChunks = [];
        if (child.stderr) {
          child.stderr.on("data", (data) => {
            stderrChunks.push(data);
          });
        }
        const exitPromise = new Promise(
          (resolve6) => {
            child.once("exit", (code, signal) => {
              resolve6({ code, signal });
            });
          }
        );
        const rl = readline.createInterface({
          input: child.stdout,
          crlfDelay: Infinity
        });
        try {
          for await (const line of rl) {
            yield line;
          }
          if (spawnError) throw spawnError;
          const { code, signal } = await exitPromise;
          if (code !== 0 || signal) {
            const stderrBuffer = Buffer.concat(stderrChunks);
            const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`;
            throw new Error(`Codex Exec exited with ${detail}: ${stderrBuffer.toString("utf8")}`);
          }
        } finally {
          rl.close();
          child.removeAllListeners();
          try {
            if (!child.killed) child.kill();
          } catch {
          }
        }
      }
    };
    TOML_BARE_KEY = /^[A-Za-z0-9_-]+$/;
    Codex = class {
      exec;
      options;
      constructor(options = {}) {
        const { codexPathOverride, env, config } = options;
        this.exec = new CodexExec(codexPathOverride, env, config);
        this.options = options;
      }
      /**
       * Starts a new conversation with an agent.
       * @returns A new thread instance.
       */
      startThread(options = {}) {
        return new Thread(this.exec, this.options, options);
      }
      /**
       * Resumes a conversation with an agent based on the thread id.
       * Threads are persisted in ~/.codex/sessions.
       *
       * @param id The id of the thread to resume.
       * @returns A new thread instance.
       */
      resumeThread(id, options = {}) {
        return new Thread(this.exec, this.options, options, id);
      }
    };
  }
});

// node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs
var sdk_exports = {};
__export(sdk_exports, {
  AbortError: () => T0,
  DirectConnectError: () => P1,
  DirectConnectTransport: () => WV,
  EXIT_REASONS: () => TV,
  HOOK_EVENTS: () => vV,
  createSdkMcpServer: () => hP,
  forkSession: () => xh,
  getSessionInfo: () => kh,
  getSessionMessages: () => Sh,
  listSessions: () => _h,
  parseDirectConnectUrl: () => uP,
  query: () => Ph,
  renameSession: () => vh,
  tagSession: () => Th,
  tool: () => gP,
  unstable_v2_createSession: () => bh,
  unstable_v2_prompt: () => Ch,
  unstable_v2_resumeSession: () => Zh
});
import { join as HV } from "path";
import { fileURLToPath as lP } from "url";
import { setMaxListeners as _V } from "events";
import { spawn as ZU } from "child_process";
import { createInterface as CU } from "readline";
import { randomUUID as nq } from "crypto";
import { appendFile as oq, mkdir as rq } from "fs/promises";
import { join as g5 } from "path";
import { join as dq } from "path";
import { homedir as iq } from "os";
import { appendFile as UU, mkdir as LU, unlink as FU, symlink as NU } from "fs/promises";
import { dirname as n5, join as o5 } from "path";
import { cwd as aq } from "process";
import { realpathSync as h5 } from "fs";
import { randomUUID as n9 } from "crypto";
import * as u from "fs";
import { stat as XU, readdir as YU, readFile as d5, unlink as JU, rmdir as GU, rm as WU, mkdir as HU, rename as BU, open as zU } from "fs/promises";
import { join as QJ } from "path";
import { fileURLToPath as kU } from "url";
import { readFile as QL } from "fs/promises";
import { open as XJ, readdir as sQ, readFile as HS, realpath as gU, stat as aQ } from "fs/promises";
import { join as n6 } from "path";
import { execFile as TU } from "child_process";
import { promisify as xU } from "util";
import { basename as BL, join as Q$ } from "path";
import { readdir as $$, stat as zL } from "fs/promises";
import { constants as VJ } from "fs";
import { readdir as OL, open as DL } from "fs/promises";
import { join as Y$ } from "path";
import { readFile as wL, writeFile as ML, readdir as AL } from "fs/promises";
import { join as G$ } from "path";
import { randomUUID as FJ } from "crypto";
function IV(Q) {
  return this[Q];
}
function ZV(Q, $) {
  this[Q] = bV.bind(null, $);
}
function g6(Q = kV) {
  let $ = new AbortController();
  return _V(Q, $.signal), $;
}
function h6() {
  return process.versions.bun !== void 0;
}
function mV(Q) {
  var $ = fV.call(Q, T4), X = Q[T4];
  try {
    Q[T4] = void 0;
    var Y = true;
  } catch (G) {
  }
  var J = uV.call(Q);
  if (Y) if ($) Q[T4] = X;
  else delete Q[T4];
  return J;
}
function pV(Q) {
  return cV.call(Q);
}
function nV(Q) {
  if (Q == null) return Q === void 0 ? iV : dV;
  return K5 && K5 in Object(Q) ? B5(Q) : z5(Q);
}
function oV(Q) {
  var $ = typeof Q;
  return Q != null && ($ == "object" || $ == "function");
}
function eV(Q) {
  if (!p9(Q)) return false;
  var $ = V5(Q);
  return $ == tV || $ == aV || $ == rV || $ == sV;
}
function $q(Q) {
  return !!U5 && U5 in Q;
}
function Jq(Q) {
  if (Q != null) {
    try {
      return Yq.call(Q);
    } catch ($) {
    }
    try {
      return Q + "";
    } catch ($) {
    }
  }
  return "";
}
function qq(Q) {
  if (!p9(Q) || L5(Q)) return false;
  var $ = q5(Q) ? Vq : Wq;
  return $.test(F5(Q));
}
function Uq(Q, $) {
  return Q == null ? void 0 : Q[$];
}
function Lq(Q, $) {
  var X = O5(Q, $);
  return N5(X) ? X : void 0;
}
function Nq() {
  this.__data__ = b1 ? b1(null) : {}, this.size = 0;
}
function Oq(Q) {
  var $ = this.has(Q) && delete this.__data__[Q];
  return this.size -= $ ? 1 : 0, $;
}
function Aq(Q) {
  var $ = this.__data__;
  if (b1) {
    var X = $[Q];
    return X === Dq ? void 0 : X;
  }
  return Mq.call($, Q) ? $[Q] : void 0;
}
function Iq(Q) {
  var $ = this.__data__;
  return b1 ? $[Q] !== void 0 : Rq.call($, Q);
}
function Pq(Q, $) {
  var X = this.__data__;
  return this.size += this.has(Q) ? 0 : 1, X[Q] = b1 && $ === void 0 ? Eq : $, this;
}
function m6(Q) {
  var $ = -1, X = Q == null ? 0 : Q.length;
  this.clear();
  while (++$ < X) {
    var Y = Q[$];
    this.set(Y[0], Y[1]);
  }
}
function bq() {
  this.__data__ = [], this.size = 0;
}
function Zq(Q, $) {
  return Q === $ || Q !== Q && $ !== $;
}
function Cq(Q, $) {
  var X = Q.length;
  while (X--) if (I5(Q[X][0], $)) return X;
  return -1;
}
function kq(Q) {
  var $ = this.__data__, X = h1($, Q);
  if (X < 0) return false;
  var Y = $.length - 1;
  if (X == Y) $.pop();
  else _q.call($, X, 1);
  return --this.size, true;
}
function vq(Q) {
  var $ = this.__data__, X = h1($, Q);
  return X < 0 ? void 0 : $[X][1];
}
function Tq(Q) {
  return h1(this.__data__, Q) > -1;
}
function xq(Q, $) {
  var X = this.__data__, Y = h1(X, Q);
  if (Y < 0) ++this.size, X.push([Q, $]);
  else X[Y][1] = $;
  return this;
}
function l6(Q) {
  var $ = -1, X = Q == null ? 0 : Q.length;
  this.clear();
  while (++$ < X) {
    var Y = Q[$];
    this.set(Y[0], Y[1]);
  }
}
function gq() {
  this.size = 0, this.__data__ = { hash: new mQ(), map: new (S5 || C5)(), string: new mQ() };
}
function hq(Q) {
  var $ = typeof Q;
  return $ == "string" || $ == "number" || $ == "symbol" || $ == "boolean" ? Q !== "__proto__" : Q === null;
}
function fq(Q, $) {
  var X = Q.__data__;
  return k5($) ? X[typeof $ == "string" ? "string" : "hash"] : X.map;
}
function uq(Q) {
  var $ = f1(this, Q).delete(Q);
  return this.size -= $ ? 1 : 0, $;
}
function mq(Q) {
  return f1(this, Q).get(Q);
}
function lq(Q) {
  return f1(this, Q).has(Q);
}
function cq(Q, $) {
  var X = f1(this, Q), Y = X.size;
  return X.set(Q, $), this.size += X.size == Y ? 0 : 1, this;
}
function c6(Q) {
  var $ = -1, X = Q == null ? 0 : Q.length;
  this.clear();
  while (++$ < X) {
    var Y = Q[$];
    this.set(Y[0], Y[1]);
  }
}
function cQ(Q, $) {
  if (typeof Q != "function" || $ != null && typeof $ != "function") throw TypeError(pq);
  var X = function() {
    var Y = arguments, J = $ ? $.apply(this, Y) : Y[0], G = X.cache;
    if (G.has(J)) return G.get(J);
    var W = Q.apply(this, Y);
    return X.cache = G.set(J, W) || G, W;
  };
  return X.cache = new (cQ.Cache || lQ)(), X;
}
function x4(Q) {
  if (!Q) return false;
  if (typeof Q === "boolean") return Q;
  let $ = Q.toLowerCase().trim();
  return ["1", "true", "yes", "on"].includes($);
}
function tq() {
  if (d6) return d6;
  if (!process.env.DEBUG_CLAUDE_AGENT_SDK) return i6 = null, d6 = Promise.resolve(), d6;
  let Q = g5(p6(), "debug");
  return i6 = g5(Q, `sdk-${nq()}.txt`), process.stderr.write(`SDK debug logs: ${i6}
`), d6 = rq(Q, { recursive: true }).then(() => {
  }).catch(() => {
  }), d6;
}
function i0(Q) {
  if (i6 === null) return;
  let X = `${(/* @__PURE__ */ new Date()).toISOString()} ${Q}
`;
  tq().then(() => {
    if (i6) oq(i6, X).catch(() => {
    });
  });
}
function sq() {
  let Q = "";
  if (typeof process < "u" && typeof process.cwd === "function" && typeof h5 === "function") {
    let X = aq();
    try {
      Q = h5(X).normalize("NFC");
    } catch {
      Q = X.normalize("NFC");
    }
  }
  return { originalCwd: Q, projectRoot: Q, totalCostUSD: 0, totalAPIDuration: 0, totalAPIDurationWithoutRetries: 0, totalToolDuration: 0, tokenSaverBytesSaved: 0, tokenSaverHits: 0, turnHookDurationMs: 0, turnToolDurationMs: 0, turnClassifierDurationMs: 0, turnToolCount: 0, turnHookCount: 0, turnClassifierCount: 0, startTime: Date.now(), lastInteractionTime: Date.now(), totalLinesAdded: 0, totalLinesRemoved: 0, hasUnknownModelCost: false, cwd: Q, modelUsage: {}, mainLoopModelOverride: void 0, initialMainLoopModel: null, modelStrings: null, isInteractive: false, kairosActive: false, sdkAgentProgressSummariesEnabled: false, userMsgOptIn: false, clientType: "cli", sessionSource: void 0, questionPreviewFormat: void 0, sessionIngressToken: void 0, oauthTokenFromFd: void 0, apiKeyFromFd: void 0, flagSettingsPath: void 0, flagSettingsInline: null, allowedSettingSources: ["userSettings", "projectSettings", "localSettings", "flagSettings", "policySettings"], meter: null, sessionCounter: null, locCounter: null, prCounter: null, commitCounter: null, costCounter: null, tokenCounter: null, codeEditToolDecisionCounter: null, activeTimeCounter: null, statsStore: null, sessionId: n9(), parentSessionId: void 0, loggerProvider: null, eventLogger: null, meterProvider: null, tracerProvider: null, agentColorMap: /* @__PURE__ */ new Map(), agentColorIndex: 0, lastAPIRequest: null, lastAPIRequestMessages: null, lastClassifierRequests: null, cachedClaudeMdContent: null, inMemoryErrorLog: [], inlinePlugins: [], chromeFlagOverride: void 0, useCoworkPlugins: false, sessionBypassPermissionsMode: false, scheduledTasksEnabled: false, sessionCronTasks: [], sessionCreatedTeams: /* @__PURE__ */ new Set(), sessionTrustAccepted: false, sessionPersistenceDisabled: false, hasExitedPlanMode: false, needsPlanModeExitAttachment: false, needsAutoModeExitAttachment: false, lspRecommendationShownThisSession: false, initJsonSchema: null, registeredHooks: null, planSlugCache: /* @__PURE__ */ new Map(), teleportedSessionInfo: null, invokedSkills: /* @__PURE__ */ new Map(), slowOperations: [], sdkBetas: void 0, mainThreadAgentType: void 0, isRemoteMode: false, isInWorktree: false, ...{}, directConnectServerUrl: void 0, systemPromptSectionCache: /* @__PURE__ */ new Map(), lastEmittedDate: null, additionalDirectoriesForClaudeMd: [], allowedChannels: [], hasDevChannels: false, sessionProjectDir: null, promptCache1hAllowlist: null, promptId: null, lastMainRequestId: void 0, lastApiCompletionTimestamp: null, pendingPostCompaction: false };
}
function f5() {
  return eq.sessionId;
}
function u5({ writeFn: Q, flushIntervalMs: $ = 1e3, maxBufferSize: X = 100, maxBufferBytes: Y = 1 / 0, immediateMode: J = false }) {
  let G = [], W = 0, H = null, B = null;
  function z() {
    if (H) clearTimeout(H), H = null;
  }
  function K() {
    if (B) Q(B.join("")), B = null;
    if (G.length === 0) return;
    Q(G.join("")), G = [], W = 0, z();
  }
  function U() {
    if (!H) H = setTimeout(K, $);
  }
  function q() {
    if (B) {
      B.push(...G), G = [], W = 0, z();
      return;
    }
    let V = G;
    G = [], W = 0, z(), B = V, setImmediate(() => {
      let L = B;
      if (B = null, L) Q(L.join(""));
    });
  }
  return { write(V) {
    if (J) {
      Q(V);
      return;
    }
    if (G.push(V), W += V.length, U(), G.length >= X || W >= Y) q();
  }, flush: K, dispose() {
    K();
  } };
}
function l5(Q) {
  return m5.add(Q), () => m5.delete(Q);
}
function QU(Q) {
  let $ = [], X = Q.match(/^MCP server ["']([^"']+)["']/);
  if (X && X[1]) $.push("mcp"), $.push(X[1].toLowerCase());
  else {
    let G = Q.match(/^([^:[]+):/);
    if (G && G[1]) $.push(G[1].trim().toLowerCase());
  }
  let Y = Q.match(/^\[([^\]]+)]/);
  if (Y && Y[1]) $.push(Y[1].trim().toLowerCase());
  if (Q.toLowerCase().includes("1p event:")) $.push("1p");
  let J = Q.match(/:\s*([^:]+?)(?:\s+(?:type|mode|status|event))?:/);
  if (J && J[1]) {
    let G = J[1].trim().toLowerCase();
    if (G.length < 30 && !G.includes(" ")) $.push(G);
  }
  return Array.from(new Set($));
}
function $U(Q, $) {
  if (!$) return true;
  if (Q.length === 0) return false;
  if ($.isExclusive) return !Q.some((X) => $.exclude.includes(X));
  else return Q.some((X) => $.include.includes(X));
}
function p5(Q, $) {
  if (!$) return true;
  let X = QU(Q);
  return $U(X, $);
}
function pQ() {
  return VU;
}
function qU(Q, $) {
  if (Q.destroyed) return;
  Q.write($);
}
function i5(Q) {
  qU(process.stderr, Q);
}
function MU(Q) {
  if (!nQ()) return false;
  if (typeof process > "u" || typeof process.versions > "u" || typeof process.versions.node > "u") return false;
  let $ = wU();
  return p5(Q, $);
}
async function jU(Q, $, X, Y) {
  if (Q) await LU($, { recursive: true }).catch(() => {
  });
  await UU(X, Y), s5();
}
function RU() {
}
function IU() {
  if (!o9) {
    let Q = null;
    o9 = u5({ writeFn: ($) => {
      let X = a5(), Y = n5(X), J = Q !== Y;
      if (Q = Y, nQ()) {
        if (J) try {
          pQ().mkdirSync(Y);
        } catch {
        }
        pQ().appendFileSync(X, $), s5();
        return;
      }
      dQ = dQ.then(jU.bind(null, J, Y, X, $)).catch(RU);
    }, flushIntervalMs: 1e3, maxBufferSize: 100, immediateMode: nQ() }), l5(async () => {
      o9?.dispose(), await dQ;
    });
  }
  return o9;
}
function N1(Q, { level: $ } = { level: "debug" }) {
  if (iQ[$] < iQ[OU()]) return;
  if (!MU(Q)) return;
  if (AU && Q.includes(`
`)) Q = W0(Q);
  let Y = `${(/* @__PURE__ */ new Date()).toISOString()} [${$.toUpperCase()}] ${Q.trim()}
`;
  if (r5()) {
    i5(Y);
    return;
  }
  IU().write(Y);
}
function a5() {
  return t5() ?? process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ?? o5(p6(), "debug", `${f5()}.txt`);
}
function PU() {
  return EU;
}
function W0(Q, $, X) {
  let J = [];
  try {
    const Y = $0(J, q0`JSON.stringify(${Q})`, 0);
    return JSON.stringify(Q, $, X);
  } catch (G) {
    var W = G, H = 1;
  } finally {
    X0(J, W, H);
  }
}
function bU(Q) {
  let $ = Q.trim();
  return $.startsWith("{") && $.endsWith("}");
}
function e5(Q, $) {
  let X = { ...Q };
  if ($) {
    let Y = X.settings;
    if (Y && !bU(Y)) throw Error("Cannot use both a settings file path and the sandbox option. Include the sandbox configuration in your settings file instead.");
    let J = { sandbox: $ };
    if (Y) try {
      J = { ...O1(Y), sandbox: $ };
    } catch {
    }
    X.settings = W0(J);
  }
  return X;
}
function _U(Q) {
  return ![".js", ".mjs", ".tsx", ".ts", ".jsx"].some((X) => Q.endsWith(X));
}
function tQ(Q) {
  return new rQ(Q);
}
function $J(Q, $) {
  return new rQ({ ...$, resume: Q });
}
async function u1(Q) {
  try {
    let { stdout: $ } = await yU("git", ["worktree", "list", "--porcelain"], { cwd: Q, timeout: 5e3 });
    if (!$) return [];
    return $.split(`
`).filter((X) => X.startsWith("worktree ")).map((X) => X.slice(9).normalize("NFC"));
  } catch {
    return [];
  }
}
function o0(Q) {
  if (typeof Q !== "string") return null;
  return hU.test(Q) ? Q : null;
}
function YJ(Q) {
  if (!Q.includes("\\")) return Q;
  try {
    return JSON.parse(`"${Q}"`);
  } catch {
    return Q;
  }
}
function s9(Q, $) {
  let X = [`"${$}":"`, `"${$}": "`];
  for (let Y of X) {
    let J = Q.indexOf(Y);
    if (J < 0) continue;
    let G = J + Y.length, W = G;
    while (W < Q.length) {
      if (Q[W] === "\\") {
        W += 2;
        continue;
      }
      if (Q[W] === '"') return YJ(Q.slice(G, W));
      W++;
    }
  }
  return;
}
function r0(Q, $) {
  let X = [`"${$}":"`, `"${$}": "`], Y;
  for (let J of X) {
    let G = 0;
    while (true) {
      let W = Q.indexOf(J, G);
      if (W < 0) break;
      let H = W + J.length, B = H;
      while (B < Q.length) {
        if (Q[B] === "\\") {
          B += 2;
          continue;
        }
        if (Q[B] === '"') {
          Y = YJ(Q.slice(H, B));
          break;
        }
        B++;
      }
      G = B + 1;
    }
  }
  return Y;
}
function e9(Q) {
  let $ = 0, X = "";
  while ($ < Q.length) {
    let Y = Q.indexOf(`
`, $), J = Y >= 0 ? Q.slice($, Y) : Q.slice($);
    if ($ = Y >= 0 ? Y + 1 : Q.length, !J.includes('"type":"user"') && !J.includes('"type": "user"')) continue;
    if (J.includes('"tool_result"')) continue;
    if (J.includes('"isMeta":true') || J.includes('"isMeta": true')) continue;
    if (J.includes('"isCompactSummary":true') || J.includes('"isCompactSummary": true')) continue;
    try {
      let G = JSON.parse(J);
      if (G.type !== "user") continue;
      let W = G.message;
      if (!W) continue;
      let H = W.content, B = [];
      if (typeof H === "string") B.push(H);
      else if (Array.isArray(H)) {
        for (let z of H) if (z.type === "text" && typeof z.text === "string") B.push(z.text);
      }
      for (let z of B) {
        let K = z.replace(/\n/g, " ").trim();
        if (!K) continue;
        let U = uU.exec(K);
        if (U) {
          if (!X) X = U[1];
          continue;
        }
        if (fU.test(K)) continue;
        if (K.length > 200) K = K.slice(0, 200).trim() + "\u2026";
        return K;
      }
    } catch {
      continue;
    }
  }
  if (X) return X;
  return "";
}
async function Q8(Q) {
  try {
    let $ = await XJ(Q, "r");
    try {
      let X = await $.stat(), Y = Buffer.allocUnsafe(r9), J = await $.read(Y, 0, r9, 0);
      if (J.bytesRead === 0) return null;
      let G = Y.toString("utf8", 0, J.bytesRead), W = Math.max(0, X.size - r9), H = G;
      if (W > 0) {
        let B = await $.read(Y, 0, r9, W);
        H = Y.toString("utf8", 0, B.bytesRead);
      }
      return { mtime: X.mtime.getTime(), size: X.size, head: G, tail: H };
    } finally {
      await $.close();
    }
  } catch {
    return null;
  }
}
function mU(Q) {
  let $ = 0;
  for (let X = 0; X < Q.length; X++) {
    let Y = Q.charCodeAt(X);
    $ = ($ << 5) - $ + Y, $ |= 0;
  }
  return Math.abs($).toString(36);
}
function $8(Q) {
  let $ = Q.replace(/[^a-zA-Z0-9]/g, "-");
  if ($.length <= o6) return $;
  let X = typeof Bun < "u" ? Bun.hash(Q).toString(36) : mU(Q);
  return `${$.slice(0, o6)}-${X}`;
}
function D1() {
  return n6(p6(), "projects");
}
function lU(Q) {
  return n6(D1(), $8(Q));
}
async function L6(Q) {
  try {
    return (await gU(Q)).normalize("NFC");
  } catch {
    return Q.normalize("NFC");
  }
}
async function n0(Q) {
  let $ = lU(Q);
  try {
    return await sQ($), $;
  } catch {
    let X = $8(Q);
    if (X.length <= o6) return;
    let Y = X.slice(0, o6), J = D1();
    try {
      let W = (await sQ(J, { withFileTypes: true })).find((H) => H.isDirectory() && H.name.startsWith(Y + "-"));
      return W ? n6(J, W.name) : void 0;
    } catch {
      return;
    }
  }
}
async function X8(Q, $) {
  let X = `${Q}.jsonl`;
  if ($) {
    let G = await L6($), W = await n0(G);
    if (W) {
      let B = n6(W, X);
      try {
        let z = await aQ(B);
        if (z.size > 0) return { filePath: B, projectPath: G, fileSize: z.size };
      } catch {
      }
    }
    let H;
    try {
      H = await u1(G);
    } catch {
      H = [];
    }
    for (let B of H) {
      if (B === G) continue;
      let z = await n0(B);
      if (!z) continue;
      let K = n6(z, X);
      try {
        let U = await aQ(K);
        if (U.size > 0) return { filePath: K, projectPath: B, fileSize: U.size };
      } catch {
      }
    }
    return;
  }
  let Y = D1(), J;
  try {
    J = await sQ(Y);
  } catch {
    return;
  }
  for (let G of J) {
    let W = n6(Y, G, X);
    try {
      let H = await aQ(W);
      if (H.size > 0) return { filePath: W, projectPath: void 0, fileSize: H.size };
    } catch {
    }
  }
  return;
}
function dU() {
  return pU ??= Buffer.from('"compact_boundary"');
}
function GJ(Q) {
  try {
    let $ = JSON.parse(Q);
    if ($.type !== "system" || $.subtype !== "compact_boundary") return null;
    return { hasPreservedSegment: Boolean($.compactMetadata?.preservedSegment) };
  } catch {
    return null;
  }
}
function U6(Q, $, X, Y) {
  let J = Y - X;
  if (J <= 0) return;
  if (Q.len + J > Q.buf.length) {
    let G = Buffer.allocUnsafe(Math.min(Math.max(Q.buf.length * 2, Q.len + J), Q.cap));
    Q.buf.copy(G, 0, 0, Q.len), Q.buf = G;
  }
  $.copy(Q.buf, Q.len, X, Y), Q.len += J;
}
function t9(Q, $, X, Y) {
  return Y - X >= $.length && Q.compare($, 0, $.length, X, X + $.length) === 0;
}
function rU(Q, $, X) {
  if (Q.straddleSnapCarryLen = 0, Q.straddleSnapTailEnd = 0, Q.carryLen === 0) return 0;
  let Y = Q.carryBuf, J = $.indexOf(f4);
  if (J === -1 || J >= X) return 0;
  let G = J + 1;
  if (t9(Y, a9, 0, Q.carryLen)) Q.straddleSnapCarryLen = Q.carryLen, Q.straddleSnapTailEnd = G, Q.lastSnapSrc = null;
  else if (Q.carryLen < a9.length) return 0;
  else {
    if (t9(Y, iU, 0, Q.carryLen)) {
      let W = GJ(Y.toString("utf-8", 0, Q.carryLen) + $.toString("utf-8", 0, J));
      if (W?.hasPreservedSegment) Q.hasPreservedSegment = true;
      else if (W) Q.out.len = 0, Q.boundaryStartOffset = Q.bufFileOff, Q.hasPreservedSegment = false, Q.lastSnapSrc = null;
    }
    U6(Q.out, Y, 0, Q.carryLen), U6(Q.out, $, 0, G);
  }
  return Q.bufFileOff += Q.carryLen + G, Q.carryLen = 0, G;
}
function tU(Q, $, X) {
  let Y = $.indexOf(X), J = 0, G = 0, W = -1, H = -1, B = $.indexOf(f4);
  while (B !== -1) {
    let z = B + 1;
    if (Y !== -1 && Y < G) Y = $.indexOf(X, G);
    if (t9($, a9, G, z)) U6(Q.out, $, J, G), W = G, H = z, J = z;
    else if (Y >= G && Y < Math.min(G + oU, z)) {
      let K = GJ($.toString("utf-8", G, B));
      if (K?.hasPreservedSegment) Q.hasPreservedSegment = true;
      else if (K) Q.out.len = 0, Q.boundaryStartOffset = Q.bufFileOff + G, Q.hasPreservedSegment = false, Q.lastSnapSrc = null, W = -1, Q.straddleSnapCarryLen = 0, J = G;
      Y = $.indexOf(X, Y + X.length);
    }
    G = z, B = $.indexOf(f4, G);
  }
  return U6(Q.out, $, J, G), { lastSnapStart: W, lastSnapEnd: H, trailStart: G };
}
function aU(Q, $, X, Y, J) {
  if (Y !== -1) {
    if (Q.lastSnapLen = J - Y, Q.lastSnapBuf === void 0 || Q.lastSnapLen > Q.lastSnapBuf.length) Q.lastSnapBuf = Buffer.allocUnsafe(Q.lastSnapLen);
    $.copy(Q.lastSnapBuf, 0, Y, J), Q.lastSnapSrc = Q.lastSnapBuf;
  } else if (Q.straddleSnapCarryLen > 0) {
    if (Q.lastSnapLen = Q.straddleSnapCarryLen + Q.straddleSnapTailEnd, Q.lastSnapBuf === void 0 || Q.lastSnapLen > Q.lastSnapBuf.length) Q.lastSnapBuf = Buffer.allocUnsafe(Q.lastSnapLen);
    Q.carryBuf.copy(Q.lastSnapBuf, 0, 0, Q.straddleSnapCarryLen), X.copy(Q.lastSnapBuf, Q.straddleSnapCarryLen, 0, Q.straddleSnapTailEnd), Q.lastSnapSrc = Q.lastSnapBuf;
  }
}
function sU(Q, $, X) {
  if (Q.carryLen = $.length - X, Q.carryLen > 0) {
    if (Q.carryBuf === void 0 || Q.carryLen > Q.carryBuf.length) Q.carryBuf = Buffer.allocUnsafe(Q.carryLen);
    $.copy(Q.carryBuf, 0, X, $.length);
  }
}
function eU(Q) {
  if (Q.carryLen > 0) {
    let $ = Q.carryBuf;
    if (t9($, a9, 0, Q.carryLen)) Q.lastSnapSrc = $, Q.lastSnapLen = Q.carryLen;
    else U6(Q.out, $, 0, Q.carryLen);
  }
  if (Q.lastSnapSrc) {
    if (Q.out.len > 0 && Q.out.buf[Q.out.len - 1] !== f4) U6(Q.out, nU, 0, 1);
    U6(Q.out, Q.lastSnapSrc, 0, Q.lastSnapLen);
  }
}
async function WJ(Q, $) {
  let X = dU(), Y = cU, J = { out: { buf: Buffer.allocUnsafe(Math.min($, 8388608)), len: 0, cap: $ + 1 }, boundaryStartOffset: 0, hasPreservedSegment: false, lastSnapSrc: null, lastSnapLen: 0, lastSnapBuf: void 0, bufFileOff: 0, carryLen: 0, carryBuf: void 0, straddleSnapCarryLen: 0, straddleSnapTailEnd: 0 }, G = Buffer.allocUnsafe(Y), W = await XJ(Q, "r");
  try {
    let H = 0;
    while (H < $) {
      let { bytesRead: B } = await W.read(G, 0, Math.min(Y, $ - H), H);
      if (B === 0) break;
      H += B;
      let z = rU(J, G, B), K;
      if (J.carryLen > 0) {
        let q = J.carryLen + (B - z);
        K = Buffer.allocUnsafe(q), J.carryBuf.copy(K, 0, 0, J.carryLen), G.copy(K, J.carryLen, z, B);
      } else K = G.subarray(z, B);
      let U = tU(J, K, X);
      aU(J, K, G, U.lastSnapStart, U.lastSnapEnd), sU(J, K, U.trailStart), J.bufFileOff += U.trailStart;
    }
    eU(J);
  } finally {
    await W.close();
  }
  return { boundaryStartOffset: J.boundaryStartOffset, postBoundaryBuf: J.out.buf.subarray(0, J.out.len), hasPreservedSegment: J.hasPreservedSegment };
}
async function $L(Q, $) {
  try {
    if ($ > JJ && !x4(process.env.CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP)) return (await WJ(Q, $)).postBoundaryBuf;
    return await QL(Q);
  } catch {
    return null;
  }
}
function XL(Q) {
  let $ = [], X = 10, Y = Q.length, J = 0;
  while (J < Y) {
    let G = Q.indexOf(10, J);
    if (G === -1) G = Y;
    let W = J;
    while (W < G && Q[W] <= 32) W++;
    if (J = G + 1, W >= G) continue;
    let H = Q.toString("utf-8", W, G);
    try {
      let B = O1(H), z = B.type;
      if ((z === "user" || z === "assistant" || z === "progress" || z === "system" || z === "attachment") && typeof B.uuid === "string") $.push(B);
    } catch {
    }
  }
  return $;
}
function YL(Q) {
  let $ = /* @__PURE__ */ new Map();
  for (let q of Q) $.set(q.uuid, q);
  for (let q of $.values()) {
    if (q.type !== "system" || q.subtype !== "compact_boundary") continue;
    let V = q.compactMetadata?.preservedSegment;
    if (!V) continue;
    let L = $.get(V.headUuid);
    if (L) $.set(V.headUuid, { ...L, parentUuid: V.anchorUuid });
    for (let [F, w] of $) if (w.parentUuid === V.anchorUuid && F !== V.headUuid) $.set(F, { ...w, parentUuid: V.tailUuid });
  }
  let X = /* @__PURE__ */ new Map();
  for (let q = 0; q < Q.length; q++) X.set(Q[q].uuid, q);
  let Y = /* @__PURE__ */ new Set();
  for (let q of $.values()) if (q.parentUuid) Y.add(q.parentUuid);
  let J = [...$.values()].filter((q) => !Y.has(q.uuid)), G = [];
  for (let q of J) {
    let V = q, L = /* @__PURE__ */ new Set();
    while (V) {
      if (L.has(V.uuid)) break;
      if (L.add(V.uuid), V.type === "user" || V.type === "assistant") {
        G.push(V);
        break;
      }
      V = V.parentUuid ? $.get(V.parentUuid) : void 0;
    }
  }
  if (G.length === 0) return [];
  let W = G.filter((q) => !q.isSidechain && !q.teamName && !q.isMeta), H = (q) => q.reduce((V, L) => (X.get(L.uuid) ?? -1) > (X.get(V.uuid) ?? -1) ? L : V), B = W.length > 0 ? H(W) : H(G), z = [], K = /* @__PURE__ */ new Set(), U = $.get(B.uuid);
  while (U) {
    if (K.has(U.uuid)) break;
    K.add(U.uuid), z.push(U), U = U.parentUuid ? $.get(U.parentUuid) : void 0;
  }
  return z.reverse(), GL($, z, K);
}
function eQ(Q) {
  if (Q.type !== "assistant") return;
  let $ = Q.message;
  if (typeof $ !== "object" || $ === null) return;
  let X = $.id;
  return typeof X === "string" ? X : void 0;
}
function JL(Q) {
  if (Q.type !== "user" || !Q.parentUuid) return false;
  let $ = Q.message;
  if (typeof $ !== "object" || $ === null) return false;
  let X = $.content;
  if (!Array.isArray(X)) return false;
  return X.some((Y) => typeof Y === "object" && Y !== null && Y.type === "tool_result");
}
function GL(Q, $, X) {
  let Y = $.filter((U) => U.type === "assistant");
  if (Y.length === 0) return $;
  let J = /* @__PURE__ */ new Map();
  for (let U of Y) {
    let q = eQ(U);
    if (q) J.set(q, U);
  }
  let G = /* @__PURE__ */ new Map(), W = /* @__PURE__ */ new Map();
  for (let U of Q.values()) {
    let q = eQ(U);
    if (q) {
      let V = G.get(q);
      if (V) V.push(U);
      else G.set(q, [U]);
    } else if (JL(U)) {
      let V = U.parentUuid, L = W.get(V);
      if (L) L.push(U);
      else W.set(V, [U]);
    }
  }
  let H = /* @__PURE__ */ new Set(), B = /* @__PURE__ */ new Map(), z = 0;
  for (let U of Y) {
    let q = eQ(U);
    if (!q || H.has(q)) continue;
    H.add(q);
    let V = G.get(q) ?? [U], L = V.filter((R) => !X.has(R.uuid)), F = [];
    for (let R of V) {
      let Z = W.get(R.uuid);
      if (!Z) continue;
      for (let v of Z) if (!X.has(v.uuid)) F.push(v);
    }
    if (L.length === 0 && F.length === 0) continue;
    let w = (R, Z) => (R.timestamp ?? "").localeCompare(Z.timestamp ?? "");
    L.sort(w), F.sort(w);
    let D = J.get(q), M = [...L, ...F];
    for (let R of M) X.add(R.uuid);
    z += M.length, B.set(D.uuid, M);
  }
  if (z === 0) return $;
  let K = [];
  for (let U of $) {
    K.push(U);
    let q = B.get(U.uuid);
    if (q) K.push(...q);
  }
  return K;
}
function WL(Q) {
  if (Q.type !== "user" && Q.type !== "assistant") return false;
  if (Q.isMeta) return false;
  if (Q.isSidechain) return false;
  if (Q.teamName) return false;
  return true;
}
function HL(Q) {
  return { type: Q.type, uuid: Q.uuid, session_id: Q.sessionId, message: Q.message, parent_tool_use_id: null, timestamp: Q.timestamp };
}
async function HJ(Q, $) {
  if (!o0(Q)) return [];
  let X = await X8(Q, $?.dir);
  if (!X) return [];
  let Y = await $L(X.filePath, X.fileSize);
  if (!Y) return [];
  let J = XL(Y), H = YL(J).filter(WL).map(HL), B = $?.offset ?? 0;
  if ($?.limit !== void 0 && $.limit > 0) return H.slice(B, B + $.limit);
  if (B > 0) return H.slice(B);
  return H;
}
function X$(Q, $, X) {
  let { head: Y, tail: J, mtime: G, size: W } = $, H = Y.indexOf(`
`), B = H >= 0 ? Y.slice(0, H) : Y;
  if (B.includes('"isSidechain":true') || B.includes('"isSidechain": true')) return null;
  let z = r0(J, "customTitle") || r0(Y, "customTitle") || r0(J, "aiTitle") || r0(Y, "aiTitle") || void 0, K = e9(Y) || void 0, U = s9(Y, "timestamp"), q;
  if (U) {
    let M = Date.parse(U);
    if (!Number.isNaN(M)) q = M;
  }
  let V = z || r0(J, "lastPrompt") || r0(J, "summary") || K;
  if (!V) return null;
  let L = r0(J, "gitBranch") || s9(Y, "gitBranch") || void 0, F = s9(Y, "cwd") || X || void 0, w = J.split(`
`).findLast((M) => M.startsWith('{"type":"tag"')), D = w ? r0(w, "tag") || void 0 : void 0;
  return { sessionId: Q, summary: V, lastModified: G, fileSize: W, customTitle: z, firstPrompt: K, gitBranch: L, cwd: F, tag: D, createdAt: q };
}
async function u4(Q, $, X) {
  let Y;
  try {
    Y = await $$(Q);
  } catch {
    return [];
  }
  return (await Promise.all(Y.map(async (G) => {
    if (!G.endsWith(".jsonl")) return null;
    let W = o0(G.slice(0, -6));
    if (!W) return null;
    let H = Q$(Q, G);
    if (!$) return { sessionId: W, filePath: H, mtime: 0, projectPath: X };
    try {
      let B = await zL(H);
      return { sessionId: W, filePath: H, mtime: B.mtime.getTime(), projectPath: X };
    } catch {
      return null;
    }
  }))).filter((G) => G !== null);
}
async function BJ(Q) {
  let $ = await Q8(Q.filePath);
  if (!$) return null;
  let X = X$(Q.sessionId, $, Q.projectPath);
  if (!X) return null;
  if (Q.mtime) X.lastModified = Q.mtime;
  return X;
}
function VL(Q, $) {
  if ($.mtime !== Q.mtime) return $.mtime - Q.mtime;
  return $.sessionId < Q.sessionId ? -1 : $.sessionId > Q.sessionId ? 1 : 0;
}
async function qL(Q, $, X) {
  Q.sort(VL);
  let Y = [], J = $ && $ > 0 ? $ : 1 / 0, G = 0, W = /* @__PURE__ */ new Set();
  for (let H = 0; H < Q.length && Y.length < J; ) {
    let B = Math.min(H + KL, Q.length), z = Q.slice(H, B), K = await Promise.all(z.map(BJ));
    for (let U = 0; U < K.length && Y.length < J; U++) {
      H++;
      let q = K[U];
      if (!q) continue;
      if (W.has(q.sessionId)) continue;
      if (W.add(q.sessionId), G < X) {
        G++;
        continue;
      }
      Y.push(q);
    }
  }
  return Y;
}
async function UL(Q) {
  let $ = await Promise.all(Q.map(BJ)), X = /* @__PURE__ */ new Map();
  for (let J of $) {
    if (!J) continue;
    let G = X.get(J.sessionId);
    if (!G || J.lastModified > G.lastModified) X.set(J.sessionId, J);
  }
  let Y = [...X.values()];
  return Y.sort((J, G) => G.lastModified !== J.lastModified ? G.lastModified - J.lastModified : G.sessionId < J.sessionId ? -1 : G.sessionId > J.sessionId ? 1 : 0), Y;
}
async function LL(Q, $, X) {
  let Y = await L6(Q), J;
  if ($) try {
    J = await u1(Y);
  } catch {
    J = [];
  }
  else J = [];
  if (J.length <= 1) {
    let q = await n0(Y);
    if (!q) return [];
    return u4(q, X, Y);
  }
  let G = D1(), W = process.platform === "win32", H = J.map((q) => {
    let V = $8(q);
    return { path: q, prefix: W ? V.toLowerCase() : V };
  });
  H.sort((q, V) => V.prefix.length - q.prefix.length);
  let B;
  try {
    B = await $$(G, { withFileTypes: true });
  } catch {
    let q = await n0(Y);
    if (!q) return [];
    return u4(q, X, Y);
  }
  let z = [], K = /* @__PURE__ */ new Set(), U = await n0(Y);
  if (U) {
    let q = BL(U);
    K.add(W ? q.toLowerCase() : q), z.push(...await u4(U, X, Y));
  }
  for (let q of B) {
    if (!q.isDirectory()) continue;
    let V = W ? q.name.toLowerCase() : q.name;
    if (K.has(V)) continue;
    for (let { path: L, prefix: F } of H) if (V === F || F.length >= o6 && V.startsWith(F + "-")) {
      K.add(V), z.push(...await u4(Q$(G, q.name), X, L));
      break;
    }
  }
  return z;
}
async function FL(Q) {
  let $ = D1(), X;
  try {
    X = await $$($, { withFileTypes: true });
  } catch {
    return [];
  }
  return (await Promise.all(X.filter((J) => J.isDirectory()).map((J) => u4(Q$($, J.name), Q)))).flat();
}
async function zJ(Q) {
  let { dir: $, limit: X, offset: Y, includeWorktrees: J } = Q ?? {}, G = Y ?? 0, W = X !== void 0 && X > 0 || G > 0, H = $ ? await LL($, J ?? true, W) : await FL(W);
  if (!W) return UL(H);
  return qL(H, X, G);
}
async function KJ(Q, $ = {}) {
  let X = o0(Q);
  if (!X) return;
  let Y = await X8(X, $.dir);
  if (!Y) return;
  let J = await Q8(Y.filePath);
  if (!J) return;
  return X$(X, J, Y.projectPath) ?? void 0;
}
function NL(Q) {
  let $ = Q, X = "", Y = 0, J = 10;
  while ($ !== X && Y < J) X = $, $ = $.normalize("NFKC"), $ = $.replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, ""), $ = $.replace(/[\u200B-\u200F]/g, "").replace(/[\u202A-\u202E]/g, "").replace(/[\u2066-\u2069]/g, "").replace(/[\uFEFF]/g, "").replace(/[\uE000-\uF8FF]/g, ""), Y++;
  if (Y >= J) throw Error(`Unicode sanitization reached maximum iterations (${J}) for input: ${Q.slice(0, 100)}`);
  return $;
}
function m4(Q) {
  if (typeof Q === "string") return NL(Q);
  if (Array.isArray(Q)) return Q.map(m4);
  if (Q !== null && typeof Q === "object") {
    let $ = {};
    for (let [X, Y] of Object.entries(Q)) $[m4(X)] = m4(Y);
    return $;
  }
  return Q;
}
async function qJ(Q, $, X = {}) {
  if (!o0(Q)) throw Error(`Invalid sessionId: ${Q}`);
  if (!$.trim()) throw Error("title must be non-empty");
  let Y = W0({ type: "custom-title", customTitle: $.trim(), sessionId: Q }) + `
`;
  await LJ(Q, Y, X);
}
async function UJ(Q, $, X = {}) {
  if (!o0(Q)) throw Error(`Invalid sessionId: ${Q}`);
  if ($ !== null) {
    let J = m4($).trim();
    if (!J) throw Error("tag must be non-empty (use null to clear)");
    $ = J;
  }
  let Y = W0({ type: "tag", tag: $ ?? "", sessionId: Q }) + `
`;
  await LJ(Q, Y, X);
}
async function LJ(Q, $, X) {
  let Y = `${Q}.jsonl`;
  if (X.dir) {
    let W = await L6(X.dir), H = await n0(W);
    if (H) {
      if (await J$(Y$(H, Y), $)) return;
    }
    let B;
    try {
      B = await u1(W);
    } catch {
      B = [];
    }
    for (let z of B) {
      if (z === W) continue;
      let K = await n0(z);
      if (K) {
        if (await J$(Y$(K, Y), $)) return;
      }
    }
    throw Error(`Session ${Q} not found in project directory for ${X.dir}`);
  }
  let J = D1(), G;
  try {
    G = await OL(J);
  } catch {
    throw Error(`Session ${Q} not found (no projects directory)`);
  }
  for (let W of G) if (await J$(Y$(J, W, Y), $)) return;
  throw Error(`Session ${Q} not found in any project directory`);
}
async function J$(Q, $) {
  let X;
  try {
    X = await DL(Q, VJ.O_WRONLY | VJ.O_APPEND);
  } catch (Y) {
    let J = Y.code;
    if (J === "ENOENT" || J === "ENOTDIR") return false;
    throw Y;
  }
  try {
    let { size: Y } = await X.stat();
    if (Y === 0) return false;
    let J = process.platform === "win32" ? Y : void 0;
    return await X.write($, J, "utf8"), true;
  } finally {
    await X.close();
  }
}
async function jL(Q, $) {
  let X = `${Q}.jsonl`;
  async function Y(W) {
    try {
      let H = await wL(G$(W, X));
      if (H.length === 0) return null;
      return { buf: H, projectDir: W };
    } catch {
      return null;
    }
  }
  if ($) {
    let W = await L6($), H = await n0(W);
    if (H) {
      let z = await Y(H);
      if (z) return z;
    }
    let B;
    try {
      B = await u1(W);
    } catch {
      B = [];
    }
    for (let z of B) {
      if (z === W) continue;
      let K = await n0(z);
      if (K) {
        let U = await Y(K);
        if (U) return U;
      }
    }
    return null;
  }
  let J = D1(), G;
  try {
    G = await AL(J);
  } catch {
    return null;
  }
  for (let W of G) {
    let H = await Y(G$(J, W));
    if (H) return H;
  }
  return null;
}
function IL(Q, $) {
  let X = [], Y = [], J = 10, G = Q.length, W = 0;
  while (W < G) {
    let H = Q.indexOf(10, W);
    if (H === -1) H = G;
    let B = W;
    while (B < H && Q[B] <= 32) B++;
    if (W = H + 1, B >= H) continue;
    let z = Q.toString("utf-8", B, H);
    try {
      let K = O1(z);
      if (RL.has(K.type) && typeof K.uuid === "string") X.push(K);
      else if (K.type === "content-replacement" && K.sessionId === $ && Array.isArray(K.replacements)) Y.push(...K.replacements);
    } catch {
    }
  }
  return { transcript: X, contentReplacements: Y };
}
async function NJ(Q, $ = {}) {
  if (!o0(Q)) throw Error(`Invalid sessionId: ${Q}`);
  if ($.upToMessageId && !o0($.upToMessageId)) throw Error(`Invalid upToMessageId: ${$.upToMessageId}`);
  let X = await jL(Q, $.dir);
  if (!X) throw Error($.dir ? `Session ${Q} not found in project directory for ${$.dir}` : `Session ${Q} not found`);
  let Y = IL(X.buf, Q), J = Y.transcript.filter((q) => !q.isSidechain);
  if (J.length === 0) throw Error(`Session ${Q} has no messages to fork`);
  if ($.upToMessageId) {
    let q = J.findIndex((V) => V.uuid === $.upToMessageId);
    if (q === -1) throw Error(`Message ${$.upToMessageId} not found in session ${Q}`);
    J = J.slice(0, q + 1);
  }
  let G = /* @__PURE__ */ new Map();
  for (let q of J) G.set(q.uuid, FJ());
  let W = J.filter((q) => q.type !== "progress");
  if (W.length === 0) throw Error(`Session ${Q} has no messages to fork`);
  let H = /* @__PURE__ */ new Map();
  for (let q of J) H.set(q.uuid, q);
  let B = FJ(), z = (/* @__PURE__ */ new Date()).toISOString(), K = [];
  for (let q = 0; q < W.length; q++) {
    let V = W[q], L = G.get(V.uuid), F = null, w = V.parentUuid;
    while (w) {
      let Z = H.get(w);
      if (!Z) break;
      if (Z.type !== "progress") {
        F = G.get(w) ?? null;
        break;
      }
      w = Z.parentUuid;
    }
    let D = q === W.length - 1 ? z : V.timestamp, M = V.logicalParentUuid == null ? V.logicalParentUuid : G.get(V.logicalParentUuid) ?? null, R = { ...V, uuid: L, parentUuid: F, logicalParentUuid: M, sessionId: B, timestamp: D, isSidechain: false, teamName: void 0, agentName: void 0, slug: void 0, sourceToolAssistantUUID: void 0, forkedFrom: { sessionId: Q, messageUuid: V.uuid } };
    K.push(W0(R));
  }
  if (Y.contentReplacements.length > 0) K.push(W0({ type: "content-replacement", sessionId: B, replacements: Y.contentReplacements }));
  let U = $.title?.trim();
  if (!U) {
    let q = X.buf.toString("utf-8");
    U = `${r0(q, "customTitle") || r0(q, "aiTitle") || e9(q) || "Forked session"} (fork)`;
  }
  return K.push(W0({ type: "custom-title", sessionId: B, customTitle: U })), await ML(G$(X.projectDir, `${B}.jsonl`), K.join(`
`) + `
`, { encoding: "utf8", mode: 384 }), { sessionId: B };
}
function bL(Q) {
  OJ = Q;
}
function r6() {
  return OJ;
}
function E(Q, $) {
  let X = r6(), Y = l4({ issueData: $, data: Q.data, path: Q.path, errorMaps: [Q.common.contextualErrorMap, Q.schemaErrorMap, X, X === Z1 ? void 0 : Z1].filter((J) => !!J) });
  Q.common.issues.push(Y);
}
function m(Q) {
  if (!Q) return {};
  let { errorMap: $, invalid_type_error: X, required_error: Y, description: J } = Q;
  if ($ && (X || Y)) throw Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  if ($) return { errorMap: $, description: J };
  return { errorMap: (W, H) => {
    let { message: B } = Q;
    if (W.code === "invalid_enum_value") return { message: B ?? H.defaultError };
    if (typeof H.data > "u") return { message: B ?? Y ?? H.defaultError };
    if (W.code !== "invalid_type") return { message: H.defaultError };
    return { message: B ?? X ?? H.defaultError };
  }, description: J };
}
function AJ(Q) {
  let $ = "[0-5]\\d";
  if (Q.precision) $ = `${$}\\.\\d{${Q.precision}}`;
  else if (Q.precision == null) $ = `${$}(\\.\\d+)?`;
  let X = Q.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${$})${X}`;
}
function dL(Q) {
  return new RegExp(`^${AJ(Q)}$`);
}
function jJ(Q) {
  let $ = `${MJ}T${AJ(Q)}`, X = [];
  if (X.push(Q.local ? "Z?" : "Z"), Q.offset) X.push("([+-]\\d{2}:?\\d{2})");
  return $ = `${$}(${X.join("|")})`, new RegExp(`^${$}$`);
}
function iL(Q, $) {
  if (($ === "v4" || !$) && hL.test(Q)) return true;
  if (($ === "v6" || !$) && uL.test(Q)) return true;
  return false;
}
function nL(Q, $) {
  if (!TL.test(Q)) return false;
  try {
    let [X] = Q.split(".");
    if (!X) return false;
    let Y = X.replace(/-/g, "+").replace(/_/g, "/").padEnd(X.length + (4 - X.length % 4) % 4, "="), J = JSON.parse(atob(Y));
    if (typeof J !== "object" || J === null) return false;
    if ("typ" in J && J?.typ !== "JWT") return false;
    if (!J.alg) return false;
    if ($ && J.alg !== $) return false;
    return true;
  } catch {
    return false;
  }
}
function oL(Q, $) {
  if (($ === "v4" || !$) && fL.test(Q)) return true;
  if (($ === "v6" || !$) && mL.test(Q)) return true;
  return false;
}
function rL(Q, $) {
  let X = (Q.toString().split(".")[1] || "").length, Y = ($.toString().split(".")[1] || "").length, J = X > Y ? X : Y, G = Number.parseInt(Q.toFixed(J).replace(".", "")), W = Number.parseInt($.toFixed(J).replace(".", ""));
  return G % W / 10 ** J;
}
function a6(Q) {
  if (Q instanceof U0) {
    let $ = {};
    for (let X in Q.shape) {
      let Y = Q.shape[X];
      $[X] = m0.create(a6(Y));
    }
    return new U0({ ...Q._def, shape: () => $ });
  } else if (Q instanceof Y1) return new Y1({ ...Q._def, type: a6(Q.element) });
  else if (Q instanceof m0) return m0.create(a6(Q.unwrap()));
  else if (Q instanceof S1) return S1.create(a6(Q.unwrap()));
  else if (Q instanceof A1) return A1.create(Q.items.map(($) => a6($)));
  else return Q;
}
function B$(Q, $) {
  let X = w1(Q), Y = w1($);
  if (Q === $) return { valid: true, data: Q };
  else if (X === I.object && Y === I.object) {
    let J = d.objectKeys($), G = d.objectKeys(Q).filter((H) => J.indexOf(H) !== -1), W = { ...Q, ...$ };
    for (let H of G) {
      let B = B$(Q[H], $[H]);
      if (!B.valid) return { valid: false };
      W[H] = B.data;
    }
    return { valid: true, data: W };
  } else if (X === I.array && Y === I.array) {
    if (Q.length !== $.length) return { valid: false };
    let J = [];
    for (let G = 0; G < Q.length; G++) {
      let W = Q[G], H = $[G], B = B$(W, H);
      if (!B.valid) return { valid: false };
      J.push(B.data);
    }
    return { valid: true, data: J };
  } else if (X === I.date && Y === I.date && +Q === +$) return { valid: true, data: Q };
  else return { valid: false };
}
function RJ(Q, $) {
  return new d1({ values: Q, typeName: j.ZodEnum, ...m($) });
}
function wJ(Q, $) {
  let X = typeof Q === "function" ? Q($) : typeof Q === "string" ? { message: Q } : Q;
  return typeof X === "string" ? { message: X } : X;
}
function IJ(Q, $ = {}, X) {
  if (Q) return O6.create().superRefine((Y, J) => {
    let G = Q(Y);
    if (G instanceof Promise) return G.then((W) => {
      if (!W) {
        let H = wJ($, Y), B = H.fatal ?? X ?? true;
        J.addIssue({ code: "custom", ...H, fatal: B });
      }
    });
    if (!G) {
      let W = wJ($, Y), H = W.fatal ?? X ?? true;
      J.addIssue({ code: "custom", ...W, fatal: H });
    }
    return;
  });
  return O6.create();
}
function O(Q, $, X) {
  function Y(H, B) {
    var z;
    Object.defineProperty(H, "_zod", { value: H._zod ?? {}, enumerable: false }), (z = H._zod).traits ?? (z.traits = /* @__PURE__ */ new Set()), H._zod.traits.add(Q), $(H, B);
    for (let K in W.prototype) if (!(K in H)) Object.defineProperty(H, K, { value: W.prototype[K].bind(H) });
    H._zod.constr = W, H._zod.def = B;
  }
  let J = X?.Parent ?? Object;
  class G extends J {
  }
  Object.defineProperty(G, "name", { value: Q });
  function W(H) {
    var B;
    let z = X?.Parent ? new G() : this;
    Y(z, H), (B = z._zod).deferred ?? (B.deferred = []);
    for (let K of z._zod.deferred) K();
    return z;
  }
  return Object.defineProperty(W, "init", { value: Y }), Object.defineProperty(W, Symbol.hasInstance, { value: (H) => {
    if (X?.Parent && H instanceof X.Parent) return true;
    return H?._zod?.traits?.has(Q);
  } }), Object.defineProperty(W, "name", { value: Q }), W;
}
function l0(Q) {
  if (Q) Object.assign(H8, Q);
  return H8;
}
function yF(Q) {
  return Q;
}
function gF(Q) {
  return Q;
}
function hF(Q) {
}
function fF(Q) {
  throw Error();
}
function uF(Q) {
}
function t4(Q) {
  let $ = Object.values(Q).filter((Y) => typeof Y === "number");
  return Object.entries(Q).filter(([Y, J]) => $.indexOf(+Y) === -1).map(([Y, J]) => J);
}
function B8(Q, $ = "|") {
  return Q.map((X) => K8(X)).join($);
}
function V$(Q, $) {
  if (typeof $ === "bigint") return $.toString();
  return $;
}
function a4(Q) {
  return { get value() {
    {
      let X = Q();
      return Object.defineProperty(this, "value", { value: X }), X;
    }
    throw Error("cached value already set");
  } };
}
function s4(Q) {
  return Q === null || Q === void 0;
}
function e4(Q) {
  let $ = Q.startsWith("^") ? 1 : 0, X = Q.endsWith("$") ? Q.length - 1 : Q.length;
  return Q.slice($, X);
}
function q$(Q, $) {
  let X = (Q.toString().split(".")[1] || "").length, Y = ($.toString().split(".")[1] || "").length, J = X > Y ? X : Y, G = Number.parseInt(Q.toFixed(J).replace(".", "")), W = Number.parseInt($.toFixed(J).replace(".", ""));
  return G % W / 10 ** J;
}
function Y0(Q, $, X) {
  Object.defineProperty(Q, $, { get() {
    {
      let J = X();
      return Q[$] = J, J;
    }
    throw Error("cached value already set");
  }, set(J) {
    Object.defineProperty(Q, $, { value: J });
  }, configurable: true });
}
function U$(Q, $, X) {
  Object.defineProperty(Q, $, { value: X, writable: true, enumerable: true, configurable: true });
}
function mF(Q, $) {
  if (!$) return Q;
  return $.reduce((X, Y) => X?.[Y], Q);
}
function lF(Q) {
  let $ = Object.keys(Q), X = $.map((Y) => Q[Y]);
  return Promise.all(X).then((Y) => {
    let J = {};
    for (let G = 0; G < $.length; G++) J[$[G]] = Y[G];
    return J;
  });
}
function cF(Q = 10) {
  let X = "";
  for (let Y = 0; Y < Q; Y++) X += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
  return X;
}
function M6(Q) {
  return JSON.stringify(Q);
}
function K4(Q) {
  return typeof Q === "object" && Q !== null && !Array.isArray(Q);
}
function V4(Q) {
  if (K4(Q) === false) return false;
  let $ = Q.constructor;
  if ($ === void 0) return true;
  let X = $.prototype;
  if (K4(X) === false) return false;
  if (Object.prototype.hasOwnProperty.call(X, "isPrototypeOf") === false) return false;
  return true;
}
function pF(Q) {
  let $ = 0;
  for (let X in Q) if (Object.prototype.hasOwnProperty.call(Q, X)) $++;
  return $;
}
function o1(Q) {
  return Q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function c0(Q, $, X) {
  let Y = new Q._zod.constr($ ?? Q._zod.def);
  if (!$ || X?.parent) Y._zod.parent = Q;
  return Y;
}
function y(Q) {
  let $ = Q;
  if (!$) return {};
  if (typeof $ === "string") return { error: () => $ };
  if ($?.message !== void 0) {
    if ($?.error !== void 0) throw Error("Cannot specify both `message` and `error` params");
    $.error = $.message;
  }
  if (delete $.message, typeof $.error === "string") return { ...$, error: () => $.error };
  return $;
}
function iF(Q) {
  let $;
  return new Proxy({}, { get(X, Y, J) {
    return $ ?? ($ = Q()), Reflect.get($, Y, J);
  }, set(X, Y, J, G) {
    return $ ?? ($ = Q()), Reflect.set($, Y, J, G);
  }, has(X, Y) {
    return $ ?? ($ = Q()), Reflect.has($, Y);
  }, deleteProperty(X, Y) {
    return $ ?? ($ = Q()), Reflect.deleteProperty($, Y);
  }, ownKeys(X) {
    return $ ?? ($ = Q()), Reflect.ownKeys($);
  }, getOwnPropertyDescriptor(X, Y) {
    return $ ?? ($ = Q()), Reflect.getOwnPropertyDescriptor($, Y);
  }, defineProperty(X, Y, J) {
    return $ ?? ($ = Q()), Reflect.defineProperty($, Y, J);
  } });
}
function K8(Q) {
  if (typeof Q === "bigint") return Q.toString() + "n";
  if (typeof Q === "string") return `"${Q}"`;
  return `${Q}`;
}
function N$(Q) {
  return Object.keys(Q).filter(($) => {
    return Q[$]._zod.optin === "optional" && Q[$]._zod.optout === "optional";
  });
}
function nF(Q, $) {
  let X = {}, Y = Q._zod.def;
  for (let J in $) {
    if (!(J in Y.shape)) throw Error(`Unrecognized key: "${J}"`);
    if (!$[J]) continue;
    X[J] = Y.shape[J];
  }
  return c0(Q, { ...Q._zod.def, shape: X, checks: [] });
}
function oF(Q, $) {
  let X = { ...Q._zod.def.shape }, Y = Q._zod.def;
  for (let J in $) {
    if (!(J in Y.shape)) throw Error(`Unrecognized key: "${J}"`);
    if (!$[J]) continue;
    delete X[J];
  }
  return c0(Q, { ...Q._zod.def, shape: X, checks: [] });
}
function rF(Q, $) {
  if (!V4($)) throw Error("Invalid input to extend: expected a plain object");
  let X = { ...Q._zod.def, get shape() {
    let Y = { ...Q._zod.def.shape, ...$ };
    return U$(this, "shape", Y), Y;
  }, checks: [] };
  return c0(Q, X);
}
function tF(Q, $) {
  return c0(Q, { ...Q._zod.def, get shape() {
    let X = { ...Q._zod.def.shape, ...$._zod.def.shape };
    return U$(this, "shape", X), X;
  }, catchall: $._zod.def.catchall, checks: [] });
}
function aF(Q, $, X) {
  let Y = $._zod.def.shape, J = { ...Y };
  if (X) for (let G in X) {
    if (!(G in Y)) throw Error(`Unrecognized key: "${G}"`);
    if (!X[G]) continue;
    J[G] = Q ? new Q({ type: "optional", innerType: Y[G] }) : Y[G];
  }
  else for (let G in Y) J[G] = Q ? new Q({ type: "optional", innerType: Y[G] }) : Y[G];
  return c0($, { ...$._zod.def, shape: J, checks: [] });
}
function sF(Q, $, X) {
  let Y = $._zod.def.shape, J = { ...Y };
  if (X) for (let G in X) {
    if (!(G in J)) throw Error(`Unrecognized key: "${G}"`);
    if (!X[G]) continue;
    J[G] = new Q({ type: "nonoptional", innerType: Y[G] });
  }
  else for (let G in Y) J[G] = new Q({ type: "nonoptional", innerType: Y[G] });
  return c0($, { ...$._zod.def, shape: J, checks: [] });
}
function A6(Q, $ = 0) {
  for (let X = $; X < Q.issues.length; X++) if (Q.issues[X]?.continue !== true) return true;
  return false;
}
function j1(Q, $) {
  return $.map((X) => {
    var Y;
    return (Y = X).path ?? (Y.path = []), X.path.unshift(Q), X;
  });
}
function r4(Q) {
  return typeof Q === "string" ? Q : Q?.message;
}
function W1(Q, $, X) {
  let Y = { ...Q, path: Q.path ?? [] };
  if (!Q.message) {
    let J = r4(Q.inst?._zod.def?.error?.(Q)) ?? r4($?.error?.(Q)) ?? r4(X.customError?.(Q)) ?? r4(X.localeError?.(Q)) ?? "Invalid input";
    Y.message = J;
  }
  if (delete Y.inst, delete Y.continue, !$?.reportInput) delete Y.input;
  return Y;
}
function SJ(Q) {
  if (Q instanceof Set) return "set";
  if (Q instanceof Map) return "map";
  if (Q instanceof File) return "file";
  return "unknown";
}
function Q9(Q) {
  if (Array.isArray(Q)) return "array";
  if (typeof Q === "string") return "string";
  return "unknown";
}
function D$(...Q) {
  let [$, X, Y] = Q;
  if (typeof $ === "string") return { message: $, code: "custom", input: X, inst: Y };
  return { ...$ };
}
function eF(Q) {
  return Object.entries(Q).filter(([$, X]) => {
    return Number.isNaN(Number.parseInt($, 10));
  }).map(($) => $[1]);
}
function w$(Q, $ = (X) => X.message) {
  let X = {}, Y = [];
  for (let J of Q.issues) if (J.path.length > 0) X[J.path[0]] = X[J.path[0]] || [], X[J.path[0]].push($(J));
  else Y.push($(J));
  return { formErrors: Y, fieldErrors: X };
}
function M$(Q, $) {
  let X = $ || function(G) {
    return G.message;
  }, Y = { _errors: [] }, J = (G) => {
    for (let W of G.issues) if (W.code === "invalid_union" && W.errors.length) W.errors.map((H) => J({ issues: H }));
    else if (W.code === "invalid_key") J({ issues: W.issues });
    else if (W.code === "invalid_element") J({ issues: W.issues });
    else if (W.path.length === 0) Y._errors.push(X(W));
    else {
      let H = Y, B = 0;
      while (B < W.path.length) {
        let z = W.path[B];
        if (B !== W.path.length - 1) H[z] = H[z] || { _errors: [] };
        else H[z] = H[z] || { _errors: [] }, H[z]._errors.push(X(W));
        H = H[z], B++;
      }
    }
  };
  return J(Q), Y;
}
function lJ() {
  return new RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
}
function sJ(Q) {
  return typeof Q.precision === "number" ? Q.precision === -1 ? "(?:[01]\\d|2[0-3]):[0-5]\\d" : Q.precision === 0 ? "(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d" : `(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{${Q.precision}}` : "(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?";
}
function eJ(Q) {
  return new RegExp(`^${sJ(Q)}$`);
}
function QG(Q) {
  let $ = sJ({ precision: Q.precision }), X = ["Z"];
  if (Q.local) X.push("");
  if (Q.offset) X.push("([+-]\\d{2}:\\d{2})");
  let Y = `${$}(?:${X.join("|")})`;
  return new RegExp(`^${tJ}T(?:${Y})$`);
}
function yG(Q) {
  if (Q === "") return true;
  if (Q.length % 4 !== 0) return false;
  try {
    return atob(Q), true;
  } catch {
    return false;
  }
}
function $N(Q) {
  if (!Z$.test(Q)) return false;
  let $ = Q.replace(/[-_]/g, (Y) => Y === "-" ? "+" : "/"), X = $.padEnd(Math.ceil($.length / 4) * 4, "=");
  return yG(X);
}
function XN(Q, $ = null) {
  try {
    let X = Q.split(".");
    if (X.length !== 3) return false;
    let [Y] = X;
    if (!Y) return false;
    let J = JSON.parse(atob(Y));
    if ("typ" in J && J?.typ !== "JWT") return false;
    if (!J.alg) return false;
    if ($ && (!("alg" in J) || J.alg !== $)) return false;
    return true;
  } catch {
    return false;
  }
}
function RG(Q, $, X) {
  if (Q.issues.length) $.issues.push(...j1(X, Q.issues));
  $.value[X] = Q.value;
}
function U8(Q, $, X) {
  if (Q.issues.length) $.issues.push(...j1(X, Q.issues));
  $.value[X] = Q.value;
}
function IG(Q, $, X, Y) {
  if (Q.issues.length) if (Y[X] === void 0) if (X in Y) $.value[X] = void 0;
  else $.value[X] = Q.value;
  else $.issues.push(...j1(X, Q.issues));
  else if (Q.value === void 0) {
    if (X in Y) $.value[X] = void 0;
  } else $.value[X] = Q.value;
}
function EG(Q, $, X, Y) {
  for (let J of Q) if (J.issues.length === 0) return $.value = J.value, $;
  return $.issues.push({ code: "invalid_union", input: $.value, inst: X, errors: Q.map((J) => J.issues.map((G) => W1(G, Y, l0()))) }), $;
}
function k$(Q, $) {
  if (Q === $) return { valid: true, data: Q };
  if (Q instanceof Date && $ instanceof Date && +Q === +$) return { valid: true, data: Q };
  if (V4(Q) && V4($)) {
    let X = Object.keys($), Y = Object.keys(Q).filter((G) => X.indexOf(G) !== -1), J = { ...Q, ...$ };
    for (let G of Y) {
      let W = k$(Q[G], $[G]);
      if (!W.valid) return { valid: false, mergeErrorPath: [G, ...W.mergeErrorPath] };
      J[G] = W.data;
    }
    return { valid: true, data: J };
  }
  if (Array.isArray(Q) && Array.isArray($)) {
    if (Q.length !== $.length) return { valid: false, mergeErrorPath: [] };
    let X = [];
    for (let Y = 0; Y < Q.length; Y++) {
      let J = Q[Y], G = $[Y], W = k$(J, G);
      if (!W.valid) return { valid: false, mergeErrorPath: [Y, ...W.mergeErrorPath] };
      X.push(W.data);
    }
    return { valid: true, data: X };
  }
  return { valid: false, mergeErrorPath: [] };
}
function PG(Q, $, X) {
  if ($.issues.length) Q.issues.push(...$.issues);
  if (X.issues.length) Q.issues.push(...X.issues);
  if (A6(Q)) return Q;
  let Y = k$($.value, X.value);
  if (!Y.valid) throw Error(`Unmergable intersection. Error path: ${JSON.stringify(Y.mergeErrorPath)}`);
  return Q.value = Y.data, Q;
}
function bG(Q, $) {
  if (Q.value === void 0) Q.value = $.defaultValue;
  return Q;
}
function ZG(Q, $) {
  if (!Q.issues.length && Q.value === void 0) Q.issues.push({ code: "invalid_type", expected: "nonoptional", input: Q.value, inst: $ });
  return Q;
}
function CG(Q, $, X) {
  if (A6(Q)) return Q;
  return $.out._zod.run({ value: Q.value, issues: Q.issues }, X);
}
function SG(Q) {
  return Q.value = Object.freeze(Q.value), Q;
}
function _G(Q, $, X, Y) {
  if (!Q) {
    let J = { code: "custom", input: X, inst: Y, path: [...Y._zod.def.path ?? []], continue: !Y._zod.def.abort };
    if (Y._zod.def.params) J.params = Y._zod.def.params;
    $.issues.push(D$(J));
  }
}
function wX() {
  return { localeError: JN() };
}
function gG() {
  return new O8();
}
function MX(Q, $) {
  return new Q({ type: "string", ...y($) });
}
function AX(Q, $) {
  return new Q({ type: "string", format: "email", check: "string_format", abort: false, ...y($) });
}
function D8(Q, $) {
  return new Q({ type: "string", format: "guid", check: "string_format", abort: false, ...y($) });
}
function jX(Q, $) {
  return new Q({ type: "string", format: "uuid", check: "string_format", abort: false, ...y($) });
}
function RX(Q, $) {
  return new Q({ type: "string", format: "uuid", check: "string_format", abort: false, version: "v4", ...y($) });
}
function IX(Q, $) {
  return new Q({ type: "string", format: "uuid", check: "string_format", abort: false, version: "v6", ...y($) });
}
function EX(Q, $) {
  return new Q({ type: "string", format: "uuid", check: "string_format", abort: false, version: "v7", ...y($) });
}
function PX(Q, $) {
  return new Q({ type: "string", format: "url", check: "string_format", abort: false, ...y($) });
}
function bX(Q, $) {
  return new Q({ type: "string", format: "emoji", check: "string_format", abort: false, ...y($) });
}
function ZX(Q, $) {
  return new Q({ type: "string", format: "nanoid", check: "string_format", abort: false, ...y($) });
}
function CX(Q, $) {
  return new Q({ type: "string", format: "cuid", check: "string_format", abort: false, ...y($) });
}
function SX(Q, $) {
  return new Q({ type: "string", format: "cuid2", check: "string_format", abort: false, ...y($) });
}
function _X(Q, $) {
  return new Q({ type: "string", format: "ulid", check: "string_format", abort: false, ...y($) });
}
function kX(Q, $) {
  return new Q({ type: "string", format: "xid", check: "string_format", abort: false, ...y($) });
}
function vX(Q, $) {
  return new Q({ type: "string", format: "ksuid", check: "string_format", abort: false, ...y($) });
}
function TX(Q, $) {
  return new Q({ type: "string", format: "ipv4", check: "string_format", abort: false, ...y($) });
}
function xX(Q, $) {
  return new Q({ type: "string", format: "ipv6", check: "string_format", abort: false, ...y($) });
}
function yX(Q, $) {
  return new Q({ type: "string", format: "cidrv4", check: "string_format", abort: false, ...y($) });
}
function gX(Q, $) {
  return new Q({ type: "string", format: "cidrv6", check: "string_format", abort: false, ...y($) });
}
function hX(Q, $) {
  return new Q({ type: "string", format: "base64", check: "string_format", abort: false, ...y($) });
}
function fX(Q, $) {
  return new Q({ type: "string", format: "base64url", check: "string_format", abort: false, ...y($) });
}
function uX(Q, $) {
  return new Q({ type: "string", format: "e164", check: "string_format", abort: false, ...y($) });
}
function mX(Q, $) {
  return new Q({ type: "string", format: "jwt", check: "string_format", abort: false, ...y($) });
}
function hG(Q, $) {
  return new Q({ type: "string", format: "datetime", check: "string_format", offset: false, local: false, precision: null, ...y($) });
}
function fG(Q, $) {
  return new Q({ type: "string", format: "date", check: "string_format", ...y($) });
}
function uG(Q, $) {
  return new Q({ type: "string", format: "time", check: "string_format", precision: null, ...y($) });
}
function mG(Q, $) {
  return new Q({ type: "string", format: "duration", check: "string_format", ...y($) });
}
function lX(Q, $) {
  return new Q({ type: "number", checks: [], ...y($) });
}
function cX(Q, $) {
  return new Q({ type: "number", check: "number_format", abort: false, format: "safeint", ...y($) });
}
function pX(Q, $) {
  return new Q({ type: "boolean", ...y($) });
}
function dX(Q, $) {
  return new Q({ type: "null", ...y($) });
}
function iX(Q) {
  return new Q({ type: "unknown" });
}
function nX(Q, $) {
  return new Q({ type: "never", ...y($) });
}
function w8(Q, $) {
  return new C$({ check: "less_than", ...y($), value: Q, inclusive: false });
}
function J9(Q, $) {
  return new C$({ check: "less_than", ...y($), value: Q, inclusive: true });
}
function M8(Q, $) {
  return new S$({ check: "greater_than", ...y($), value: Q, inclusive: false });
}
function G9(Q, $) {
  return new S$({ check: "greater_than", ...y($), value: Q, inclusive: true });
}
function A8(Q, $) {
  return new zG({ check: "multiple_of", ...y($), value: Q });
}
function j8(Q, $) {
  return new VG({ check: "max_length", ...y($), maximum: Q });
}
function q4(Q, $) {
  return new qG({ check: "min_length", ...y($), minimum: Q });
}
function R8(Q, $) {
  return new UG({ check: "length_equals", ...y($), length: Q });
}
function oX(Q, $) {
  return new LG({ check: "string_format", format: "regex", ...y($), pattern: Q });
}
function rX(Q) {
  return new FG({ check: "string_format", format: "lowercase", ...y(Q) });
}
function tX(Q) {
  return new NG({ check: "string_format", format: "uppercase", ...y(Q) });
}
function aX(Q, $) {
  return new OG({ check: "string_format", format: "includes", ...y($), includes: Q });
}
function sX(Q, $) {
  return new DG({ check: "string_format", format: "starts_with", ...y($), prefix: Q });
}
function eX(Q, $) {
  return new wG({ check: "string_format", format: "ends_with", ...y($), suffix: Q });
}
function I6(Q) {
  return new MG({ check: "overwrite", tx: Q });
}
function QY(Q) {
  return I6(($) => $.normalize(Q));
}
function $Y() {
  return I6((Q) => Q.trim());
}
function XY() {
  return I6((Q) => Q.toLowerCase());
}
function YY() {
  return I6((Q) => Q.toUpperCase());
}
function lG(Q, $, X) {
  return new Q({ type: "array", element: $, ...y(X) });
}
function JY(Q, $, X) {
  let Y = y(X);
  return Y.abort ?? (Y.abort = true), new Q({ type: "custom", check: "custom", fn: $, ...Y });
}
function GY(Q, $, X) {
  return new Q({ type: "custom", check: "custom", fn: $, ...y(X) });
}
function HY(Q, $) {
  if (Q instanceof O8) {
    let Y = new WY($), J = {};
    for (let H of Q._idmap.entries()) {
      let [B, z] = H;
      Y.process(z);
    }
    let G = {}, W = { registry: Q, uri: $?.uri || ((H) => H), defs: J };
    for (let H of Q._idmap.entries()) {
      let [B, z] = H;
      G[B] = Y.emit(z, { ...$, external: W });
    }
    if (Object.keys(J).length > 0) {
      let H = Y.target === "draft-2020-12" ? "$defs" : "definitions";
      G.__shared = { [H]: J };
    }
    return { schemas: G };
  }
  let X = new WY($);
  return X.process(Q), X.emit(Q, $);
}
function w0(Q, $) {
  let X = $ ?? { seen: /* @__PURE__ */ new Set() };
  if (X.seen.has(Q)) return false;
  X.seen.add(Q);
  let J = Q._zod.def;
  switch (J.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "date":
    case "symbol":
    case "undefined":
    case "null":
    case "any":
    case "unknown":
    case "never":
    case "void":
    case "literal":
    case "enum":
    case "nan":
    case "file":
    case "template_literal":
      return false;
    case "array":
      return w0(J.element, X);
    case "object": {
      for (let G in J.shape) if (w0(J.shape[G], X)) return true;
      return false;
    }
    case "union": {
      for (let G of J.options) if (w0(G, X)) return true;
      return false;
    }
    case "intersection":
      return w0(J.left, X) || w0(J.right, X);
    case "tuple": {
      for (let G of J.items) if (w0(G, X)) return true;
      if (J.rest && w0(J.rest, X)) return true;
      return false;
    }
    case "record":
      return w0(J.keyType, X) || w0(J.valueType, X);
    case "map":
      return w0(J.keyType, X) || w0(J.valueType, X);
    case "set":
      return w0(J.valueType, X);
    case "promise":
    case "optional":
    case "nonoptional":
    case "nullable":
    case "readonly":
      return w0(J.innerType, X);
    case "lazy":
      return w0(J.getter(), X);
    case "default":
      return w0(J.innerType, X);
    case "prefault":
      return w0(J.innerType, X);
    case "custom":
      return false;
    case "transform":
      return true;
    case "pipe":
      return w0(J.in, X) || w0(J.out, X);
    case "success":
      return false;
    case "catch":
      return false;
    default:
  }
  throw Error(`Unknown schema type: ${J.type}`);
}
function BY(Q, $) {
  let X = { type: "object", get shape() {
    return i.assignProp(this, "shape", { ...Q }), this.shape;
  }, ...i.normalizeParams($) };
  return new lN(X);
}
function t0(Q) {
  return !!Q._zod;
}
function P6(Q) {
  let $ = Object.values(Q);
  if ($.length === 0) return BY({});
  let X = $.every(t0), Y = $.every((J) => !t0(J));
  if (X) return BY(Q);
  if (Y) return z$(Q);
  throw Error("Mixed Zod versions detected in object shape.");
}
function t1(Q, $) {
  if (t0(Q)) return j6(Q, $);
  return Q.safeParse($);
}
async function I8(Q, $) {
  if (t0(Q)) return await R6(Q, $);
  return await Q.safeParseAsync($);
}
function a1(Q) {
  if (!Q) return;
  let $;
  if (t0(Q)) $ = Q._zod?.def?.shape;
  else $ = Q.shape;
  if (!$) return;
  if (typeof $ === "function") try {
    return $();
  } catch {
    return;
  }
  return $;
}
function U4(Q) {
  if (!Q) return;
  if (typeof Q === "object") {
    let $ = Q, X = Q;
    if (!$._def && !X._zod) {
      let Y = Object.values(Q);
      if (Y.length > 0 && Y.every((J) => typeof J === "object" && J !== null && (J._def !== void 0 || J._zod !== void 0 || typeof J.parse === "function"))) return P6(Q);
    }
  }
  if (t0(Q)) {
    let X = Q._zod?.def;
    if (X && (X.type === "object" || X.shape !== void 0)) return Q;
  } else if (Q.shape !== void 0) return Q;
  return;
}
function E8(Q) {
  if (Q && typeof Q === "object") {
    if ("message" in Q && typeof Q.message === "string") return Q.message;
    if ("issues" in Q && Array.isArray(Q.issues) && Q.issues.length > 0) {
      let $ = Q.issues[0];
      if ($ && typeof $ === "object" && "message" in $) return String($.message);
    }
    try {
      return JSON.stringify(Q);
    } catch {
      return String(Q);
    }
  }
  return String(Q);
}
function pG(Q) {
  return Q.description;
}
function dG(Q) {
  if (t0(Q)) return Q._zod?.def?.type === "optional";
  let $ = Q;
  if (typeof Q.isOptional === "function") return Q.isOptional();
  return $._def?.typeName === "ZodOptional";
}
function P8(Q) {
  if (t0(Q)) {
    let G = Q._zod?.def;
    if (G) {
      if (G.value !== void 0) return G.value;
      if (Array.isArray(G.values) && G.values.length > 0) return G.values[0];
    }
  }
  let X = Q._def;
  if (X) {
    if (X.value !== void 0) return X.value;
    if (Array.isArray(X.values) && X.values.length > 0) return X.values[0];
  }
  let Y = Q.value;
  if (Y !== void 0) return Y;
  return;
}
function zY(Q) {
  return hG(iG, Q);
}
function KY(Q) {
  return fG(nG, Q);
}
function VY(Q) {
  return uG(oG, Q);
}
function qY(Q) {
  return mG(rG, Q);
}
function N(Q) {
  return MX(aN, Q);
}
function s(Q) {
  return lX(GW, Q);
}
function XW(Q) {
  return cX(FO, Q);
}
function M0(Q) {
  return pX(NO, Q);
}
function FY(Q) {
  return dX(OO, Q);
}
function z0() {
  return iX(DO);
}
function MO(Q) {
  return nX(wO, Q);
}
function n(Q, $) {
  return lG(AO, Q, $);
}
function b(Q, $) {
  let X = { type: "object", get shape() {
    return i.assignProp(this, "shape", { ...Q }), this.shape;
  }, ...i.normalizeParams($) };
  return new WW(X);
}
function S0(Q, $) {
  return new WW({ type: "object", get shape() {
    return i.assignProp(this, "shape", { ...Q }), this.shape;
  }, catchall: z0(), ...i.normalizeParams($) });
}
function G0(Q, $) {
  return new HW({ type: "union", options: Q, ...i.normalizeParams($) });
}
function NY(Q, $, X) {
  return new jO({ type: "union", options: $, discriminator: Q, ...i.normalizeParams(X) });
}
function Z8(Q, $) {
  return new RO({ type: "intersection", left: Q, right: $ });
}
function K0(Q, $, X) {
  return new IO({ type: "record", keyType: Q, valueType: $, ...i.normalizeParams(X) });
}
function y0(Q, $) {
  let X = Array.isArray(Q) ? Object.fromEntries(Q.map((Y) => [Y, Y])) : Q;
  return new UY({ type: "enum", entries: X, ...i.normalizeParams($) });
}
function _(Q, $) {
  return new EO({ type: "literal", values: Array.isArray(Q) ? Q : [Q], ...i.normalizeParams($) });
}
function BW(Q) {
  return new PO({ type: "transform", transform: Q });
}
function L0(Q) {
  return new zW({ type: "optional", innerType: Q });
}
function YW(Q) {
  return new bO({ type: "nullable", innerType: Q });
}
function CO(Q, $) {
  return new ZO({ type: "default", innerType: Q, get defaultValue() {
    return typeof $ === "function" ? $() : $;
  } });
}
function _O(Q, $) {
  return new SO({ type: "prefault", innerType: Q, get defaultValue() {
    return typeof $ === "function" ? $() : $;
  } });
}
function kO(Q, $) {
  return new KW({ type: "nonoptional", innerType: Q, ...i.normalizeParams($) });
}
function TO(Q, $) {
  return new vO({ type: "catch", innerType: Q, catchValue: typeof $ === "function" ? $ : () => $ });
}
function LY(Q, $) {
  return new xO({ type: "pipe", in: Q, out: $ });
}
function gO(Q) {
  return new yO({ type: "readonly", innerType: Q });
}
function hO(Q, $) {
  let X = new j0({ check: "custom", ...i.normalizeParams($) });
  return X._zod.check = Q, X;
}
function qW(Q, $) {
  return JY(VW, Q ?? (() => true), $);
}
function fO(Q, $ = {}) {
  return GY(VW, Q, $);
}
function uO(Q, $) {
  let X = hO((Y) => {
    return Y.addIssue = (J) => {
      if (typeof J === "string") Y.issues.push(i.issue(J, Y.value, X._zod.def));
      else {
        let G = J;
        if (G.fatal) G.continue = false;
        G.code ?? (G.code = "custom"), G.input ?? (G.input = Y.value), G.inst ?? (G.inst = X), G.continue ?? (G.continue = !X._zod.def.abort), Y.issues.push(i.issue(G));
      }
    }, Q(Y.value, Y);
  }, $);
  return X;
}
function OY(Q, $) {
  return LY(BW(Q), $);
}
function ZW(Q) {
  if (Q.params.ref.type !== "ref/prompt") throw TypeError(`Expected CompleteRequestPrompt, but got ${Q.params.ref.type}`);
}
function CW(Q) {
  if (Q.params.ref.type !== "ref/resource") throw TypeError(`Expected CompleteRequestResourceTemplate, but got ${Q.params.ref.type}`);
}
function e1(Q) {
  return Q === "completed" || Q === "failed" || Q === "cancelled";
}
function TY(Q, $, X, Y) {
  if (!Y?.errorMessages) return;
  if (X) Q.errorMessage = { ...Q.errorMessage, [$]: X };
}
function o(Q, $, X, Y, J) {
  Q[$] = X, TY(Q, $, Y, J);
}
function V0(Q) {
  if (Q.target !== "openAi") return {};
  let $ = [...Q.basePath, Q.definitionPath, Q.openAiAnyTypeName];
  return Q.flags.hasReferencedOpenAiAnyType = true, { $ref: Q.$refStrategy === "relative" ? t8($, Q.currentPath) : $.join("/") };
}
function xW(Q, $) {
  let X = { type: "array" };
  if (Q.type?._def && Q.type?._def?.typeName !== j.ZodAny) X.items = g(Q.type._def, { ...$, currentPath: [...$.currentPath, "items"] });
  if (Q.minLength) o(X, "minItems", Q.minLength.value, Q.minLength.message, $);
  if (Q.maxLength) o(X, "maxItems", Q.maxLength.value, Q.maxLength.message, $);
  if (Q.exactLength) o(X, "minItems", Q.exactLength.value, Q.exactLength.message, $), o(X, "maxItems", Q.exactLength.value, Q.exactLength.message, $);
  return X;
}
function yW(Q, $) {
  let X = { type: "integer", format: "int64" };
  if (!Q.checks) return X;
  for (let Y of Q.checks) switch (Y.kind) {
    case "min":
      if ($.target === "jsonSchema7") if (Y.inclusive) o(X, "minimum", Y.value, Y.message, $);
      else o(X, "exclusiveMinimum", Y.value, Y.message, $);
      else {
        if (!Y.inclusive) X.exclusiveMinimum = true;
        o(X, "minimum", Y.value, Y.message, $);
      }
      break;
    case "max":
      if ($.target === "jsonSchema7") if (Y.inclusive) o(X, "maximum", Y.value, Y.message, $);
      else o(X, "exclusiveMaximum", Y.value, Y.message, $);
      else {
        if (!Y.inclusive) X.exclusiveMaximum = true;
        o(X, "maximum", Y.value, Y.message, $);
      }
      break;
    case "multipleOf":
      o(X, "multipleOf", Y.value, Y.message, $);
      break;
  }
  return X;
}
function gW() {
  return { type: "boolean" };
}
function a8(Q, $) {
  return g(Q.type._def, $);
}
function xY(Q, $, X) {
  let Y = X ?? $.dateStrategy;
  if (Array.isArray(Y)) return { anyOf: Y.map((J, G) => xY(Q, $, J)) };
  switch (Y) {
    case "string":
    case "format:date-time":
      return { type: "string", format: "date-time" };
    case "format:date":
      return { type: "string", format: "date" };
    case "integer":
      return Uw(Q, $);
  }
}
function fW(Q, $) {
  return { ...g(Q.innerType._def, $), default: Q.defaultValue() };
}
function uW(Q, $) {
  return $.effectStrategy === "input" ? g(Q.schema._def, $) : V0($);
}
function mW(Q) {
  return { type: "string", enum: Array.from(Q.values) };
}
function lW(Q, $) {
  let X = [g(Q.left._def, { ...$, currentPath: [...$.currentPath, "allOf", "0"] }), g(Q.right._def, { ...$, currentPath: [...$.currentPath, "allOf", "1"] })].filter((G) => !!G), Y = $.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0, J = [];
  return X.forEach((G) => {
    if (Lw(G)) {
      if (J.push(...G.allOf), G.unevaluatedProperties === void 0) Y = void 0;
    } else {
      let W = G;
      if ("additionalProperties" in G && G.additionalProperties === false) {
        let { additionalProperties: H, ...B } = G;
        W = B;
      } else Y = void 0;
      J.push(W);
    }
  }), J.length ? { allOf: J, ...Y } : void 0;
}
function cW(Q, $) {
  let X = typeof Q.value;
  if (X !== "bigint" && X !== "number" && X !== "boolean" && X !== "string") return { type: Array.isArray(Q.value) ? "array" : "object" };
  if ($.target === "openApi3") return { type: X === "bigint" ? "integer" : X, enum: [Q.value] };
  return { type: X === "bigint" ? "integer" : X, const: Q.value };
}
function s8(Q, $) {
  let X = { type: "string" };
  if (Q.checks) for (let Y of Q.checks) switch (Y.kind) {
    case "min":
      o(X, "minLength", typeof X.minLength === "number" ? Math.max(X.minLength, Y.value) : Y.value, Y.message, $);
      break;
    case "max":
      o(X, "maxLength", typeof X.maxLength === "number" ? Math.min(X.maxLength, Y.value) : Y.value, Y.message, $);
      break;
    case "email":
      switch ($.emailStrategy) {
        case "format:email":
          B1(X, "email", Y.message, $);
          break;
        case "format:idn-email":
          B1(X, "idn-email", Y.message, $);
          break;
        case "pattern:zod":
          _0(X, H1.email, Y.message, $);
          break;
      }
      break;
    case "url":
      B1(X, "uri", Y.message, $);
      break;
    case "uuid":
      B1(X, "uuid", Y.message, $);
      break;
    case "regex":
      _0(X, Y.regex, Y.message, $);
      break;
    case "cuid":
      _0(X, H1.cuid, Y.message, $);
      break;
    case "cuid2":
      _0(X, H1.cuid2, Y.message, $);
      break;
    case "startsWith":
      _0(X, RegExp(`^${gY(Y.value, $)}`), Y.message, $);
      break;
    case "endsWith":
      _0(X, RegExp(`${gY(Y.value, $)}$`), Y.message, $);
      break;
    case "datetime":
      B1(X, "date-time", Y.message, $);
      break;
    case "date":
      B1(X, "date", Y.message, $);
      break;
    case "time":
      B1(X, "time", Y.message, $);
      break;
    case "duration":
      B1(X, "duration", Y.message, $);
      break;
    case "length":
      o(X, "minLength", typeof X.minLength === "number" ? Math.max(X.minLength, Y.value) : Y.value, Y.message, $), o(X, "maxLength", typeof X.maxLength === "number" ? Math.min(X.maxLength, Y.value) : Y.value, Y.message, $);
      break;
    case "includes": {
      _0(X, RegExp(gY(Y.value, $)), Y.message, $);
      break;
    }
    case "ip": {
      if (Y.version !== "v6") B1(X, "ipv4", Y.message, $);
      if (Y.version !== "v4") B1(X, "ipv6", Y.message, $);
      break;
    }
    case "base64url":
      _0(X, H1.base64url, Y.message, $);
      break;
    case "jwt":
      _0(X, H1.jwt, Y.message, $);
      break;
    case "cidr": {
      if (Y.version !== "v6") _0(X, H1.ipv4Cidr, Y.message, $);
      if (Y.version !== "v4") _0(X, H1.ipv6Cidr, Y.message, $);
      break;
    }
    case "emoji":
      _0(X, H1.emoji(), Y.message, $);
      break;
    case "ulid": {
      _0(X, H1.ulid, Y.message, $);
      break;
    }
    case "base64": {
      switch ($.base64Strategy) {
        case "format:binary": {
          B1(X, "binary", Y.message, $);
          break;
        }
        case "contentEncoding:base64": {
          o(X, "contentEncoding", "base64", Y.message, $);
          break;
        }
        case "pattern:zod": {
          _0(X, H1.base64, Y.message, $);
          break;
        }
      }
      break;
    }
    case "nanoid":
      _0(X, H1.nanoid, Y.message, $);
    case "toLowerCase":
    case "toUpperCase":
    case "trim":
      break;
    default:
      /* @__PURE__ */ ((J) => {
      })(Y);
  }
  return X;
}
function gY(Q, $) {
  return $.patternStrategy === "escape" ? Nw(Q) : Q;
}
function Nw(Q) {
  let $ = "";
  for (let X = 0; X < Q.length; X++) {
    if (!Fw.has(Q[X])) $ += "\\";
    $ += Q[X];
  }
  return $;
}
function B1(Q, $, X, Y) {
  if (Q.format || Q.anyOf?.some((J) => J.format)) {
    if (!Q.anyOf) Q.anyOf = [];
    if (Q.format) {
      if (Q.anyOf.push({ format: Q.format, ...Q.errorMessage && Y.errorMessages && { errorMessage: { format: Q.errorMessage.format } } }), delete Q.format, Q.errorMessage) {
        if (delete Q.errorMessage.format, Object.keys(Q.errorMessage).length === 0) delete Q.errorMessage;
      }
    }
    Q.anyOf.push({ format: $, ...X && Y.errorMessages && { errorMessage: { format: X } } });
  } else o(Q, "format", $, X, Y);
}
function _0(Q, $, X, Y) {
  if (Q.pattern || Q.allOf?.some((J) => J.pattern)) {
    if (!Q.allOf) Q.allOf = [];
    if (Q.pattern) {
      if (Q.allOf.push({ pattern: Q.pattern, ...Q.errorMessage && Y.errorMessages && { errorMessage: { pattern: Q.errorMessage.pattern } } }), delete Q.pattern, Q.errorMessage) {
        if (delete Q.errorMessage.pattern, Object.keys(Q.errorMessage).length === 0) delete Q.errorMessage;
      }
    }
    Q.allOf.push({ pattern: pW($, Y), ...X && Y.errorMessages && { errorMessage: { pattern: X } } });
  } else o(Q, "pattern", pW($, Y), X, Y);
}
function pW(Q, $) {
  if (!$.applyRegexFlags || !Q.flags) return Q.source;
  let X = { i: Q.flags.includes("i"), m: Q.flags.includes("m"), s: Q.flags.includes("s") }, Y = X.i ? Q.source.toLowerCase() : Q.source, J = "", G = false, W = false, H = false;
  for (let B = 0; B < Y.length; B++) {
    if (G) {
      J += Y[B], G = false;
      continue;
    }
    if (X.i) {
      if (W) {
        if (Y[B].match(/[a-z]/)) {
          if (H) J += Y[B], J += `${Y[B - 2]}-${Y[B]}`.toUpperCase(), H = false;
          else if (Y[B + 1] === "-" && Y[B + 2]?.match(/[a-z]/)) J += Y[B], H = true;
          else J += `${Y[B]}${Y[B].toUpperCase()}`;
          continue;
        }
      } else if (Y[B].match(/[a-z]/)) {
        J += `[${Y[B]}${Y[B].toUpperCase()}]`;
        continue;
      }
    }
    if (X.m) {
      if (Y[B] === "^") {
        J += `(^|(?<=[\r
]))`;
        continue;
      } else if (Y[B] === "$") {
        J += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (X.s && Y[B] === ".") {
      J += W ? `${Y[B]}\r
` : `[${Y[B]}\r
]`;
      continue;
    }
    if (J += Y[B], Y[B] === "\\") G = true;
    else if (W && Y[B] === "]") W = false;
    else if (!W && Y[B] === "[") W = true;
  }
  try {
    new RegExp(J);
  } catch {
    return console.warn(`Could not convert regex pattern at ${$.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`), Q.source;
  }
  return J;
}
function e8(Q, $) {
  if ($.target === "openAi") console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  if ($.target === "openApi3" && Q.keyType?._def.typeName === j.ZodEnum) return { type: "object", required: Q.keyType._def.values, properties: Q.keyType._def.values.reduce((Y, J) => ({ ...Y, [J]: g(Q.valueType._def, { ...$, currentPath: [...$.currentPath, "properties", J] }) ?? V0($) }), {}), additionalProperties: $.rejectedAdditionalProperties };
  let X = { type: "object", additionalProperties: g(Q.valueType._def, { ...$, currentPath: [...$.currentPath, "additionalProperties"] }) ?? $.allowedAdditionalProperties };
  if ($.target === "openApi3") return X;
  if (Q.keyType?._def.typeName === j.ZodString && Q.keyType._def.checks?.length) {
    let { type: Y, ...J } = s8(Q.keyType._def, $);
    return { ...X, propertyNames: J };
  } else if (Q.keyType?._def.typeName === j.ZodEnum) return { ...X, propertyNames: { enum: Q.keyType._def.values } };
  else if (Q.keyType?._def.typeName === j.ZodBranded && Q.keyType._def.type._def.typeName === j.ZodString && Q.keyType._def.type._def.checks?.length) {
    let { type: Y, ...J } = a8(Q.keyType._def, $);
    return { ...X, propertyNames: J };
  }
  return X;
}
function dW(Q, $) {
  if ($.mapStrategy === "record") return e8(Q, $);
  let X = g(Q.keyType._def, { ...$, currentPath: [...$.currentPath, "items", "items", "0"] }) || V0($), Y = g(Q.valueType._def, { ...$, currentPath: [...$.currentPath, "items", "items", "1"] }) || V0($);
  return { type: "array", maxItems: 125, items: { type: "array", items: [X, Y], minItems: 2, maxItems: 2 } };
}
function iW(Q) {
  let $ = Q.values, Y = Object.keys(Q.values).filter((G) => {
    return typeof $[$[G]] !== "number";
  }).map((G) => $[G]), J = Array.from(new Set(Y.map((G) => typeof G)));
  return { type: J.length === 1 ? J[0] === "string" ? "string" : "number" : ["string", "number"], enum: Y };
}
function nW(Q) {
  return Q.target === "openAi" ? void 0 : { not: V0({ ...Q, currentPath: [...Q.currentPath, "not"] }) };
}
function oW(Q) {
  return Q.target === "openApi3" ? { enum: ["null"], nullable: true } : { type: "null" };
}
function tW(Q, $) {
  if ($.target === "openApi3") return rW(Q, $);
  let X = Q.options instanceof Map ? Array.from(Q.options.values()) : Q.options;
  if (X.every((Y) => Y._def.typeName in D9 && (!Y._def.checks || !Y._def.checks.length))) {
    let Y = X.reduce((J, G) => {
      let W = D9[G._def.typeName];
      return W && !J.includes(W) ? [...J, W] : J;
    }, []);
    return { type: Y.length > 1 ? Y : Y[0] };
  } else if (X.every((Y) => Y._def.typeName === "ZodLiteral" && !Y.description)) {
    let Y = X.reduce((J, G) => {
      let W = typeof G._def.value;
      switch (W) {
        case "string":
        case "number":
        case "boolean":
          return [...J, W];
        case "bigint":
          return [...J, "integer"];
        case "object":
          if (G._def.value === null) return [...J, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return J;
      }
    }, []);
    if (Y.length === X.length) {
      let J = Y.filter((G, W, H) => H.indexOf(G) === W);
      return { type: J.length > 1 ? J : J[0], enum: X.reduce((G, W) => {
        return G.includes(W._def.value) ? G : [...G, W._def.value];
      }, []) };
    }
  } else if (X.every((Y) => Y._def.typeName === "ZodEnum")) return { type: "string", enum: X.reduce((Y, J) => [...Y, ...J._def.values.filter((G) => !Y.includes(G))], []) };
  return rW(Q, $);
}
function aW(Q, $) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(Q.innerType._def.typeName) && (!Q.innerType._def.checks || !Q.innerType._def.checks.length)) {
    if ($.target === "openApi3") return { type: D9[Q.innerType._def.typeName], nullable: true };
    return { type: [D9[Q.innerType._def.typeName], "null"] };
  }
  if ($.target === "openApi3") {
    let Y = g(Q.innerType._def, { ...$, currentPath: [...$.currentPath] });
    if (Y && "$ref" in Y) return { allOf: [Y], nullable: true };
    return Y && { ...Y, nullable: true };
  }
  let X = g(Q.innerType._def, { ...$, currentPath: [...$.currentPath, "anyOf", "0"] });
  return X && { anyOf: [X, { type: "null" }] };
}
function sW(Q, $) {
  let X = { type: "number" };
  if (!Q.checks) return X;
  for (let Y of Q.checks) switch (Y.kind) {
    case "int":
      X.type = "integer", TY(X, "type", Y.message, $);
      break;
    case "min":
      if ($.target === "jsonSchema7") if (Y.inclusive) o(X, "minimum", Y.value, Y.message, $);
      else o(X, "exclusiveMinimum", Y.value, Y.message, $);
      else {
        if (!Y.inclusive) X.exclusiveMinimum = true;
        o(X, "minimum", Y.value, Y.message, $);
      }
      break;
    case "max":
      if ($.target === "jsonSchema7") if (Y.inclusive) o(X, "maximum", Y.value, Y.message, $);
      else o(X, "exclusiveMaximum", Y.value, Y.message, $);
      else {
        if (!Y.inclusive) X.exclusiveMaximum = true;
        o(X, "maximum", Y.value, Y.message, $);
      }
      break;
    case "multipleOf":
      o(X, "multipleOf", Y.value, Y.message, $);
      break;
  }
  return X;
}
function eW(Q, $) {
  let X = $.target === "openAi", Y = { type: "object", properties: {} }, J = [], G = Q.shape();
  for (let H in G) {
    let B = G[H];
    if (B === void 0 || B._def === void 0) continue;
    let z = Dw(B);
    if (z && X) {
      if (B._def.typeName === "ZodOptional") B = B._def.innerType;
      if (!B.isNullable()) B = B.nullable();
      z = false;
    }
    let K = g(B._def, { ...$, currentPath: [...$.currentPath, "properties", H], propertyPath: [...$.currentPath, "properties", H] });
    if (K === void 0) continue;
    if (Y.properties[H] = K, !z) J.push(H);
  }
  if (J.length) Y.required = J;
  let W = Ow(Q, $);
  if (W !== void 0) Y.additionalProperties = W;
  return Y;
}
function Ow(Q, $) {
  if (Q.catchall._def.typeName !== "ZodNever") return g(Q.catchall._def, { ...$, currentPath: [...$.currentPath, "additionalProperties"] });
  switch (Q.unknownKeys) {
    case "passthrough":
      return $.allowedAdditionalProperties;
    case "strict":
      return $.rejectedAdditionalProperties;
    case "strip":
      return $.removeAdditionalStrategy === "strict" ? $.allowedAdditionalProperties : $.rejectedAdditionalProperties;
  }
}
function Dw(Q) {
  try {
    return Q.isOptional();
  } catch {
    return true;
  }
}
function X3(Q, $) {
  return g(Q.type._def, $);
}
function Y3(Q, $) {
  let Y = { type: "array", uniqueItems: true, items: g(Q.valueType._def, { ...$, currentPath: [...$.currentPath, "items"] }) };
  if (Q.minSize) o(Y, "minItems", Q.minSize.value, Q.minSize.message, $);
  if (Q.maxSize) o(Y, "maxItems", Q.maxSize.value, Q.maxSize.message, $);
  return Y;
}
function J3(Q, $) {
  if (Q.rest) return { type: "array", minItems: Q.items.length, items: Q.items.map((X, Y) => g(X._def, { ...$, currentPath: [...$.currentPath, "items", `${Y}`] })).reduce((X, Y) => Y === void 0 ? X : [...X, Y], []), additionalItems: g(Q.rest._def, { ...$, currentPath: [...$.currentPath, "additionalItems"] }) };
  else return { type: "array", minItems: Q.items.length, maxItems: Q.items.length, items: Q.items.map((X, Y) => g(X._def, { ...$, currentPath: [...$.currentPath, "items", `${Y}`] })).reduce((X, Y) => Y === void 0 ? X : [...X, Y], []) };
}
function G3(Q) {
  return { not: V0(Q) };
}
function W3(Q) {
  return V0(Q);
}
function g(Q, $, X = false) {
  let Y = $.seen.get(Q);
  if ($.override) {
    let H = $.override?.(Q, $, Y, X);
    if (H !== kW) return H;
  }
  if (Y && !X) {
    let H = ww(Y, $);
    if (H !== void 0) return H;
  }
  let J = { def: Q, path: $.currentPath, jsonSchema: void 0 };
  $.seen.set(Q, J);
  let G = B3(Q, Q.typeName, $), W = typeof G === "function" ? g(G(), $) : G;
  if (W) Mw(Q, $, W);
  if ($.postProcess) {
    let H = $.postProcess(W, Q, $);
    return J.jsonSchema = W, H;
  }
  return J.jsonSchema = W, W;
}
function Aw(Q) {
  if (!Q) return "draft-7";
  if (Q === "jsonSchema7" || Q === "draft-7") return "draft-7";
  if (Q === "jsonSchema2019-09" || Q === "draft-2020-12") return "draft-2020-12";
  return "draft-7";
}
function fY(Q, $) {
  if (t0(Q)) return HY(Q, { target: Aw($?.target), io: $?.pipeStrategy ?? "input" });
  return hY(Q, { strictUnions: $?.strictUnions ?? true, pipeStrategy: $?.pipeStrategy ?? "input" });
}
function uY(Q) {
  let X = a1(Q)?.method;
  if (!X) throw Error("Schema is missing a method literal");
  let Y = P8(X);
  if (typeof Y !== "string") throw Error("Schema method literal must be a string");
  return Y;
}
function mY(Q, $) {
  let X = t1(Q, $);
  if (!X.success) throw X.error;
  return X.data;
}
function z3(Q) {
  return Q !== null && typeof Q === "object" && !Array.isArray(Q);
}
function K3(Q, $) {
  let X = { ...Q };
  for (let Y in $) {
    let J = Y, G = $[J];
    if (G === void 0) continue;
    let W = X[J];
    if (z3(W) && z3(G)) X[J] = { ...W, ...G };
    else X[J] = G;
  }
  return X;
}
function SP() {
  let Q = new nK.default({ strict: false, validateFormats: true, validateSchema: false, allErrors: true });
  return oK.default(Q), Q;
}
function rK(Q, $, X) {
  if (!Q) throw Error(`${X} does not support task creation (required for ${$})`);
  switch ($) {
    case "tools/call":
      if (!Q.tools?.call) throw Error(`${X} does not support task creation for tools/call (required for ${$})`);
      break;
    default:
      break;
  }
}
function tK(Q, $, X) {
  if (!Q) throw Error(`${X} does not support task creation (required for ${$})`);
  switch ($) {
    case "sampling/createMessage":
      if (!Q.sampling?.createMessage) throw Error(`${X} does not support task creation for sampling/createMessage (required for ${$})`);
      break;
    case "elicitation/create":
      if (!Q.elicitation?.create) throw Error(`${X} does not support task creation for elicitation/create (required for ${$})`);
      break;
    default:
      break;
  }
}
function o7(Q) {
  return !!Q && typeof Q === "object" && sK in Q;
}
function eK(Q) {
  return Q[sK]?.complete;
}
function kP(Q) {
  let $ = [];
  if (Q.length === 0) return { isValid: false, warnings: ["Tool name cannot be empty"] };
  if (Q.length > 128) return { isValid: false, warnings: [`Tool name exceeds maximum length of 128 characters (current: ${Q.length})`] };
  if (Q.includes(" ")) $.push("Tool name contains spaces, which may cause parsing issues");
  if (Q.includes(",")) $.push("Tool name contains commas, which may cause parsing issues");
  if (Q.startsWith("-") || Q.endsWith("-")) $.push("Tool name starts or ends with a dash, which may cause parsing issues in some contexts");
  if (Q.startsWith(".") || Q.endsWith(".")) $.push("Tool name starts or ends with a dot, which may cause parsing issues in some contexts");
  if (!_P.test(Q)) {
    let X = Q.split("").filter((Y) => !/[A-Za-z0-9._-]/.test(Y)).filter((Y, J, G) => G.indexOf(Y) === J);
    return $.push(`Tool name contains invalid characters: ${X.map((Y) => `"${Y}"`).join(", ")}`, "Allowed characters are: A-Z, a-z, 0-9, underscore (_), dash (-), and dot (.)"), { isValid: false, warnings: $ };
  }
  return { isValid: true, warnings: $ };
}
function vP(Q, $) {
  if ($.length > 0) {
    console.warn(`Tool name validation warning for "${Q}":`);
    for (let X of $) console.warn(`  - ${X}`);
    console.warn("Tool registration will proceed, but this may cause compatibility issues."), console.warn("Consider updating the tool name to conform to the MCP tool naming standard."), console.warn("See SEP: Specify Format for Tool Names (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986) for more details.");
  }
}
function r7(Q) {
  let $ = kP(Q);
  return vP(Q, $.warnings), $.isValid;
}
function XV(Q) {
  return Q !== null && typeof Q === "object" && "parse" in Q && typeof Q.parse === "function" && "safeParse" in Q && typeof Q.safeParse === "function";
}
function xP(Q) {
  return "_def" in Q || "_zod" in Q || XV(Q);
}
function a7(Q) {
  if (typeof Q !== "object" || Q === null) return false;
  if (xP(Q)) return false;
  if (Object.keys(Q).length === 0) return true;
  return Object.values(Q).some(XV);
}
function QV(Q) {
  if (!Q) return;
  if (a7(Q)) return P6(Q);
  return Q;
}
function yP(Q) {
  let $ = a1(Q);
  if (!$) return [];
  return Object.entries($).map(([X, Y]) => {
    let J = pG(Y), G = dG(Y);
    return { name: X, description: J, required: !G };
  });
}
function H6(Q) {
  let X = a1(Q)?.method;
  if (!X) throw Error("Schema is missing a method literal");
  let Y = P8(X);
  if (typeof Y === "string") return Y;
  throw Error("Schema method literal must be a string");
}
function $V(Q) {
  return { completion: { values: Q.slice(0, 100), total: Q.length, hasMore: Q.length > 100 } };
}
function gP(Q, $, X, Y, J) {
  return { name: Q, description: $, inputSchema: X, handler: Y, annotations: J?.annotations };
}
function hP(Q) {
  let $ = new s7({ name: Q.name, version: Q.version ?? "1.0.0" }, { capabilities: { tools: Q.tools ? {} : void 0 } });
  if (Q.tools) Q.tools.forEach((X) => {
    $.registerTool(X.name, { description: X.description, inputSchema: X.inputSchema, annotations: X.annotations }, X.handler);
  });
  return { type: "sdk", name: Q.name, instance: $ };
}
function YV(Q) {
  let $;
  return () => $ ??= Q();
}
function uP(Q) {
  if (Q.startsWith("cc://")) {
    let Y = Q.slice(5), J = new URL(`http://${Y}`), G = J.pathname.slice(1) || void 0;
    return { serverUrl: `http://${J.host}`, authToken: G };
  }
  if (Q.startsWith("cc+unix://")) throw new P1("Unix socket connect (cc+unix://) is not supported by the SDK transport");
  let $ = /^https?:\/\//i.test(Q) ? Q : `http://${Q}`, X = new URL($);
  return { serverUrl: `${X.protocol}//${X.host}`, authToken: void 0 };
}
async function mP(Q) {
  let $ = { "content-type": "application/json" };
  if (Q.authToken) $.authorization = `Bearer ${Q.authToken}`;
  let X = {};
  if (Q.cwd) X.cwd = Q.cwd;
  if (Q.sessionKey) X.session_key = Q.sessionKey;
  if (Q.permissionMode) X.permission_mode = Q.permissionMode;
  let Y;
  try {
    Y = await fetch(`${Q.serverUrl}/sessions`, { method: "POST", headers: $, body: W0(X) });
  } catch (G) {
    throw new P1(`Failed to connect to server at ${Q.serverUrl}: ${G instanceof Error ? G.message : String(G)}`);
  }
  if (!Y.ok) {
    let G = await Y.text().catch(() => "");
    throw new P1(`Failed to create session: ${Y.status} ${Y.statusText}${G ? ` \u2014 ${G}` : ""}`);
  }
  let J = fP().safeParse(await Y.json());
  if (!J.success) throw new P1(`Invalid session response: ${J.error.message}`);
  return { sessionId: J.data.session_id, wsUrl: J.data.ws_url, workDir: J.data.work_dir };
}
async function GV(Q, $, X) {
  let Y = {};
  if (X) Y.authorization = `Bearer ${X}`;
  try {
    await fetch(`${Q}/sessions/${$}`, { method: "DELETE", headers: Y });
  } catch {
  }
}
function Ph({ prompt: Q, options: $ }) {
  let { systemPrompt: X, settings: Y, settingSources: J, sandbox: G, ...W } = $ ?? {}, H, B;
  if (X === void 0) H = "";
  else if (typeof X === "string") H = X;
  else if (X.type === "preset") B = X.append;
  let z = W.pathToClaudeCodeExecutable;
  if (!z) {
    let x6 = lP(import.meta.url), y6 = HV(x6, "..");
    z = HV(y6, "cli.js");
  }
  process.env.CLAUDE_AGENT_SDK_VERSION = "0.2.81";
  let { abortController: K = g6(), additionalDirectories: U = [], agent: q, agents: V, allowedTools: L = [], betas: F, canUseTool: w, continue: D, cwd: M, debug: R, debugFile: Z, disallowedTools: v = [], tools: O0, env: D0, executable: d0 = h6() ? "bun" : "node", executableArgs: B6 = [], extraArgs: F1 = {}, fallbackModel: z6, enableFileCheckpointing: y1, toolConfig: K6, forkSession: h, hooks: S4, includePartialMessages: gQ, onElicitation: _4, persistSession: k4, thinking: V6, effort: c9, maxThinkingTokens: v6, maxTurns: C0, maxBudgetUsd: g1, mcpServers: T6, model: BV, outputFormat: e7, permissionMode: zV = "default", allowDangerouslySkipPermissions: KV = false, permissionPromptToolName: VV, plugins: qV, workload: Q5, resume: UV, resumeSessionAt: LV, sessionId: FV, stderr: NV, strictMcpConfig: OV } = W, $5 = e7?.type === "json_schema" ? e7.schema : void 0, q6 = D0;
  if (!q6) q6 = { ...process.env };
  if (!q6.CLAUDE_CODE_ENTRYPOINT) q6.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
  if (y1) q6.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = "true";
  if (K6?.askUserQuestion?.previewFormat) q6.CLAUDE_CODE_QUESTION_PREVIEW_FORMAT = K6.askUserQuestion.previewFormat;
  if (!z) throw Error("pathToClaudeCodeExecutable is required");
  let hQ = {}, X5 = /* @__PURE__ */ new Map();
  if (T6) for (let [x6, y6] of Object.entries(T6)) if (y6.type === "sdk" && "instance" in y6) X5.set(x6, y6.instance), hQ[x6] = { type: "sdk", name: x6 };
  else hQ[x6] = y6;
  let DV = typeof Q === "string", v4;
  if (V6) switch (V6.type) {
    case "adaptive":
      v4 = { type: "adaptive" };
      break;
    case "enabled":
      v4 = { type: "enabled", budgetTokens: V6.budgetTokens };
      break;
    case "disabled":
      v4 = { type: "disabled" };
      break;
  }
  else if (v6 !== void 0) v4 = v6 === 0 ? { type: "disabled" } : { type: "enabled", budgetTokens: v6 };
  let Y5 = new y4({ abortController: K, additionalDirectories: U, agent: q, betas: F, cwd: M, debug: R, debugFile: Z, executable: d0, executableArgs: B6, extraArgs: Q5 ? { ...F1, workload: Q5 } : F1, pathToClaudeCodeExecutable: z, env: q6, forkSession: h, stderr: NV, thinkingConfig: v4, effort: c9, maxTurns: C0, maxBudgetUsd: g1, model: BV, fallbackModel: z6, jsonSchema: $5, permissionMode: zV, allowDangerouslySkipPermissions: KV, permissionPromptToolName: VV, continueConversation: D, resume: UV, resumeSessionAt: LV, sessionId: FV, settings: typeof Y === "object" ? W0(Y) : Y, settingSources: J ?? [], allowedTools: L, disallowedTools: v, tools: O0, mcpServers: hQ, strictMcpConfig: OV, canUseTool: !!w, hooks: !!S4, includePartialMessages: gQ, persistSession: k4, plugins: qV, sandbox: G, spawnClaudeCodeProcess: W.spawnClaudeCodeProcess }), wV = { systemPrompt: H, appendSystemPrompt: B, agents: V, promptSuggestions: W.promptSuggestions, agentProgressSummaries: W.agentProgressSummaries }, J5 = new h4(Y5, DV, w, S4, K, X5, $5, wV, _4);
  if (typeof Q === "string") Y5.write(W0({ type: "user", session_id: "", message: { role: "user", content: [{ type: "text", text: Q }] }, parent_tool_use_id: null }) + `
`);
  else J5.streamInput(Q);
  return J5;
}
function bh(Q) {
  return tQ(Q);
}
function Zh(Q, $) {
  return $J(Q, $);
}
async function Ch(Q, $) {
  let Y = [];
  try {
    const X = $0(Y, tQ($), 1);
    await X.send(Q);
    for await (let B of X.stream()) if (B.type === "result") return B;
    throw Error("Session ended without result message");
  } catch (J) {
    var G = J, W = 1;
  } finally {
    var H = X0(Y, G, W);
    H && await H;
  }
}
async function Sh(Q, $) {
  return HJ(Q, $);
}
async function _h(Q) {
  return zJ(Q);
}
async function kh(Q, $) {
  return KJ(Q, $);
}
async function vh(Q, $, X) {
  return qJ(Q, $, X);
}
async function Th(Q, $, X) {
  return UJ(Q, $, X);
}
async function xh(Q, $) {
  return NJ(Q, $);
}
var MV, AV, fQ, jV, RV, EV, PV, G5, P, bV, uQ, CV, SV, $0, X0, M9, oY, c, a, k1, j9, a3, X7, Y7, R9, qH, e0, AH, EH, K7, ZH, I9, b9, LQ, Z9, NQ, JB, WB, LB, MB, jB, EB, vB, xB, mB, cB, dB, nB, tB, sB, Qz, Xz, Jz, Wz, bQ, Kz, qz, Lz, Nz, Z7, C7, Ez, Zz, Sz, yz, fz, _7, pz, rz, az, ez, $K, YK, HK, zK, VK, UK, FK, DK, AK, EK, ZK, CK, x7, uK, lK, iK, kV, vV, TV, T0, xV, W5, yV, gV, f6, hV, u6, H5, fV, uV, T4, B5, lV, cV, z5, dV, iV, K5, V5, p9, rV, tV, aV, sV, q5, Qq, d9, U5, L5, Xq, Yq, F5, Gq, Wq, Hq, Bq, zq, Kq, Vq, N5, O5, i9, Fq, b1, D5, w5, Dq, wq, Mq, M5, jq, Rq, A5, Eq, j5, mQ, R5, I5, h1, Sq, _q, E5, P5, b5, Z5, C5, yq, S5, _5, k5, f1, v5, T5, x5, y5, lQ, pq, $1, p6, i6, d6, eq, m5, c5, KU, VU, iQ, OU, DU, nQ, wU, r5, t5, AU, o9, dQ, s5, PC, EU, q0, O1, SU, y4, g4, oQ, h4, vU, rQ, yU, r9, hU, fU, uU, o6, cU, JJ, pU, a9, iU, f4, nU, oU, KL, RL, i1, d, W$, I, w1, A, EL, x0, PL, Z1, OJ, l4, ZL, A0, x, F6, b0, Y8, J8, m1, t6, C, J1, DJ, p, CL, SL, _L, kL, vL, TL, xL, yL, gL, H$, hL, fL, uL, mL, lL, cL, MJ, pL, X1, c1, p1, e6, N6, c4, Q4, $4, O6, l1, M1, p4, Y1, U0, X4, C1, G8, Y4, A1, d4, i4, D6, s6, J4, G4, d1, W4, w6, G1, m0, S1, H4, B4, n4, tL, W8, o4, z4, aL, j, sL, EJ, PJ, eL, QF, bJ, $F, XF, YF, JF, GF, WF, HF, BF, zF, z$, KF, VF, qF, UF, LF, FF, NF, OF, DF, wF, MF, AF, jF, RF, IF, EF, PF, bF, ZF, CF, SF, _F, kF, vF, TF, xF, n1, H8, i, z8, L$, dF, F$, ZJ, O$, CJ, _J, kJ, V8, $9, A$, j$, R$, I$, E$, j6, P$, R6, vJ, TJ, xJ, yJ, gJ, hJ, fJ, uJ, b$, mJ, cJ, pJ, dJ, iJ, nJ, Z$, oJ, rJ, tJ, aJ, $G, XG, YG, JG, GG, WG, HG, j0, BG, C$, S$, zG, KG, VG, qG, UG, X9, LG, FG, NG, OG, DG, wG, MG, _$, jG, e, Y9, J0, v$, T$, x$, y$, g$, h$, f$, u$, m$, l$, c$, kG, vG, TG, xG, p$, d$, i$, n$, o$, r$, t$, a$, L8, s$, e$, QX, $X, XX, YX, F8, N8, JX, GX, WX, HX, BX, zX, KX, VX, qX, UX, LX, FX, NX, OX, DX, YN, JN, GN, WN, O8, r1, WY, mN, lN, W9, iG, nG, oG, rG, tG, Fk, H9, aG, sG, eG, QW, F0, JW, aN, B0, sN, $W, b8, eN, QO, $O, XO, YO, JO, GO, WO, HO, BO, zO, KO, VO, qO, UO, LO, GW, FO, NO, OO, DO, wO, AO, WW, HW, jO, RO, IO, UY, EO, PO, zW, bO, ZO, SO, KW, vO, xO, yO, VW, DY, UW, s1, S8, R0, LW, FW, Ck, mO, lO, wY, p0, B9, NW, I0, a0, s0, E0, _8, OW, MY, DW, wW, AY, z9, T, jY, MW, Sk, _k, k8, cO, v8, pO, K9, L4, AW, dO, iO, nO, oO, rO, tO, RY, aO, sO, IY, T8, eO, QD, x8, $D, V9, q9, XD, U9, F4, YD, L9, y8, g8, h8, kk, f8, u8, m8, jW, RW, IW, EY, EW, F9, N4, PW, JD, l8, GD, c8, WD, PY, HD, p8, BD, zD, KD, VD, qD, UD, LD, FD, ND, OD, d8, DD, wD, i8, bY, ZY, CY, MD, AD, jD, SY, RD, ID, ED, PD, bD, bW, n8, ZD, o8, vk, CD, O4, SD, Tk, N9, _D, _Y, kD, vD, TD, xD, yD, gD, hD, C8, fD, uD, mD, O9, kY, lD, cD, pD, dD, iD, nD, oD, rD, tD, aD, sD, eD, Qw, $w, Xw, Yw, Jw, Gw, D4, Ww, Hw, Bw, r8, zw, Kw, Vw, vY, qw, xk, yk, gk, hk, fk, uk, S, SW, kW, _W, vW, TW, t8, hW, Uw, Lw, yY, H1, Fw, D9, rW, Q3, $3, H3, B3, ww, Mw, hY, jw, lY, nK, oK, d7, i7, n7, sK, aK, _P, t7, s7, TP, l9, JV, fP, P1, WV;
var init_sdk = __esm({
  "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs"() {
    MV = Object.create;
    ({ getPrototypeOf: AV, defineProperty: fQ, getOwnPropertyNames: jV } = Object);
    RV = Object.prototype.hasOwnProperty;
    G5 = (Q, $, X) => {
      var Y = Q != null && typeof Q === "object";
      if (Y) {
        var J = $ ? EV ??= /* @__PURE__ */ new WeakMap() : PV ??= /* @__PURE__ */ new WeakMap(), G = J.get(Q);
        if (G) return G;
      }
      X = Q != null ? MV(AV(Q)) : {};
      let W = $ || !Q || !Q.__esModule ? fQ(X, "default", { value: Q, enumerable: true }) : X;
      for (let H of jV(Q)) if (!RV.call(W, H)) fQ(W, H, { get: IV.bind(Q, H), enumerable: true });
      if (Y) J.set(Q, W);
      return W;
    };
    P = (Q, $) => () => ($ || Q(($ = { exports: {} }).exports, $), $.exports);
    bV = (Q) => Q;
    uQ = (Q, $) => {
      for (var X in $) fQ(Q, X, { get: $[X], enumerable: true, configurable: true, set: ZV.bind($, X) });
    };
    CV = Symbol.dispose || Symbol.for("Symbol.dispose");
    SV = Symbol.asyncDispose || Symbol.for("Symbol.asyncDispose");
    $0 = (Q, $, X) => {
      if ($ != null) {
        if (typeof $ !== "object" && typeof $ !== "function") throw TypeError('Object expected to be assigned to "using" declaration');
        var Y;
        if (X) Y = $[SV];
        if (Y === void 0) Y = $[CV];
        if (typeof Y !== "function") throw TypeError("Object not disposable");
        Q.push([X, Y, $]);
      } else if (X) Q.push([X]);
      return $;
    };
    X0 = (Q, $, X) => {
      var Y = typeof SuppressedError === "function" ? SuppressedError : function(W, H, B, z) {
        return z = Error(B), z.name = "SuppressedError", z.error = W, z.suppressed = H, z;
      }, J = (W) => $ = X ? new Y(W, $, "An error was suppressed during disposal") : (X = true, W), G = (W) => {
        while (W = Q.pop()) try {
          var H = W[1] && W[1].call(W[2]);
          if (W[0]) return Promise.resolve(H).then(G, (B) => (J(B), G()));
        } catch (B) {
          J(B);
        }
        if (X) throw $;
      };
      return G();
    };
    M9 = P((U3) => {
      Object.defineProperty(U3, "__esModule", { value: true });
      U3.regexpCode = U3.getEsmExportName = U3.getProperty = U3.safeStringify = U3.stringify = U3.strConcat = U3.addCodeArg = U3.str = U3._ = U3.nil = U3._Code = U3.Name = U3.IDENTIFIER = U3._CodeOrName = void 0;
      class QQ {
      }
      U3._CodeOrName = QQ;
      U3.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
      class w4 extends QQ {
        constructor(Q) {
          super();
          if (!U3.IDENTIFIER.test(Q)) throw Error("CodeGen: name must be a valid identifier");
          this.str = Q;
        }
        toString() {
          return this.str;
        }
        emptyStr() {
          return false;
        }
        get names() {
          return { [this.str]: 1 };
        }
      }
      U3.Name = w4;
      class z1 extends QQ {
        constructor(Q) {
          super();
          this._items = typeof Q === "string" ? [Q] : Q;
        }
        toString() {
          return this.str;
        }
        emptyStr() {
          if (this._items.length > 1) return false;
          let Q = this._items[0];
          return Q === "" || Q === '""';
        }
        get str() {
          var Q;
          return (Q = this._str) !== null && Q !== void 0 ? Q : this._str = this._items.reduce(($, X) => `${$}${X}`, "");
        }
        get names() {
          var Q;
          return (Q = this._names) !== null && Q !== void 0 ? Q : this._names = this._items.reduce(($, X) => {
            if (X instanceof w4) $[X.str] = ($[X.str] || 0) + 1;
            return $;
          }, {});
        }
      }
      U3._Code = z1;
      U3.nil = new z1("");
      function V3(Q, ...$) {
        let X = [Q[0]], Y = 0;
        while (Y < $.length) pY(X, $[Y]), X.push(Q[++Y]);
        return new z1(X);
      }
      U3._ = V3;
      var cY = new z1("+");
      function q3(Q, ...$) {
        let X = [w9(Q[0])], Y = 0;
        while (Y < $.length) X.push(cY), pY(X, $[Y]), X.push(cY, w9(Q[++Y]));
        return Rw(X), new z1(X);
      }
      U3.str = q3;
      function pY(Q, $) {
        if ($ instanceof z1) Q.push(...$._items);
        else if ($ instanceof w4) Q.push($);
        else Q.push(Pw($));
      }
      U3.addCodeArg = pY;
      function Rw(Q) {
        let $ = 1;
        while ($ < Q.length - 1) {
          if (Q[$] === cY) {
            let X = Iw(Q[$ - 1], Q[$ + 1]);
            if (X !== void 0) {
              Q.splice($ - 1, 3, X);
              continue;
            }
            Q[$++] = "+";
          }
          $++;
        }
      }
      function Iw(Q, $) {
        if ($ === '""') return Q;
        if (Q === '""') return $;
        if (typeof Q == "string") {
          if ($ instanceof w4 || Q[Q.length - 1] !== '"') return;
          if (typeof $ != "string") return `${Q.slice(0, -1)}${$}"`;
          if ($[0] === '"') return Q.slice(0, -1) + $.slice(1);
          return;
        }
        if (typeof $ == "string" && $[0] === '"' && !(Q instanceof w4)) return `"${Q}${$.slice(1)}`;
        return;
      }
      function Ew(Q, $) {
        return $.emptyStr() ? Q : Q.emptyStr() ? $ : q3`${Q}${$}`;
      }
      U3.strConcat = Ew;
      function Pw(Q) {
        return typeof Q == "number" || typeof Q == "boolean" || Q === null ? Q : w9(Array.isArray(Q) ? Q.join(",") : Q);
      }
      function bw(Q) {
        return new z1(w9(Q));
      }
      U3.stringify = bw;
      function w9(Q) {
        return JSON.stringify(Q).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
      }
      U3.safeStringify = w9;
      function Zw(Q) {
        return typeof Q == "string" && U3.IDENTIFIER.test(Q) ? new z1(`.${Q}`) : V3`[${Q}]`;
      }
      U3.getProperty = Zw;
      function Cw(Q) {
        if (typeof Q == "string" && U3.IDENTIFIER.test(Q)) return new z1(`${Q}`);
        throw Error(`CodeGen: invalid export name: ${Q}, use explicit $id name mapping`);
      }
      U3.getEsmExportName = Cw;
      function Sw(Q) {
        return new z1(Q.toString());
      }
      U3.regexpCode = Sw;
    });
    oY = P((O3) => {
      Object.defineProperty(O3, "__esModule", { value: true });
      O3.ValueScope = O3.ValueScopeName = O3.Scope = O3.varKinds = O3.UsedValueState = void 0;
      var g0 = M9();
      class F3 extends Error {
        constructor(Q) {
          super(`CodeGen: "code" for ${Q} not defined`);
          this.value = Q.value;
        }
      }
      var XQ;
      (function(Q) {
        Q[Q.Started = 0] = "Started", Q[Q.Completed = 1] = "Completed";
      })(XQ || (O3.UsedValueState = XQ = {}));
      O3.varKinds = { const: new g0.Name("const"), let: new g0.Name("let"), var: new g0.Name("var") };
      class iY {
        constructor({ prefixes: Q, parent: $ } = {}) {
          this._names = {}, this._prefixes = Q, this._parent = $;
        }
        toName(Q) {
          return Q instanceof g0.Name ? Q : this.name(Q);
        }
        name(Q) {
          return new g0.Name(this._newName(Q));
        }
        _newName(Q) {
          let $ = this._names[Q] || this._nameGroup(Q);
          return `${Q}${$.index++}`;
        }
        _nameGroup(Q) {
          var $, X;
          if (((X = ($ = this._parent) === null || $ === void 0 ? void 0 : $._prefixes) === null || X === void 0 ? void 0 : X.has(Q)) || this._prefixes && !this._prefixes.has(Q)) throw Error(`CodeGen: prefix "${Q}" is not allowed in this scope`);
          return this._names[Q] = { prefix: Q, index: 0 };
        }
      }
      O3.Scope = iY;
      class nY extends g0.Name {
        constructor(Q, $) {
          super($);
          this.prefix = Q;
        }
        setValue(Q, { property: $, itemIndex: X }) {
          this.value = Q, this.scopePath = g0._`.${new g0.Name($)}[${X}]`;
        }
      }
      O3.ValueScopeName = nY;
      var cw = g0._`\n`;
      class N3 extends iY {
        constructor(Q) {
          super(Q);
          this._values = {}, this._scope = Q.scope, this.opts = { ...Q, _n: Q.lines ? cw : g0.nil };
        }
        get() {
          return this._scope;
        }
        name(Q) {
          return new nY(Q, this._newName(Q));
        }
        value(Q, $) {
          var X;
          if ($.ref === void 0) throw Error("CodeGen: ref must be passed in value");
          let Y = this.toName(Q), { prefix: J } = Y, G = (X = $.key) !== null && X !== void 0 ? X : $.ref, W = this._values[J];
          if (W) {
            let z = W.get(G);
            if (z) return z;
          } else W = this._values[J] = /* @__PURE__ */ new Map();
          W.set(G, Y);
          let H = this._scope[J] || (this._scope[J] = []), B = H.length;
          return H[B] = $.ref, Y.setValue($, { property: J, itemIndex: B }), Y;
        }
        getValue(Q, $) {
          let X = this._values[Q];
          if (!X) return;
          return X.get($);
        }
        scopeRefs(Q, $ = this._values) {
          return this._reduceValues($, (X) => {
            if (X.scopePath === void 0) throw Error(`CodeGen: name "${X}" has no value`);
            return g0._`${Q}${X.scopePath}`;
          });
        }
        scopeCode(Q = this._values, $, X) {
          return this._reduceValues(Q, (Y) => {
            if (Y.value === void 0) throw Error(`CodeGen: name "${Y}" has no value`);
            return Y.value.code;
          }, $, X);
        }
        _reduceValues(Q, $, X = {}, Y) {
          let J = g0.nil;
          for (let G in Q) {
            let W = Q[G];
            if (!W) continue;
            let H = X[G] = X[G] || /* @__PURE__ */ new Map();
            W.forEach((B) => {
              if (H.has(B)) return;
              H.set(B, XQ.Started);
              let z = $(B);
              if (z) {
                let K = this.opts.es5 ? O3.varKinds.var : O3.varKinds.const;
                J = g0._`${J}${K} ${B} = ${z};${this.opts._n}`;
              } else if (z = Y === null || Y === void 0 ? void 0 : Y(B)) J = g0._`${J}${z}${this.opts._n}`;
              else throw new F3(B);
              H.set(B, XQ.Completed);
            });
          }
          return J;
        }
      }
      O3.ValueScope = N3;
    });
    c = P((h0) => {
      Object.defineProperty(h0, "__esModule", { value: true });
      h0.or = h0.and = h0.not = h0.CodeGen = h0.operators = h0.varKinds = h0.ValueScopeName = h0.ValueScope = h0.Scope = h0.Name = h0.regexpCode = h0.stringify = h0.getProperty = h0.nil = h0.strConcat = h0.str = h0._ = void 0;
      var r = M9(), K1 = oY(), Q6 = M9();
      Object.defineProperty(h0, "_", { enumerable: true, get: function() {
        return Q6._;
      } });
      Object.defineProperty(h0, "str", { enumerable: true, get: function() {
        return Q6.str;
      } });
      Object.defineProperty(h0, "strConcat", { enumerable: true, get: function() {
        return Q6.strConcat;
      } });
      Object.defineProperty(h0, "nil", { enumerable: true, get: function() {
        return Q6.nil;
      } });
      Object.defineProperty(h0, "getProperty", { enumerable: true, get: function() {
        return Q6.getProperty;
      } });
      Object.defineProperty(h0, "stringify", { enumerable: true, get: function() {
        return Q6.stringify;
      } });
      Object.defineProperty(h0, "regexpCode", { enumerable: true, get: function() {
        return Q6.regexpCode;
      } });
      Object.defineProperty(h0, "Name", { enumerable: true, get: function() {
        return Q6.Name;
      } });
      var BQ = oY();
      Object.defineProperty(h0, "Scope", { enumerable: true, get: function() {
        return BQ.Scope;
      } });
      Object.defineProperty(h0, "ValueScope", { enumerable: true, get: function() {
        return BQ.ValueScope;
      } });
      Object.defineProperty(h0, "ValueScopeName", { enumerable: true, get: function() {
        return BQ.ValueScopeName;
      } });
      Object.defineProperty(h0, "varKinds", { enumerable: true, get: function() {
        return BQ.varKinds;
      } });
      h0.operators = { GT: new r._Code(">"), GTE: new r._Code(">="), LT: new r._Code("<"), LTE: new r._Code("<="), EQ: new r._Code("==="), NEQ: new r._Code("!=="), NOT: new r._Code("!"), OR: new r._Code("||"), AND: new r._Code("&&"), ADD: new r._Code("+") };
      class $6 {
        optimizeNodes() {
          return this;
        }
        optimizeNames(Q, $) {
          return this;
        }
      }
      class w3 extends $6 {
        constructor(Q, $, X) {
          super();
          this.varKind = Q, this.name = $, this.rhs = X;
        }
        render({ es5: Q, _n: $ }) {
          let X = Q ? K1.varKinds.var : this.varKind, Y = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
          return `${X} ${this.name}${Y};` + $;
        }
        optimizeNames(Q, $) {
          if (!Q[this.name.str]) return;
          if (this.rhs) this.rhs = A4(this.rhs, Q, $);
          return this;
        }
        get names() {
          return this.rhs instanceof r._CodeOrName ? this.rhs.names : {};
        }
      }
      class aY extends $6 {
        constructor(Q, $, X) {
          super();
          this.lhs = Q, this.rhs = $, this.sideEffects = X;
        }
        render({ _n: Q }) {
          return `${this.lhs} = ${this.rhs};` + Q;
        }
        optimizeNames(Q, $) {
          if (this.lhs instanceof r.Name && !Q[this.lhs.str] && !this.sideEffects) return;
          return this.rhs = A4(this.rhs, Q, $), this;
        }
        get names() {
          let Q = this.lhs instanceof r.Name ? {} : { ...this.lhs.names };
          return HQ(Q, this.rhs);
        }
      }
      class M3 extends aY {
        constructor(Q, $, X, Y) {
          super(Q, X, Y);
          this.op = $;
        }
        render({ _n: Q }) {
          return `${this.lhs} ${this.op}= ${this.rhs};` + Q;
        }
      }
      class A3 extends $6 {
        constructor(Q) {
          super();
          this.label = Q, this.names = {};
        }
        render({ _n: Q }) {
          return `${this.label}:` + Q;
        }
      }
      class j3 extends $6 {
        constructor(Q) {
          super();
          this.label = Q, this.names = {};
        }
        render({ _n: Q }) {
          return `break${this.label ? ` ${this.label}` : ""};` + Q;
        }
      }
      class R3 extends $6 {
        constructor(Q) {
          super();
          this.error = Q;
        }
        render({ _n: Q }) {
          return `throw ${this.error};` + Q;
        }
        get names() {
          return this.error.names;
        }
      }
      class I3 extends $6 {
        constructor(Q) {
          super();
          this.code = Q;
        }
        render({ _n: Q }) {
          return `${this.code};` + Q;
        }
        optimizeNodes() {
          return `${this.code}` ? this : void 0;
        }
        optimizeNames(Q, $) {
          return this.code = A4(this.code, Q, $), this;
        }
        get names() {
          return this.code instanceof r._CodeOrName ? this.code.names : {};
        }
      }
      class zQ extends $6 {
        constructor(Q = []) {
          super();
          this.nodes = Q;
        }
        render(Q) {
          return this.nodes.reduce(($, X) => $ + X.render(Q), "");
        }
        optimizeNodes() {
          let { nodes: Q } = this, $ = Q.length;
          while ($--) {
            let X = Q[$].optimizeNodes();
            if (Array.isArray(X)) Q.splice($, 1, ...X);
            else if (X) Q[$] = X;
            else Q.splice($, 1);
          }
          return Q.length > 0 ? this : void 0;
        }
        optimizeNames(Q, $) {
          let { nodes: X } = this, Y = X.length;
          while (Y--) {
            let J = X[Y];
            if (J.optimizeNames(Q, $)) continue;
            nw(Q, J.names), X.splice(Y, 1);
          }
          return X.length > 0 ? this : void 0;
        }
        get names() {
          return this.nodes.reduce((Q, $) => b6(Q, $.names), {});
        }
      }
      class X6 extends zQ {
        render(Q) {
          return "{" + Q._n + super.render(Q) + "}" + Q._n;
        }
      }
      class E3 extends zQ {
      }
      class A9 extends X6 {
      }
      A9.kind = "else";
      class _1 extends X6 {
        constructor(Q, $) {
          super($);
          this.condition = Q;
        }
        render(Q) {
          let $ = `if(${this.condition})` + super.render(Q);
          if (this.else) $ += "else " + this.else.render(Q);
          return $;
        }
        optimizeNodes() {
          super.optimizeNodes();
          let Q = this.condition;
          if (Q === true) return this.nodes;
          let $ = this.else;
          if ($) {
            let X = $.optimizeNodes();
            $ = this.else = Array.isArray(X) ? new A9(X) : X;
          }
          if ($) {
            if (Q === false) return $ instanceof _1 ? $ : $.nodes;
            if (this.nodes.length) return this;
            return new _1(S3(Q), $ instanceof _1 ? [$] : $.nodes);
          }
          if (Q === false || !this.nodes.length) return;
          return this;
        }
        optimizeNames(Q, $) {
          var X;
          if (this.else = (X = this.else) === null || X === void 0 ? void 0 : X.optimizeNames(Q, $), !(super.optimizeNames(Q, $) || this.else)) return;
          return this.condition = A4(this.condition, Q, $), this;
        }
        get names() {
          let Q = super.names;
          if (HQ(Q, this.condition), this.else) b6(Q, this.else.names);
          return Q;
        }
      }
      _1.kind = "if";
      class M4 extends X6 {
      }
      M4.kind = "for";
      class P3 extends M4 {
        constructor(Q) {
          super();
          this.iteration = Q;
        }
        render(Q) {
          return `for(${this.iteration})` + super.render(Q);
        }
        optimizeNames(Q, $) {
          if (!super.optimizeNames(Q, $)) return;
          return this.iteration = A4(this.iteration, Q, $), this;
        }
        get names() {
          return b6(super.names, this.iteration.names);
        }
      }
      class b3 extends M4 {
        constructor(Q, $, X, Y) {
          super();
          this.varKind = Q, this.name = $, this.from = X, this.to = Y;
        }
        render(Q) {
          let $ = Q.es5 ? K1.varKinds.var : this.varKind, { name: X, from: Y, to: J } = this;
          return `for(${$} ${X}=${Y}; ${X}<${J}; ${X}++)` + super.render(Q);
        }
        get names() {
          let Q = HQ(super.names, this.from);
          return HQ(Q, this.to);
        }
      }
      class rY extends M4 {
        constructor(Q, $, X, Y) {
          super();
          this.loop = Q, this.varKind = $, this.name = X, this.iterable = Y;
        }
        render(Q) {
          return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(Q);
        }
        optimizeNames(Q, $) {
          if (!super.optimizeNames(Q, $)) return;
          return this.iterable = A4(this.iterable, Q, $), this;
        }
        get names() {
          return b6(super.names, this.iterable.names);
        }
      }
      class YQ extends X6 {
        constructor(Q, $, X) {
          super();
          this.name = Q, this.args = $, this.async = X;
        }
        render(Q) {
          return `${this.async ? "async " : ""}function ${this.name}(${this.args})` + super.render(Q);
        }
      }
      YQ.kind = "func";
      class JQ extends zQ {
        render(Q) {
          return "return " + super.render(Q);
        }
      }
      JQ.kind = "return";
      class Z3 extends X6 {
        render(Q) {
          let $ = "try" + super.render(Q);
          if (this.catch) $ += this.catch.render(Q);
          if (this.finally) $ += this.finally.render(Q);
          return $;
        }
        optimizeNodes() {
          var Q, $;
          return super.optimizeNodes(), (Q = this.catch) === null || Q === void 0 || Q.optimizeNodes(), ($ = this.finally) === null || $ === void 0 || $.optimizeNodes(), this;
        }
        optimizeNames(Q, $) {
          var X, Y;
          return super.optimizeNames(Q, $), (X = this.catch) === null || X === void 0 || X.optimizeNames(Q, $), (Y = this.finally) === null || Y === void 0 || Y.optimizeNames(Q, $), this;
        }
        get names() {
          let Q = super.names;
          if (this.catch) b6(Q, this.catch.names);
          if (this.finally) b6(Q, this.finally.names);
          return Q;
        }
      }
      class GQ extends X6 {
        constructor(Q) {
          super();
          this.error = Q;
        }
        render(Q) {
          return `catch(${this.error})` + super.render(Q);
        }
      }
      GQ.kind = "catch";
      class WQ extends X6 {
        render(Q) {
          return "finally" + super.render(Q);
        }
      }
      WQ.kind = "finally";
      class C3 {
        constructor(Q, $ = {}) {
          this._values = {}, this._blockStarts = [], this._constants = {}, this.opts = { ...$, _n: $.lines ? `
` : "" }, this._extScope = Q, this._scope = new K1.Scope({ parent: Q }), this._nodes = [new E3()];
        }
        toString() {
          return this._root.render(this.opts);
        }
        name(Q) {
          return this._scope.name(Q);
        }
        scopeName(Q) {
          return this._extScope.name(Q);
        }
        scopeValue(Q, $) {
          let X = this._extScope.value(Q, $);
          return (this._values[X.prefix] || (this._values[X.prefix] = /* @__PURE__ */ new Set())).add(X), X;
        }
        getScopeValue(Q, $) {
          return this._extScope.getValue(Q, $);
        }
        scopeRefs(Q) {
          return this._extScope.scopeRefs(Q, this._values);
        }
        scopeCode() {
          return this._extScope.scopeCode(this._values);
        }
        _def(Q, $, X, Y) {
          let J = this._scope.toName($);
          if (X !== void 0 && Y) this._constants[J.str] = X;
          return this._leafNode(new w3(Q, J, X)), J;
        }
        const(Q, $, X) {
          return this._def(K1.varKinds.const, Q, $, X);
        }
        let(Q, $, X) {
          return this._def(K1.varKinds.let, Q, $, X);
        }
        var(Q, $, X) {
          return this._def(K1.varKinds.var, Q, $, X);
        }
        assign(Q, $, X) {
          return this._leafNode(new aY(Q, $, X));
        }
        add(Q, $) {
          return this._leafNode(new M3(Q, h0.operators.ADD, $));
        }
        code(Q) {
          if (typeof Q == "function") Q();
          else if (Q !== r.nil) this._leafNode(new I3(Q));
          return this;
        }
        object(...Q) {
          let $ = ["{"];
          for (let [X, Y] of Q) {
            if ($.length > 1) $.push(",");
            if ($.push(X), X !== Y || this.opts.es5) $.push(":"), (0, r.addCodeArg)($, Y);
          }
          return $.push("}"), new r._Code($);
        }
        if(Q, $, X) {
          if (this._blockNode(new _1(Q)), $ && X) this.code($).else().code(X).endIf();
          else if ($) this.code($).endIf();
          else if (X) throw Error('CodeGen: "else" body without "then" body');
          return this;
        }
        elseIf(Q) {
          return this._elseNode(new _1(Q));
        }
        else() {
          return this._elseNode(new A9());
        }
        endIf() {
          return this._endBlockNode(_1, A9);
        }
        _for(Q, $) {
          if (this._blockNode(Q), $) this.code($).endFor();
          return this;
        }
        for(Q, $) {
          return this._for(new P3(Q), $);
        }
        forRange(Q, $, X, Y, J = this.opts.es5 ? K1.varKinds.var : K1.varKinds.let) {
          let G = this._scope.toName(Q);
          return this._for(new b3(J, G, $, X), () => Y(G));
        }
        forOf(Q, $, X, Y = K1.varKinds.const) {
          let J = this._scope.toName(Q);
          if (this.opts.es5) {
            let G = $ instanceof r.Name ? $ : this.var("_arr", $);
            return this.forRange("_i", 0, r._`${G}.length`, (W) => {
              this.var(J, r._`${G}[${W}]`), X(J);
            });
          }
          return this._for(new rY("of", Y, J, $), () => X(J));
        }
        forIn(Q, $, X, Y = this.opts.es5 ? K1.varKinds.var : K1.varKinds.const) {
          if (this.opts.ownProperties) return this.forOf(Q, r._`Object.keys(${$})`, X);
          let J = this._scope.toName(Q);
          return this._for(new rY("in", Y, J, $), () => X(J));
        }
        endFor() {
          return this._endBlockNode(M4);
        }
        label(Q) {
          return this._leafNode(new A3(Q));
        }
        break(Q) {
          return this._leafNode(new j3(Q));
        }
        return(Q) {
          let $ = new JQ();
          if (this._blockNode($), this.code(Q), $.nodes.length !== 1) throw Error('CodeGen: "return" should have one node');
          return this._endBlockNode(JQ);
        }
        try(Q, $, X) {
          if (!$ && !X) throw Error('CodeGen: "try" without "catch" and "finally"');
          let Y = new Z3();
          if (this._blockNode(Y), this.code(Q), $) {
            let J = this.name("e");
            this._currNode = Y.catch = new GQ(J), $(J);
          }
          if (X) this._currNode = Y.finally = new WQ(), this.code(X);
          return this._endBlockNode(GQ, WQ);
        }
        throw(Q) {
          return this._leafNode(new R3(Q));
        }
        block(Q, $) {
          if (this._blockStarts.push(this._nodes.length), Q) this.code(Q).endBlock($);
          return this;
        }
        endBlock(Q) {
          let $ = this._blockStarts.pop();
          if ($ === void 0) throw Error("CodeGen: not in self-balancing block");
          let X = this._nodes.length - $;
          if (X < 0 || Q !== void 0 && X !== Q) throw Error(`CodeGen: wrong number of nodes: ${X} vs ${Q} expected`);
          return this._nodes.length = $, this;
        }
        func(Q, $ = r.nil, X, Y) {
          if (this._blockNode(new YQ(Q, $, X)), Y) this.code(Y).endFunc();
          return this;
        }
        endFunc() {
          return this._endBlockNode(YQ);
        }
        optimize(Q = 1) {
          while (Q-- > 0) this._root.optimizeNodes(), this._root.optimizeNames(this._root.names, this._constants);
        }
        _leafNode(Q) {
          return this._currNode.nodes.push(Q), this;
        }
        _blockNode(Q) {
          this._currNode.nodes.push(Q), this._nodes.push(Q);
        }
        _endBlockNode(Q, $) {
          let X = this._currNode;
          if (X instanceof Q || $ && X instanceof $) return this._nodes.pop(), this;
          throw Error(`CodeGen: not in block "${$ ? `${Q.kind}/${$.kind}` : Q.kind}"`);
        }
        _elseNode(Q) {
          let $ = this._currNode;
          if (!($ instanceof _1)) throw Error('CodeGen: "else" without "if"');
          return this._currNode = $.else = Q, this;
        }
        get _root() {
          return this._nodes[0];
        }
        get _currNode() {
          let Q = this._nodes;
          return Q[Q.length - 1];
        }
        set _currNode(Q) {
          let $ = this._nodes;
          $[$.length - 1] = Q;
        }
      }
      h0.CodeGen = C3;
      function b6(Q, $) {
        for (let X in $) Q[X] = (Q[X] || 0) + ($[X] || 0);
        return Q;
      }
      function HQ(Q, $) {
        return $ instanceof r._CodeOrName ? b6(Q, $.names) : Q;
      }
      function A4(Q, $, X) {
        if (Q instanceof r.Name) return Y(Q);
        if (!J(Q)) return Q;
        return new r._Code(Q._items.reduce((G, W) => {
          if (W instanceof r.Name) W = Y(W);
          if (W instanceof r._Code) G.push(...W._items);
          else G.push(W);
          return G;
        }, []));
        function Y(G) {
          let W = X[G.str];
          if (W === void 0 || $[G.str] !== 1) return G;
          return delete $[G.str], W;
        }
        function J(G) {
          return G instanceof r._Code && G._items.some((W) => W instanceof r.Name && $[W.str] === 1 && X[W.str] !== void 0);
        }
      }
      function nw(Q, $) {
        for (let X in $) Q[X] = (Q[X] || 0) - ($[X] || 0);
      }
      function S3(Q) {
        return typeof Q == "boolean" || typeof Q == "number" || Q === null ? !Q : r._`!${tY(Q)}`;
      }
      h0.not = S3;
      var ow = _3(h0.operators.AND);
      function rw(...Q) {
        return Q.reduce(ow);
      }
      h0.and = rw;
      var tw = _3(h0.operators.OR);
      function aw(...Q) {
        return Q.reduce(tw);
      }
      h0.or = aw;
      function _3(Q) {
        return ($, X) => $ === r.nil ? X : X === r.nil ? $ : r._`${tY($)} ${Q} ${tY(X)}`;
      }
      function tY(Q) {
        return Q instanceof r.Name ? Q : r._`(${Q})`;
      }
    });
    a = P((u3) => {
      Object.defineProperty(u3, "__esModule", { value: true });
      u3.checkStrictMode = u3.getErrorPath = u3.Type = u3.useFunc = u3.setEvaluated = u3.evaluatedPropsToName = u3.mergeEvaluated = u3.eachItem = u3.unescapeJsonPointer = u3.escapeJsonPointer = u3.escapeFragment = u3.unescapeFragment = u3.schemaRefOrVal = u3.schemaHasRulesButRef = u3.schemaHasRules = u3.checkUnknownRules = u3.alwaysValidSchema = u3.toHash = void 0;
      var Q0 = c(), $M = M9();
      function XM(Q) {
        let $ = {};
        for (let X of Q) $[X] = true;
        return $;
      }
      u3.toHash = XM;
      function YM(Q, $) {
        if (typeof $ == "boolean") return $;
        if (Object.keys($).length === 0) return true;
        return x3(Q, $), !y3($, Q.self.RULES.all);
      }
      u3.alwaysValidSchema = YM;
      function x3(Q, $ = Q.schema) {
        let { opts: X, self: Y } = Q;
        if (!X.strictSchema) return;
        if (typeof $ === "boolean") return;
        let J = Y.RULES.keywords;
        for (let G in $) if (!J[G]) f3(Q, `unknown keyword: "${G}"`);
      }
      u3.checkUnknownRules = x3;
      function y3(Q, $) {
        if (typeof Q == "boolean") return !Q;
        for (let X in Q) if ($[X]) return true;
        return false;
      }
      u3.schemaHasRules = y3;
      function JM(Q, $) {
        if (typeof Q == "boolean") return !Q;
        for (let X in Q) if (X !== "$ref" && $.all[X]) return true;
        return false;
      }
      u3.schemaHasRulesButRef = JM;
      function GM({ topSchemaRef: Q, schemaPath: $ }, X, Y, J) {
        if (!J) {
          if (typeof X == "number" || typeof X == "boolean") return X;
          if (typeof X == "string") return Q0._`${X}`;
        }
        return Q0._`${Q}${$}${(0, Q0.getProperty)(Y)}`;
      }
      u3.schemaRefOrVal = GM;
      function WM(Q) {
        return g3(decodeURIComponent(Q));
      }
      u3.unescapeFragment = WM;
      function HM(Q) {
        return encodeURIComponent(eY(Q));
      }
      u3.escapeFragment = HM;
      function eY(Q) {
        if (typeof Q == "number") return `${Q}`;
        return Q.replace(/~/g, "~0").replace(/\//g, "~1");
      }
      u3.escapeJsonPointer = eY;
      function g3(Q) {
        return Q.replace(/~1/g, "/").replace(/~0/g, "~");
      }
      u3.unescapeJsonPointer = g3;
      function BM(Q, $) {
        if (Array.isArray(Q)) for (let X of Q) $(X);
        else $(Q);
      }
      u3.eachItem = BM;
      function v3({ mergeNames: Q, mergeToName: $, mergeValues: X, resultToName: Y }) {
        return (J, G, W, H) => {
          let B = W === void 0 ? G : W instanceof Q0.Name ? (G instanceof Q0.Name ? Q(J, G, W) : $(J, G, W), W) : G instanceof Q0.Name ? ($(J, W, G), G) : X(G, W);
          return H === Q0.Name && !(B instanceof Q0.Name) ? Y(J, B) : B;
        };
      }
      u3.mergeEvaluated = { props: v3({ mergeNames: (Q, $, X) => Q.if(Q0._`${X} !== true && ${$} !== undefined`, () => {
        Q.if(Q0._`${$} === true`, () => Q.assign(X, true), () => Q.assign(X, Q0._`${X} || {}`).code(Q0._`Object.assign(${X}, ${$})`));
      }), mergeToName: (Q, $, X) => Q.if(Q0._`${X} !== true`, () => {
        if ($ === true) Q.assign(X, true);
        else Q.assign(X, Q0._`${X} || {}`), Q7(Q, X, $);
      }), mergeValues: (Q, $) => Q === true ? true : { ...Q, ...$ }, resultToName: h3 }), items: v3({ mergeNames: (Q, $, X) => Q.if(Q0._`${X} !== true && ${$} !== undefined`, () => Q.assign(X, Q0._`${$} === true ? true : ${X} > ${$} ? ${X} : ${$}`)), mergeToName: (Q, $, X) => Q.if(Q0._`${X} !== true`, () => Q.assign(X, $ === true ? true : Q0._`${X} > ${$} ? ${X} : ${$}`)), mergeValues: (Q, $) => Q === true ? true : Math.max(Q, $), resultToName: (Q, $) => Q.var("items", $) }) };
      function h3(Q, $) {
        if ($ === true) return Q.var("props", true);
        let X = Q.var("props", Q0._`{}`);
        if ($ !== void 0) Q7(Q, X, $);
        return X;
      }
      u3.evaluatedPropsToName = h3;
      function Q7(Q, $, X) {
        Object.keys(X).forEach((Y) => Q.assign(Q0._`${$}${(0, Q0.getProperty)(Y)}`, true));
      }
      u3.setEvaluated = Q7;
      var T3 = {};
      function zM(Q, $) {
        return Q.scopeValue("func", { ref: $, code: T3[$.code] || (T3[$.code] = new $M._Code($.code)) });
      }
      u3.useFunc = zM;
      var sY;
      (function(Q) {
        Q[Q.Num = 0] = "Num", Q[Q.Str = 1] = "Str";
      })(sY || (u3.Type = sY = {}));
      function KM(Q, $, X) {
        if (Q instanceof Q0.Name) {
          let Y = $ === sY.Num;
          return X ? Y ? Q0._`"[" + ${Q} + "]"` : Q0._`"['" + ${Q} + "']"` : Y ? Q0._`"/" + ${Q}` : Q0._`"/" + ${Q}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
        }
        return X ? (0, Q0.getProperty)(Q).toString() : "/" + eY(Q);
      }
      u3.getErrorPath = KM;
      function f3(Q, $, X = Q.opts.strictSchema) {
        if (!X) return;
        if ($ = `strict mode: ${$}`, X === true) throw Error($);
        Q.self.logger.warn($);
      }
      u3.checkStrictMode = f3;
    });
    k1 = P((l3) => {
      Object.defineProperty(l3, "__esModule", { value: true });
      var Z0 = c(), ZM = { data: new Z0.Name("data"), valCxt: new Z0.Name("valCxt"), instancePath: new Z0.Name("instancePath"), parentData: new Z0.Name("parentData"), parentDataProperty: new Z0.Name("parentDataProperty"), rootData: new Z0.Name("rootData"), dynamicAnchors: new Z0.Name("dynamicAnchors"), vErrors: new Z0.Name("vErrors"), errors: new Z0.Name("errors"), this: new Z0.Name("this"), self: new Z0.Name("self"), scope: new Z0.Name("scope"), json: new Z0.Name("json"), jsonPos: new Z0.Name("jsonPos"), jsonLen: new Z0.Name("jsonLen"), jsonPart: new Z0.Name("jsonPart") };
      l3.default = ZM;
    });
    j9 = P((i3) => {
      Object.defineProperty(i3, "__esModule", { value: true });
      i3.extendErrors = i3.resetErrorsCount = i3.reportExtraError = i3.reportError = i3.keyword$DataError = i3.keywordError = void 0;
      var t = c(), VQ = a(), k0 = k1();
      i3.keywordError = { message: ({ keyword: Q }) => t.str`must pass "${Q}" keyword validation` };
      i3.keyword$DataError = { message: ({ keyword: Q, schemaType: $ }) => $ ? t.str`"${Q}" keyword must be ${$} ($data)` : t.str`"${Q}" keyword is invalid ($data)` };
      function SM(Q, $ = i3.keywordError, X, Y) {
        let { it: J } = Q, { gen: G, compositeRule: W, allErrors: H } = J, B = d3(Q, $, X);
        if (Y !== null && Y !== void 0 ? Y : W || H) c3(G, B);
        else p3(J, t._`[${B}]`);
      }
      i3.reportError = SM;
      function _M(Q, $ = i3.keywordError, X) {
        let { it: Y } = Q, { gen: J, compositeRule: G, allErrors: W } = Y, H = d3(Q, $, X);
        if (c3(J, H), !(G || W)) p3(Y, k0.default.vErrors);
      }
      i3.reportExtraError = _M;
      function kM(Q, $) {
        Q.assign(k0.default.errors, $), Q.if(t._`${k0.default.vErrors} !== null`, () => Q.if($, () => Q.assign(t._`${k0.default.vErrors}.length`, $), () => Q.assign(k0.default.vErrors, null)));
      }
      i3.resetErrorsCount = kM;
      function vM({ gen: Q, keyword: $, schemaValue: X, data: Y, errsCount: J, it: G }) {
        if (J === void 0) throw Error("ajv implementation error");
        let W = Q.name("err");
        Q.forRange("i", J, k0.default.errors, (H) => {
          if (Q.const(W, t._`${k0.default.vErrors}[${H}]`), Q.if(t._`${W}.instancePath === undefined`, () => Q.assign(t._`${W}.instancePath`, (0, t.strConcat)(k0.default.instancePath, G.errorPath))), Q.assign(t._`${W}.schemaPath`, t.str`${G.errSchemaPath}/${$}`), G.opts.verbose) Q.assign(t._`${W}.schema`, X), Q.assign(t._`${W}.data`, Y);
        });
      }
      i3.extendErrors = vM;
      function c3(Q, $) {
        let X = Q.const("err", $);
        Q.if(t._`${k0.default.vErrors} === null`, () => Q.assign(k0.default.vErrors, t._`[${X}]`), t._`${k0.default.vErrors}.push(${X})`), Q.code(t._`${k0.default.errors}++`);
      }
      function p3(Q, $) {
        let { gen: X, validateName: Y, schemaEnv: J } = Q;
        if (J.$async) X.throw(t._`new ${Q.ValidationError}(${$})`);
        else X.assign(t._`${Y}.errors`, $), X.return(false);
      }
      var Z6 = { keyword: new t.Name("keyword"), schemaPath: new t.Name("schemaPath"), params: new t.Name("params"), propertyName: new t.Name("propertyName"), message: new t.Name("message"), schema: new t.Name("schema"), parentSchema: new t.Name("parentSchema") };
      function d3(Q, $, X) {
        let { createErrors: Y } = Q.it;
        if (Y === false) return t._`{}`;
        return TM(Q, $, X);
      }
      function TM(Q, $, X = {}) {
        let { gen: Y, it: J } = Q, G = [xM(J, X), yM(Q, X)];
        return gM(Q, $, G), Y.object(...G);
      }
      function xM({ errorPath: Q }, { instancePath: $ }) {
        let X = $ ? t.str`${Q}${(0, VQ.getErrorPath)($, VQ.Type.Str)}` : Q;
        return [k0.default.instancePath, (0, t.strConcat)(k0.default.instancePath, X)];
      }
      function yM({ keyword: Q, it: { errSchemaPath: $ } }, { schemaPath: X, parentSchema: Y }) {
        let J = Y ? $ : t.str`${$}/${Q}`;
        if (X) J = t.str`${J}${(0, VQ.getErrorPath)(X, VQ.Type.Str)}`;
        return [Z6.schemaPath, J];
      }
      function gM(Q, { params: $, message: X }, Y) {
        let { keyword: J, data: G, schemaValue: W, it: H } = Q, { opts: B, propertyName: z, topSchemaRef: K, schemaPath: U } = H;
        if (Y.push([Z6.keyword, J], [Z6.params, typeof $ == "function" ? $(Q) : $ || t._`{}`]), B.messages) Y.push([Z6.message, typeof X == "function" ? X(Q) : X]);
        if (B.verbose) Y.push([Z6.schema, W], [Z6.parentSchema, t._`${K}${U}`], [k0.default.data, G]);
        if (z) Y.push([Z6.propertyName, z]);
      }
    });
    a3 = P((r3) => {
      Object.defineProperty(r3, "__esModule", { value: true });
      r3.boolOrEmptySchema = r3.topBoolOrEmptySchema = void 0;
      var lM = j9(), cM = c(), pM = k1(), dM = { message: "boolean schema is false" };
      function iM(Q) {
        let { gen: $, schema: X, validateName: Y } = Q;
        if (X === false) o3(Q, false);
        else if (typeof X == "object" && X.$async === true) $.return(pM.default.data);
        else $.assign(cM._`${Y}.errors`, null), $.return(true);
      }
      r3.topBoolOrEmptySchema = iM;
      function nM(Q, $) {
        let { gen: X, schema: Y } = Q;
        if (Y === false) X.var($, false), o3(Q);
        else X.var($, true);
      }
      r3.boolOrEmptySchema = nM;
      function o3(Q, $) {
        let { gen: X, data: Y } = Q, J = { gen: X, keyword: "false schema", data: Y, schema: false, schemaCode: false, schemaValue: false, params: {}, it: Q };
        (0, lM.reportError)(J, dM, void 0, $);
      }
    });
    X7 = P((s3) => {
      Object.defineProperty(s3, "__esModule", { value: true });
      s3.getRules = s3.isJSONType = void 0;
      var rM = ["string", "number", "integer", "boolean", "null", "object", "array"], tM = new Set(rM);
      function aM(Q) {
        return typeof Q == "string" && tM.has(Q);
      }
      s3.isJSONType = aM;
      function sM() {
        let Q = { number: { type: "number", rules: [] }, string: { type: "string", rules: [] }, array: { type: "array", rules: [] }, object: { type: "object", rules: [] } };
        return { types: { ...Q, integer: true, boolean: true, null: true }, rules: [{ rules: [] }, Q.number, Q.string, Q.array, Q.object], post: { rules: [] }, all: {}, keywords: {} };
      }
      s3.getRules = sM;
    });
    Y7 = P((XH) => {
      Object.defineProperty(XH, "__esModule", { value: true });
      XH.shouldUseRule = XH.shouldUseGroup = XH.schemaHasRulesForType = void 0;
      function QA({ schema: Q, self: $ }, X) {
        let Y = $.RULES.types[X];
        return Y && Y !== true && QH(Q, Y);
      }
      XH.schemaHasRulesForType = QA;
      function QH(Q, $) {
        return $.rules.some((X) => $H(Q, X));
      }
      XH.shouldUseGroup = QH;
      function $H(Q, $) {
        var X;
        return Q[$.keyword] !== void 0 || ((X = $.definition.implements) === null || X === void 0 ? void 0 : X.some((Y) => Q[Y] !== void 0));
      }
      XH.shouldUseRule = $H;
    });
    R9 = P((HH) => {
      Object.defineProperty(HH, "__esModule", { value: true });
      HH.reportTypeError = HH.checkDataTypes = HH.checkDataType = HH.coerceAndCheckDataType = HH.getJSONTypes = HH.getSchemaTypes = HH.DataType = void 0;
      var YA = X7(), JA = Y7(), GA = j9(), l = c(), JH = a(), j4;
      (function(Q) {
        Q[Q.Correct = 0] = "Correct", Q[Q.Wrong = 1] = "Wrong";
      })(j4 || (HH.DataType = j4 = {}));
      function WA(Q) {
        let $ = GH(Q.type);
        if ($.includes("null")) {
          if (Q.nullable === false) throw Error("type: null contradicts nullable: false");
        } else {
          if (!$.length && Q.nullable !== void 0) throw Error('"nullable" cannot be used without "type"');
          if (Q.nullable === true) $.push("null");
        }
        return $;
      }
      HH.getSchemaTypes = WA;
      function GH(Q) {
        let $ = Array.isArray(Q) ? Q : Q ? [Q] : [];
        if ($.every(YA.isJSONType)) return $;
        throw Error("type must be JSONType or JSONType[]: " + $.join(","));
      }
      HH.getJSONTypes = GH;
      function HA(Q, $) {
        let { gen: X, data: Y, opts: J } = Q, G = BA($, J.coerceTypes), W = $.length > 0 && !(G.length === 0 && $.length === 1 && (0, JA.schemaHasRulesForType)(Q, $[0]));
        if (W) {
          let H = G7($, Y, J.strictNumbers, j4.Wrong);
          X.if(H, () => {
            if (G.length) zA(Q, $, G);
            else W7(Q);
          });
        }
        return W;
      }
      HH.coerceAndCheckDataType = HA;
      var WH = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
      function BA(Q, $) {
        return $ ? Q.filter((X) => WH.has(X) || $ === "array" && X === "array") : [];
      }
      function zA(Q, $, X) {
        let { gen: Y, data: J, opts: G } = Q, W = Y.let("dataType", l._`typeof ${J}`), H = Y.let("coerced", l._`undefined`);
        if (G.coerceTypes === "array") Y.if(l._`${W} == 'object' && Array.isArray(${J}) && ${J}.length == 1`, () => Y.assign(J, l._`${J}[0]`).assign(W, l._`typeof ${J}`).if(G7($, J, G.strictNumbers), () => Y.assign(H, J)));
        Y.if(l._`${H} !== undefined`);
        for (let z of X) if (WH.has(z) || z === "array" && G.coerceTypes === "array") B(z);
        Y.else(), W7(Q), Y.endIf(), Y.if(l._`${H} !== undefined`, () => {
          Y.assign(J, H), KA(Q, H);
        });
        function B(z) {
          switch (z) {
            case "string":
              Y.elseIf(l._`${W} == "number" || ${W} == "boolean"`).assign(H, l._`"" + ${J}`).elseIf(l._`${J} === null`).assign(H, l._`""`);
              return;
            case "number":
              Y.elseIf(l._`${W} == "boolean" || ${J} === null
              || (${W} == "string" && ${J} && ${J} == +${J})`).assign(H, l._`+${J}`);
              return;
            case "integer":
              Y.elseIf(l._`${W} === "boolean" || ${J} === null
              || (${W} === "string" && ${J} && ${J} == +${J} && !(${J} % 1))`).assign(H, l._`+${J}`);
              return;
            case "boolean":
              Y.elseIf(l._`${J} === "false" || ${J} === 0 || ${J} === null`).assign(H, false).elseIf(l._`${J} === "true" || ${J} === 1`).assign(H, true);
              return;
            case "null":
              Y.elseIf(l._`${J} === "" || ${J} === 0 || ${J} === false`), Y.assign(H, null);
              return;
            case "array":
              Y.elseIf(l._`${W} === "string" || ${W} === "number"
              || ${W} === "boolean" || ${J} === null`).assign(H, l._`[${J}]`);
          }
        }
      }
      function KA({ gen: Q, parentData: $, parentDataProperty: X }, Y) {
        Q.if(l._`${$} !== undefined`, () => Q.assign(l._`${$}[${X}]`, Y));
      }
      function J7(Q, $, X, Y = j4.Correct) {
        let J = Y === j4.Correct ? l.operators.EQ : l.operators.NEQ, G;
        switch (Q) {
          case "null":
            return l._`${$} ${J} null`;
          case "array":
            G = l._`Array.isArray(${$})`;
            break;
          case "object":
            G = l._`${$} && typeof ${$} == "object" && !Array.isArray(${$})`;
            break;
          case "integer":
            G = W(l._`!(${$} % 1) && !isNaN(${$})`);
            break;
          case "number":
            G = W();
            break;
          default:
            return l._`typeof ${$} ${J} ${Q}`;
        }
        return Y === j4.Correct ? G : (0, l.not)(G);
        function W(H = l.nil) {
          return (0, l.and)(l._`typeof ${$} == "number"`, H, X ? l._`isFinite(${$})` : l.nil);
        }
      }
      HH.checkDataType = J7;
      function G7(Q, $, X, Y) {
        if (Q.length === 1) return J7(Q[0], $, X, Y);
        let J, G = (0, JH.toHash)(Q);
        if (G.array && G.object) {
          let W = l._`typeof ${$} != "object"`;
          J = G.null ? W : l._`!${$} || ${W}`, delete G.null, delete G.array, delete G.object;
        } else J = l.nil;
        if (G.number) delete G.integer;
        for (let W in G) J = (0, l.and)(J, J7(W, $, X, Y));
        return J;
      }
      HH.checkDataTypes = G7;
      var VA = { message: ({ schema: Q }) => `must be ${Q}`, params: ({ schema: Q, schemaValue: $ }) => typeof Q == "string" ? l._`{type: ${Q}}` : l._`{type: ${$}}` };
      function W7(Q) {
        let $ = qA(Q);
        (0, GA.reportError)($, VA);
      }
      HH.reportTypeError = W7;
      function qA(Q) {
        let { gen: $, data: X, schema: Y } = Q, J = (0, JH.schemaRefOrVal)(Q, Y, "type");
        return { gen: $, keyword: "type", data: X, schema: Y.type, schemaCode: J, schemaValue: J, parentSchema: Y, params: {}, it: Q };
      }
    });
    qH = P((KH) => {
      Object.defineProperty(KH, "__esModule", { value: true });
      KH.assignDefaults = void 0;
      var R4 = c(), wA = a();
      function MA(Q, $) {
        let { properties: X, items: Y } = Q.schema;
        if ($ === "object" && X) for (let J in X) zH(Q, J, X[J].default);
        else if ($ === "array" && Array.isArray(Y)) Y.forEach((J, G) => zH(Q, G, J.default));
      }
      KH.assignDefaults = MA;
      function zH(Q, $, X) {
        let { gen: Y, compositeRule: J, data: G, opts: W } = Q;
        if (X === void 0) return;
        let H = R4._`${G}${(0, R4.getProperty)($)}`;
        if (J) {
          (0, wA.checkStrictMode)(Q, `default is ignored for: ${H}`);
          return;
        }
        let B = R4._`${H} === undefined`;
        if (W.useDefaults === "empty") B = R4._`${B} || ${H} === null || ${H} === ""`;
        Y.if(B, R4._`${H} = ${(0, R4.stringify)(X)}`);
      }
    });
    e0 = P((FH) => {
      Object.defineProperty(FH, "__esModule", { value: true });
      FH.validateUnion = FH.validateArray = FH.usePattern = FH.callValidateCode = FH.schemaProperties = FH.allSchemaProperties = FH.noPropertyInData = FH.propertyInData = FH.isOwnProperty = FH.hasPropFunc = FH.reportMissingProp = FH.checkMissingProp = FH.checkReportMissingProp = void 0;
      var H0 = c(), H7 = a(), Y6 = k1(), AA = a();
      function jA(Q, $) {
        let { gen: X, data: Y, it: J } = Q;
        X.if(z7(X, Y, $, J.opts.ownProperties), () => {
          Q.setParams({ missingProperty: H0._`${$}` }, true), Q.error();
        });
      }
      FH.checkReportMissingProp = jA;
      function RA({ gen: Q, data: $, it: { opts: X } }, Y, J) {
        return (0, H0.or)(...Y.map((G) => (0, H0.and)(z7(Q, $, G, X.ownProperties), H0._`${J} = ${G}`)));
      }
      FH.checkMissingProp = RA;
      function IA(Q, $) {
        Q.setParams({ missingProperty: $ }, true), Q.error();
      }
      FH.reportMissingProp = IA;
      function UH(Q) {
        return Q.scopeValue("func", { ref: Object.prototype.hasOwnProperty, code: H0._`Object.prototype.hasOwnProperty` });
      }
      FH.hasPropFunc = UH;
      function B7(Q, $, X) {
        return H0._`${UH(Q)}.call(${$}, ${X})`;
      }
      FH.isOwnProperty = B7;
      function EA(Q, $, X, Y) {
        let J = H0._`${$}${(0, H0.getProperty)(X)} !== undefined`;
        return Y ? H0._`${J} && ${B7(Q, $, X)}` : J;
      }
      FH.propertyInData = EA;
      function z7(Q, $, X, Y) {
        let J = H0._`${$}${(0, H0.getProperty)(X)} === undefined`;
        return Y ? (0, H0.or)(J, (0, H0.not)(B7(Q, $, X))) : J;
      }
      FH.noPropertyInData = z7;
      function LH(Q) {
        return Q ? Object.keys(Q).filter(($) => $ !== "__proto__") : [];
      }
      FH.allSchemaProperties = LH;
      function PA(Q, $) {
        return LH($).filter((X) => !(0, H7.alwaysValidSchema)(Q, $[X]));
      }
      FH.schemaProperties = PA;
      function bA({ schemaCode: Q, data: $, it: { gen: X, topSchemaRef: Y, schemaPath: J, errorPath: G }, it: W }, H, B, z) {
        let K = z ? H0._`${Q}, ${$}, ${Y}${J}` : $, U = [[Y6.default.instancePath, (0, H0.strConcat)(Y6.default.instancePath, G)], [Y6.default.parentData, W.parentData], [Y6.default.parentDataProperty, W.parentDataProperty], [Y6.default.rootData, Y6.default.rootData]];
        if (W.opts.dynamicRef) U.push([Y6.default.dynamicAnchors, Y6.default.dynamicAnchors]);
        let q = H0._`${K}, ${X.object(...U)}`;
        return B !== H0.nil ? H0._`${H}.call(${B}, ${q})` : H0._`${H}(${q})`;
      }
      FH.callValidateCode = bA;
      var ZA = H0._`new RegExp`;
      function CA({ gen: Q, it: { opts: $ } }, X) {
        let Y = $.unicodeRegExp ? "u" : "", { regExp: J } = $.code, G = J(X, Y);
        return Q.scopeValue("pattern", { key: G.toString(), ref: G, code: H0._`${J.code === "new RegExp" ? ZA : (0, AA.useFunc)(Q, J)}(${X}, ${Y})` });
      }
      FH.usePattern = CA;
      function SA(Q) {
        let { gen: $, data: X, keyword: Y, it: J } = Q, G = $.name("valid");
        if (J.allErrors) {
          let H = $.let("valid", true);
          return W(() => $.assign(H, false)), H;
        }
        return $.var(G, true), W(() => $.break()), G;
        function W(H) {
          let B = $.const("len", H0._`${X}.length`);
          $.forRange("i", 0, B, (z) => {
            Q.subschema({ keyword: Y, dataProp: z, dataPropType: H7.Type.Num }, G), $.if((0, H0.not)(G), H);
          });
        }
      }
      FH.validateArray = SA;
      function _A(Q) {
        let { gen: $, schema: X, keyword: Y, it: J } = Q;
        if (!Array.isArray(X)) throw Error("ajv implementation error");
        if (X.some((B) => (0, H7.alwaysValidSchema)(J, B)) && !J.opts.unevaluated) return;
        let W = $.let("valid", false), H = $.name("_valid");
        $.block(() => X.forEach((B, z) => {
          let K = Q.subschema({ keyword: Y, schemaProp: z, compositeRule: true }, H);
          if ($.assign(W, H0._`${W} || ${H}`), !Q.mergeValidEvaluated(K, H)) $.if((0, H0.not)(W));
        })), Q.result(W, () => Q.reset(), () => Q.error(true));
      }
      FH.validateUnion = _A;
    });
    AH = P((wH) => {
      Object.defineProperty(wH, "__esModule", { value: true });
      wH.validateKeywordUsage = wH.validSchemaType = wH.funcKeywordCode = wH.macroKeywordCode = void 0;
      var v0 = c(), C6 = k1(), pA = e0(), dA = j9();
      function iA(Q, $) {
        let { gen: X, keyword: Y, schema: J, parentSchema: G, it: W } = Q, H = $.macro.call(W.self, J, G, W), B = DH(X, Y, H);
        if (W.opts.validateSchema !== false) W.self.validateSchema(H, true);
        let z = X.name("valid");
        Q.subschema({ schema: H, schemaPath: v0.nil, errSchemaPath: `${W.errSchemaPath}/${Y}`, topSchemaRef: B, compositeRule: true }, z), Q.pass(z, () => Q.error(true));
      }
      wH.macroKeywordCode = iA;
      function nA(Q, $) {
        var X;
        let { gen: Y, keyword: J, schema: G, parentSchema: W, $data: H, it: B } = Q;
        rA(B, $);
        let z = !H && $.compile ? $.compile.call(B.self, G, W, B) : $.validate, K = DH(Y, J, z), U = Y.let("valid");
        Q.block$data(U, q), Q.ok((X = $.valid) !== null && X !== void 0 ? X : U);
        function q() {
          if ($.errors === false) {
            if (F(), $.modifying) OH(Q);
            w(() => Q.error());
          } else {
            let D = $.async ? V() : L();
            if ($.modifying) OH(Q);
            w(() => oA(Q, D));
          }
        }
        function V() {
          let D = Y.let("ruleErrs", null);
          return Y.try(() => F(v0._`await `), (M) => Y.assign(U, false).if(v0._`${M} instanceof ${B.ValidationError}`, () => Y.assign(D, v0._`${M}.errors`), () => Y.throw(M))), D;
        }
        function L() {
          let D = v0._`${K}.errors`;
          return Y.assign(D, null), F(v0.nil), D;
        }
        function F(D = $.async ? v0._`await ` : v0.nil) {
          let M = B.opts.passContext ? C6.default.this : C6.default.self, R = !("compile" in $ && !H || $.schema === false);
          Y.assign(U, v0._`${D}${(0, pA.callValidateCode)(Q, K, M, R)}`, $.modifying);
        }
        function w(D) {
          var M;
          Y.if((0, v0.not)((M = $.valid) !== null && M !== void 0 ? M : U), D);
        }
      }
      wH.funcKeywordCode = nA;
      function OH(Q) {
        let { gen: $, data: X, it: Y } = Q;
        $.if(Y.parentData, () => $.assign(X, v0._`${Y.parentData}[${Y.parentDataProperty}]`));
      }
      function oA(Q, $) {
        let { gen: X } = Q;
        X.if(v0._`Array.isArray(${$})`, () => {
          X.assign(C6.default.vErrors, v0._`${C6.default.vErrors} === null ? ${$} : ${C6.default.vErrors}.concat(${$})`).assign(C6.default.errors, v0._`${C6.default.vErrors}.length`), (0, dA.extendErrors)(Q);
        }, () => Q.error());
      }
      function rA({ schemaEnv: Q }, $) {
        if ($.async && !Q.$async) throw Error("async keyword in sync schema");
      }
      function DH(Q, $, X) {
        if (X === void 0) throw Error(`keyword "${$}" failed to compile`);
        return Q.scopeValue("keyword", typeof X == "function" ? { ref: X } : { ref: X, code: (0, v0.stringify)(X) });
      }
      function tA(Q, $, X = false) {
        return !$.length || $.some((Y) => Y === "array" ? Array.isArray(Q) : Y === "object" ? Q && typeof Q == "object" && !Array.isArray(Q) : typeof Q == Y || X && typeof Q > "u");
      }
      wH.validSchemaType = tA;
      function aA({ schema: Q, opts: $, self: X, errSchemaPath: Y }, J, G) {
        if (Array.isArray(J.keyword) ? !J.keyword.includes(G) : J.keyword !== G) throw Error("ajv implementation error");
        let W = J.dependencies;
        if (W === null || W === void 0 ? void 0 : W.some((H) => !Object.prototype.hasOwnProperty.call(Q, H))) throw Error(`parent schema must have dependencies of ${G}: ${W.join(",")}`);
        if (J.validateSchema) {
          if (!J.validateSchema(Q[G])) {
            let B = `keyword "${G}" value is invalid at path "${Y}": ` + X.errorsText(J.validateSchema.errors);
            if ($.validateSchema === "log") X.logger.error(B);
            else throw Error(B);
          }
        }
      }
      wH.validateKeywordUsage = aA;
    });
    EH = P((RH) => {
      Object.defineProperty(RH, "__esModule", { value: true });
      RH.extendSubschemaMode = RH.extendSubschemaData = RH.getSubschema = void 0;
      var R1 = c(), jH = a();
      function $j(Q, { keyword: $, schemaProp: X, schema: Y, schemaPath: J, errSchemaPath: G, topSchemaRef: W }) {
        if ($ !== void 0 && Y !== void 0) throw Error('both "keyword" and "schema" passed, only one allowed');
        if ($ !== void 0) {
          let H = Q.schema[$];
          return X === void 0 ? { schema: H, schemaPath: R1._`${Q.schemaPath}${(0, R1.getProperty)($)}`, errSchemaPath: `${Q.errSchemaPath}/${$}` } : { schema: H[X], schemaPath: R1._`${Q.schemaPath}${(0, R1.getProperty)($)}${(0, R1.getProperty)(X)}`, errSchemaPath: `${Q.errSchemaPath}/${$}/${(0, jH.escapeFragment)(X)}` };
        }
        if (Y !== void 0) {
          if (J === void 0 || G === void 0 || W === void 0) throw Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
          return { schema: Y, schemaPath: J, topSchemaRef: W, errSchemaPath: G };
        }
        throw Error('either "keyword" or "schema" must be passed');
      }
      RH.getSubschema = $j;
      function Xj(Q, $, { dataProp: X, dataPropType: Y, data: J, dataTypes: G, propertyName: W }) {
        if (J !== void 0 && X !== void 0) throw Error('both "data" and "dataProp" passed, only one allowed');
        let { gen: H } = $;
        if (X !== void 0) {
          let { errorPath: z, dataPathArr: K, opts: U } = $, q = H.let("data", R1._`${$.data}${(0, R1.getProperty)(X)}`, true);
          B(q), Q.errorPath = R1.str`${z}${(0, jH.getErrorPath)(X, Y, U.jsPropertySyntax)}`, Q.parentDataProperty = R1._`${X}`, Q.dataPathArr = [...K, Q.parentDataProperty];
        }
        if (J !== void 0) {
          let z = J instanceof R1.Name ? J : H.let("data", J, true);
          if (B(z), W !== void 0) Q.propertyName = W;
        }
        if (G) Q.dataTypes = G;
        function B(z) {
          Q.data = z, Q.dataLevel = $.dataLevel + 1, Q.dataTypes = [], $.definedProperties = /* @__PURE__ */ new Set(), Q.parentData = $.data, Q.dataNames = [...$.dataNames, z];
        }
      }
      RH.extendSubschemaData = Xj;
      function Yj(Q, { jtdDiscriminator: $, jtdMetadata: X, compositeRule: Y, createErrors: J, allErrors: G }) {
        if (Y !== void 0) Q.compositeRule = Y;
        if (J !== void 0) Q.createErrors = J;
        if (G !== void 0) Q.allErrors = G;
        Q.jtdDiscriminator = $, Q.jtdMetadata = X;
      }
      RH.extendSubschemaMode = Yj;
    });
    K7 = P((Ly, PH) => {
      PH.exports = function Q($, X) {
        if ($ === X) return true;
        if ($ && X && typeof $ == "object" && typeof X == "object") {
          if ($.constructor !== X.constructor) return false;
          var Y, J, G;
          if (Array.isArray($)) {
            if (Y = $.length, Y != X.length) return false;
            for (J = Y; J-- !== 0; ) if (!Q($[J], X[J])) return false;
            return true;
          }
          if ($.constructor === RegExp) return $.source === X.source && $.flags === X.flags;
          if ($.valueOf !== Object.prototype.valueOf) return $.valueOf() === X.valueOf();
          if ($.toString !== Object.prototype.toString) return $.toString() === X.toString();
          if (G = Object.keys($), Y = G.length, Y !== Object.keys(X).length) return false;
          for (J = Y; J-- !== 0; ) if (!Object.prototype.hasOwnProperty.call(X, G[J])) return false;
          for (J = Y; J-- !== 0; ) {
            var W = G[J];
            if (!Q($[W], X[W])) return false;
          }
          return true;
        }
        return $ !== $ && X !== X;
      };
    });
    ZH = P((Fy, bH) => {
      var J6 = bH.exports = function(Q, $, X) {
        if (typeof $ == "function") X = $, $ = {};
        X = $.cb || X;
        var Y = typeof X == "function" ? X : X.pre || function() {
        }, J = X.post || function() {
        };
        qQ($, Y, J, Q, "", Q);
      };
      J6.keywords = { additionalItems: true, items: true, contains: true, additionalProperties: true, propertyNames: true, not: true, if: true, then: true, else: true };
      J6.arrayKeywords = { items: true, allOf: true, anyOf: true, oneOf: true };
      J6.propsKeywords = { $defs: true, definitions: true, properties: true, patternProperties: true, dependencies: true };
      J6.skipKeywords = { default: true, enum: true, const: true, required: true, maximum: true, minimum: true, exclusiveMaximum: true, exclusiveMinimum: true, multipleOf: true, maxLength: true, minLength: true, pattern: true, format: true, maxItems: true, minItems: true, uniqueItems: true, maxProperties: true, minProperties: true };
      function qQ(Q, $, X, Y, J, G, W, H, B, z) {
        if (Y && typeof Y == "object" && !Array.isArray(Y)) {
          $(Y, J, G, W, H, B, z);
          for (var K in Y) {
            var U = Y[K];
            if (Array.isArray(U)) {
              if (K in J6.arrayKeywords) for (var q = 0; q < U.length; q++) qQ(Q, $, X, U[q], J + "/" + K + "/" + q, G, J, K, Y, q);
            } else if (K in J6.propsKeywords) {
              if (U && typeof U == "object") for (var V in U) qQ(Q, $, X, U[V], J + "/" + K + "/" + Wj(V), G, J, K, Y, V);
            } else if (K in J6.keywords || Q.allKeys && !(K in J6.skipKeywords)) qQ(Q, $, X, U, J + "/" + K, G, J, K, Y);
          }
          X(Y, J, G, W, H, B, z);
        }
      }
      function Wj(Q) {
        return Q.replace(/~/g, "~0").replace(/\//g, "~1");
      }
    });
    I9 = P((kH) => {
      Object.defineProperty(kH, "__esModule", { value: true });
      kH.getSchemaRefs = kH.resolveUrl = kH.normalizeId = kH._getFullPath = kH.getFullPath = kH.inlineRef = void 0;
      var Hj = a(), Bj = K7(), zj = ZH(), Kj = /* @__PURE__ */ new Set(["type", "format", "pattern", "maxLength", "minLength", "maxProperties", "minProperties", "maxItems", "minItems", "maximum", "minimum", "uniqueItems", "multipleOf", "required", "enum", "const"]);
      function Vj(Q, $ = true) {
        if (typeof Q == "boolean") return true;
        if ($ === true) return !V7(Q);
        if (!$) return false;
        return CH(Q) <= $;
      }
      kH.inlineRef = Vj;
      var qj = /* @__PURE__ */ new Set(["$ref", "$recursiveRef", "$recursiveAnchor", "$dynamicRef", "$dynamicAnchor"]);
      function V7(Q) {
        for (let $ in Q) {
          if (qj.has($)) return true;
          let X = Q[$];
          if (Array.isArray(X) && X.some(V7)) return true;
          if (typeof X == "object" && V7(X)) return true;
        }
        return false;
      }
      function CH(Q) {
        let $ = 0;
        for (let X in Q) {
          if (X === "$ref") return 1 / 0;
          if ($++, Kj.has(X)) continue;
          if (typeof Q[X] == "object") (0, Hj.eachItem)(Q[X], (Y) => $ += CH(Y));
          if ($ === 1 / 0) return 1 / 0;
        }
        return $;
      }
      function SH(Q, $ = "", X) {
        if (X !== false) $ = I4($);
        let Y = Q.parse($);
        return _H(Q, Y);
      }
      kH.getFullPath = SH;
      function _H(Q, $) {
        return Q.serialize($).split("#")[0] + "#";
      }
      kH._getFullPath = _H;
      var Uj = /#\/?$/;
      function I4(Q) {
        return Q ? Q.replace(Uj, "") : "";
      }
      kH.normalizeId = I4;
      function Lj(Q, $, X) {
        return X = I4(X), Q.resolve($, X);
      }
      kH.resolveUrl = Lj;
      var Fj = /^[a-z_][-a-z0-9._]*$/i;
      function Nj(Q, $) {
        if (typeof Q == "boolean") return {};
        let { schemaId: X, uriResolver: Y } = this.opts, J = I4(Q[X] || $), G = { "": J }, W = SH(Y, J, false), H = {}, B = /* @__PURE__ */ new Set();
        return zj(Q, { allKeys: true }, (U, q, V, L) => {
          if (L === void 0) return;
          let F = W + q, w = G[L];
          if (typeof U[X] == "string") w = D.call(this, U[X]);
          M.call(this, U.$anchor), M.call(this, U.$dynamicAnchor), G[q] = w;
          function D(R) {
            let Z = this.opts.uriResolver.resolve;
            if (R = I4(w ? Z(w, R) : R), B.has(R)) throw K(R);
            B.add(R);
            let v = this.refs[R];
            if (typeof v == "string") v = this.refs[v];
            if (typeof v == "object") z(U, v.schema, R);
            else if (R !== I4(F)) if (R[0] === "#") z(U, H[R], R), H[R] = U;
            else this.refs[R] = F;
            return R;
          }
          function M(R) {
            if (typeof R == "string") {
              if (!Fj.test(R)) throw Error(`invalid anchor "${R}"`);
              D.call(this, `#${R}`);
            }
          }
        }), H;
        function z(U, q, V) {
          if (q !== void 0 && !Bj(U, q)) throw K(V);
        }
        function K(U) {
          return Error(`reference "${U}" resolves to more than one schema`);
        }
      }
      kH.getSchemaRefs = Nj;
    });
    b9 = P((oH) => {
      Object.defineProperty(oH, "__esModule", { value: true });
      oH.getData = oH.KeywordCxt = oH.validateFunctionCode = void 0;
      var hH = a3(), TH = R9(), U7 = Y7(), UQ = R9(), jj = qH(), P9 = AH(), q7 = EH(), k = c(), f = k1(), Rj = I9(), v1 = a(), E9 = j9();
      function Ij(Q) {
        if (mH(Q)) {
          if (lH(Q), uH(Q)) {
            bj(Q);
            return;
          }
        }
        fH(Q, () => (0, hH.topBoolOrEmptySchema)(Q));
      }
      oH.validateFunctionCode = Ij;
      function fH({ gen: Q, validateName: $, schema: X, schemaEnv: Y, opts: J }, G) {
        if (J.code.es5) Q.func($, k._`${f.default.data}, ${f.default.valCxt}`, Y.$async, () => {
          Q.code(k._`"use strict"; ${xH(X, J)}`), Pj(Q, J), Q.code(G);
        });
        else Q.func($, k._`${f.default.data}, ${Ej(J)}`, Y.$async, () => Q.code(xH(X, J)).code(G));
      }
      function Ej(Q) {
        return k._`{${f.default.instancePath}="", ${f.default.parentData}, ${f.default.parentDataProperty}, ${f.default.rootData}=${f.default.data}${Q.dynamicRef ? k._`, ${f.default.dynamicAnchors}={}` : k.nil}}={}`;
      }
      function Pj(Q, $) {
        Q.if(f.default.valCxt, () => {
          if (Q.var(f.default.instancePath, k._`${f.default.valCxt}.${f.default.instancePath}`), Q.var(f.default.parentData, k._`${f.default.valCxt}.${f.default.parentData}`), Q.var(f.default.parentDataProperty, k._`${f.default.valCxt}.${f.default.parentDataProperty}`), Q.var(f.default.rootData, k._`${f.default.valCxt}.${f.default.rootData}`), $.dynamicRef) Q.var(f.default.dynamicAnchors, k._`${f.default.valCxt}.${f.default.dynamicAnchors}`);
        }, () => {
          if (Q.var(f.default.instancePath, k._`""`), Q.var(f.default.parentData, k._`undefined`), Q.var(f.default.parentDataProperty, k._`undefined`), Q.var(f.default.rootData, f.default.data), $.dynamicRef) Q.var(f.default.dynamicAnchors, k._`{}`);
        });
      }
      function bj(Q) {
        let { schema: $, opts: X, gen: Y } = Q;
        fH(Q, () => {
          if (X.$comment && $.$comment) pH(Q);
          if (kj(Q), Y.let(f.default.vErrors, null), Y.let(f.default.errors, 0), X.unevaluated) Zj(Q);
          cH(Q), xj(Q);
        });
        return;
      }
      function Zj(Q) {
        let { gen: $, validateName: X } = Q;
        Q.evaluated = $.const("evaluated", k._`${X}.evaluated`), $.if(k._`${Q.evaluated}.dynamicProps`, () => $.assign(k._`${Q.evaluated}.props`, k._`undefined`)), $.if(k._`${Q.evaluated}.dynamicItems`, () => $.assign(k._`${Q.evaluated}.items`, k._`undefined`));
      }
      function xH(Q, $) {
        let X = typeof Q == "object" && Q[$.schemaId];
        return X && ($.code.source || $.code.process) ? k._`/*# sourceURL=${X} */` : k.nil;
      }
      function Cj(Q, $) {
        if (mH(Q)) {
          if (lH(Q), uH(Q)) {
            Sj(Q, $);
            return;
          }
        }
        (0, hH.boolOrEmptySchema)(Q, $);
      }
      function uH({ schema: Q, self: $ }) {
        if (typeof Q == "boolean") return !Q;
        for (let X in Q) if ($.RULES.all[X]) return true;
        return false;
      }
      function mH(Q) {
        return typeof Q.schema != "boolean";
      }
      function Sj(Q, $) {
        let { schema: X, gen: Y, opts: J } = Q;
        if (J.$comment && X.$comment) pH(Q);
        vj(Q), Tj(Q);
        let G = Y.const("_errs", f.default.errors);
        cH(Q, G), Y.var($, k._`${G} === ${f.default.errors}`);
      }
      function lH(Q) {
        (0, v1.checkUnknownRules)(Q), _j(Q);
      }
      function cH(Q, $) {
        if (Q.opts.jtd) return yH(Q, [], false, $);
        let X = (0, TH.getSchemaTypes)(Q.schema), Y = (0, TH.coerceAndCheckDataType)(Q, X);
        yH(Q, X, !Y, $);
      }
      function _j(Q) {
        let { schema: $, errSchemaPath: X, opts: Y, self: J } = Q;
        if ($.$ref && Y.ignoreKeywordsWithRef && (0, v1.schemaHasRulesButRef)($, J.RULES)) J.logger.warn(`$ref: keywords ignored in schema at path "${X}"`);
      }
      function kj(Q) {
        let { schema: $, opts: X } = Q;
        if ($.default !== void 0 && X.useDefaults && X.strictSchema) (0, v1.checkStrictMode)(Q, "default is ignored in the schema root");
      }
      function vj(Q) {
        let $ = Q.schema[Q.opts.schemaId];
        if ($) Q.baseId = (0, Rj.resolveUrl)(Q.opts.uriResolver, Q.baseId, $);
      }
      function Tj(Q) {
        if (Q.schema.$async && !Q.schemaEnv.$async) throw Error("async schema in sync schema");
      }
      function pH({ gen: Q, schemaEnv: $, schema: X, errSchemaPath: Y, opts: J }) {
        let G = X.$comment;
        if (J.$comment === true) Q.code(k._`${f.default.self}.logger.log(${G})`);
        else if (typeof J.$comment == "function") {
          let W = k.str`${Y}/$comment`, H = Q.scopeValue("root", { ref: $.root });
          Q.code(k._`${f.default.self}.opts.$comment(${G}, ${W}, ${H}.schema)`);
        }
      }
      function xj(Q) {
        let { gen: $, schemaEnv: X, validateName: Y, ValidationError: J, opts: G } = Q;
        if (X.$async) $.if(k._`${f.default.errors} === 0`, () => $.return(f.default.data), () => $.throw(k._`new ${J}(${f.default.vErrors})`));
        else {
          if ($.assign(k._`${Y}.errors`, f.default.vErrors), G.unevaluated) yj(Q);
          $.return(k._`${f.default.errors} === 0`);
        }
      }
      function yj({ gen: Q, evaluated: $, props: X, items: Y }) {
        if (X instanceof k.Name) Q.assign(k._`${$}.props`, X);
        if (Y instanceof k.Name) Q.assign(k._`${$}.items`, Y);
      }
      function yH(Q, $, X, Y) {
        let { gen: J, schema: G, data: W, allErrors: H, opts: B, self: z } = Q, { RULES: K } = z;
        if (G.$ref && (B.ignoreKeywordsWithRef || !(0, v1.schemaHasRulesButRef)(G, K))) {
          J.block(() => iH(Q, "$ref", K.all.$ref.definition));
          return;
        }
        if (!B.jtd) gj(Q, $);
        J.block(() => {
          for (let q of K.rules) U(q);
          U(K.post);
        });
        function U(q) {
          if (!(0, U7.shouldUseGroup)(G, q)) return;
          if (q.type) {
            if (J.if((0, UQ.checkDataType)(q.type, W, B.strictNumbers)), gH(Q, q), $.length === 1 && $[0] === q.type && X) J.else(), (0, UQ.reportTypeError)(Q);
            J.endIf();
          } else gH(Q, q);
          if (!H) J.if(k._`${f.default.errors} === ${Y || 0}`);
        }
      }
      function gH(Q, $) {
        let { gen: X, schema: Y, opts: { useDefaults: J } } = Q;
        if (J) (0, jj.assignDefaults)(Q, $.type);
        X.block(() => {
          for (let G of $.rules) if ((0, U7.shouldUseRule)(Y, G)) iH(Q, G.keyword, G.definition, $.type);
        });
      }
      function gj(Q, $) {
        if (Q.schemaEnv.meta || !Q.opts.strictTypes) return;
        if (hj(Q, $), !Q.opts.allowUnionTypes) fj(Q, $);
        uj(Q, Q.dataTypes);
      }
      function hj(Q, $) {
        if (!$.length) return;
        if (!Q.dataTypes.length) {
          Q.dataTypes = $;
          return;
        }
        $.forEach((X) => {
          if (!dH(Q.dataTypes, X)) L7(Q, `type "${X}" not allowed by context "${Q.dataTypes.join(",")}"`);
        }), lj(Q, $);
      }
      function fj(Q, $) {
        if ($.length > 1 && !($.length === 2 && $.includes("null"))) L7(Q, "use allowUnionTypes to allow union type keyword");
      }
      function uj(Q, $) {
        let X = Q.self.RULES.all;
        for (let Y in X) {
          let J = X[Y];
          if (typeof J == "object" && (0, U7.shouldUseRule)(Q.schema, J)) {
            let { type: G } = J.definition;
            if (G.length && !G.some((W) => mj($, W))) L7(Q, `missing type "${G.join(",")}" for keyword "${Y}"`);
          }
        }
      }
      function mj(Q, $) {
        return Q.includes($) || $ === "number" && Q.includes("integer");
      }
      function dH(Q, $) {
        return Q.includes($) || $ === "integer" && Q.includes("number");
      }
      function lj(Q, $) {
        let X = [];
        for (let Y of Q.dataTypes) if (dH($, Y)) X.push(Y);
        else if ($.includes("integer") && Y === "number") X.push("integer");
        Q.dataTypes = X;
      }
      function L7(Q, $) {
        let X = Q.schemaEnv.baseId + Q.errSchemaPath;
        $ += ` at "${X}" (strictTypes)`, (0, v1.checkStrictMode)(Q, $, Q.opts.strictTypes);
      }
      class F7 {
        constructor(Q, $, X) {
          if ((0, P9.validateKeywordUsage)(Q, $, X), this.gen = Q.gen, this.allErrors = Q.allErrors, this.keyword = X, this.data = Q.data, this.schema = Q.schema[X], this.$data = $.$data && Q.opts.$data && this.schema && this.schema.$data, this.schemaValue = (0, v1.schemaRefOrVal)(Q, this.schema, X, this.$data), this.schemaType = $.schemaType, this.parentSchema = Q.schema, this.params = {}, this.it = Q, this.def = $, this.$data) this.schemaCode = Q.gen.const("vSchema", nH(this.$data, Q));
          else if (this.schemaCode = this.schemaValue, !(0, P9.validSchemaType)(this.schema, $.schemaType, $.allowUndefined)) throw Error(`${X} value must be ${JSON.stringify($.schemaType)}`);
          if ("code" in $ ? $.trackErrors : $.errors !== false) this.errsCount = Q.gen.const("_errs", f.default.errors);
        }
        result(Q, $, X) {
          this.failResult((0, k.not)(Q), $, X);
        }
        failResult(Q, $, X) {
          if (this.gen.if(Q), X) X();
          else this.error();
          if ($) {
            if (this.gen.else(), $(), this.allErrors) this.gen.endIf();
          } else if (this.allErrors) this.gen.endIf();
          else this.gen.else();
        }
        pass(Q, $) {
          this.failResult((0, k.not)(Q), void 0, $);
        }
        fail(Q) {
          if (Q === void 0) {
            if (this.error(), !this.allErrors) this.gen.if(false);
            return;
          }
          if (this.gen.if(Q), this.error(), this.allErrors) this.gen.endIf();
          else this.gen.else();
        }
        fail$data(Q) {
          if (!this.$data) return this.fail(Q);
          let { schemaCode: $ } = this;
          this.fail(k._`${$} !== undefined && (${(0, k.or)(this.invalid$data(), Q)})`);
        }
        error(Q, $, X) {
          if ($) {
            this.setParams($), this._error(Q, X), this.setParams({});
            return;
          }
          this._error(Q, X);
        }
        _error(Q, $) {
          (Q ? E9.reportExtraError : E9.reportError)(this, this.def.error, $);
        }
        $dataError() {
          (0, E9.reportError)(this, this.def.$dataError || E9.keyword$DataError);
        }
        reset() {
          if (this.errsCount === void 0) throw Error('add "trackErrors" to keyword definition');
          (0, E9.resetErrorsCount)(this.gen, this.errsCount);
        }
        ok(Q) {
          if (!this.allErrors) this.gen.if(Q);
        }
        setParams(Q, $) {
          if ($) Object.assign(this.params, Q);
          else this.params = Q;
        }
        block$data(Q, $, X = k.nil) {
          this.gen.block(() => {
            this.check$data(Q, X), $();
          });
        }
        check$data(Q = k.nil, $ = k.nil) {
          if (!this.$data) return;
          let { gen: X, schemaCode: Y, schemaType: J, def: G } = this;
          if (X.if((0, k.or)(k._`${Y} === undefined`, $)), Q !== k.nil) X.assign(Q, true);
          if (J.length || G.validateSchema) {
            if (X.elseIf(this.invalid$data()), this.$dataError(), Q !== k.nil) X.assign(Q, false);
          }
          X.else();
        }
        invalid$data() {
          let { gen: Q, schemaCode: $, schemaType: X, def: Y, it: J } = this;
          return (0, k.or)(G(), W());
          function G() {
            if (X.length) {
              if (!($ instanceof k.Name)) throw Error("ajv implementation error");
              let H = Array.isArray(X) ? X : [X];
              return k._`${(0, UQ.checkDataTypes)(H, $, J.opts.strictNumbers, UQ.DataType.Wrong)}`;
            }
            return k.nil;
          }
          function W() {
            if (Y.validateSchema) {
              let H = Q.scopeValue("validate$data", { ref: Y.validateSchema });
              return k._`!${H}(${$})`;
            }
            return k.nil;
          }
        }
        subschema(Q, $) {
          let X = (0, q7.getSubschema)(this.it, Q);
          (0, q7.extendSubschemaData)(X, this.it, Q), (0, q7.extendSubschemaMode)(X, Q);
          let Y = { ...this.it, ...X, items: void 0, props: void 0 };
          return Cj(Y, $), Y;
        }
        mergeEvaluated(Q, $) {
          let { it: X, gen: Y } = this;
          if (!X.opts.unevaluated) return;
          if (X.props !== true && Q.props !== void 0) X.props = v1.mergeEvaluated.props(Y, Q.props, X.props, $);
          if (X.items !== true && Q.items !== void 0) X.items = v1.mergeEvaluated.items(Y, Q.items, X.items, $);
        }
        mergeValidEvaluated(Q, $) {
          let { it: X, gen: Y } = this;
          if (X.opts.unevaluated && (X.props !== true || X.items !== true)) return Y.if($, () => this.mergeEvaluated(Q, k.Name)), true;
        }
      }
      oH.KeywordCxt = F7;
      function iH(Q, $, X, Y) {
        let J = new F7(Q, X, $);
        if ("code" in X) X.code(J, Y);
        else if (J.$data && X.validate) (0, P9.funcKeywordCode)(J, X);
        else if ("macro" in X) (0, P9.macroKeywordCode)(J, X);
        else if (X.compile || X.validate) (0, P9.funcKeywordCode)(J, X);
      }
      var cj = /^\/(?:[^~]|~0|~1)*$/, pj = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
      function nH(Q, { dataLevel: $, dataNames: X, dataPathArr: Y }) {
        let J, G;
        if (Q === "") return f.default.rootData;
        if (Q[0] === "/") {
          if (!cj.test(Q)) throw Error(`Invalid JSON-pointer: ${Q}`);
          J = Q, G = f.default.rootData;
        } else {
          let z = pj.exec(Q);
          if (!z) throw Error(`Invalid JSON-pointer: ${Q}`);
          let K = +z[1];
          if (J = z[2], J === "#") {
            if (K >= $) throw Error(B("property/index", K));
            return Y[$ - K];
          }
          if (K > $) throw Error(B("data", K));
          if (G = X[$ - K], !J) return G;
        }
        let W = G, H = J.split("/");
        for (let z of H) if (z) G = k._`${G}${(0, k.getProperty)((0, v1.unescapeJsonPointer)(z))}`, W = k._`${W} && ${G}`;
        return W;
        function B(z, K) {
          return `Cannot access ${z} ${K} levels up, current level is ${$}`;
        }
      }
      oH.getData = nH;
    });
    LQ = P((aH) => {
      Object.defineProperty(aH, "__esModule", { value: true });
      class tH extends Error {
        constructor(Q) {
          super("validation failed");
          this.errors = Q, this.ajv = this.validation = true;
        }
      }
      aH.default = tH;
    });
    Z9 = P((eH) => {
      Object.defineProperty(eH, "__esModule", { value: true });
      var N7 = I9();
      class sH extends Error {
        constructor(Q, $, X, Y) {
          super(Y || `can't resolve reference ${X} from id ${$}`);
          this.missingRef = (0, N7.resolveUrl)(Q, $, X), this.missingSchema = (0, N7.normalizeId)((0, N7.getFullPath)(Q, this.missingRef));
        }
      }
      eH.default = sH;
    });
    NQ = P((XB) => {
      Object.defineProperty(XB, "__esModule", { value: true });
      XB.resolveSchema = XB.getCompilingSchema = XB.resolveRef = XB.compileSchema = XB.SchemaEnv = void 0;
      var V1 = c(), rj = LQ(), S6 = k1(), q1 = I9(), QB = a(), tj = b9();
      class C9 {
        constructor(Q) {
          var $;
          this.refs = {}, this.dynamicAnchors = {};
          let X;
          if (typeof Q.schema == "object") X = Q.schema;
          this.schema = Q.schema, this.schemaId = Q.schemaId, this.root = Q.root || this, this.baseId = ($ = Q.baseId) !== null && $ !== void 0 ? $ : (0, q1.normalizeId)(X === null || X === void 0 ? void 0 : X[Q.schemaId || "$id"]), this.schemaPath = Q.schemaPath, this.localRefs = Q.localRefs, this.meta = Q.meta, this.$async = X === null || X === void 0 ? void 0 : X.$async, this.refs = {};
        }
      }
      XB.SchemaEnv = C9;
      function D7(Q) {
        let $ = $B.call(this, Q);
        if ($) return $;
        let X = (0, q1.getFullPath)(this.opts.uriResolver, Q.root.baseId), { es5: Y, lines: J } = this.opts.code, { ownProperties: G } = this.opts, W = new V1.CodeGen(this.scope, { es5: Y, lines: J, ownProperties: G }), H;
        if (Q.$async) H = W.scopeValue("Error", { ref: rj.default, code: V1._`require("ajv/dist/runtime/validation_error").default` });
        let B = W.scopeName("validate");
        Q.validateName = B;
        let z = { gen: W, allErrors: this.opts.allErrors, data: S6.default.data, parentData: S6.default.parentData, parentDataProperty: S6.default.parentDataProperty, dataNames: [S6.default.data], dataPathArr: [V1.nil], dataLevel: 0, dataTypes: [], definedProperties: /* @__PURE__ */ new Set(), topSchemaRef: W.scopeValue("schema", this.opts.code.source === true ? { ref: Q.schema, code: (0, V1.stringify)(Q.schema) } : { ref: Q.schema }), validateName: B, ValidationError: H, schema: Q.schema, schemaEnv: Q, rootId: X, baseId: Q.baseId || X, schemaPath: V1.nil, errSchemaPath: Q.schemaPath || (this.opts.jtd ? "" : "#"), errorPath: V1._`""`, opts: this.opts, self: this }, K;
        try {
          this._compilations.add(Q), (0, tj.validateFunctionCode)(z), W.optimize(this.opts.code.optimize);
          let U = W.toString();
          if (K = `${W.scopeRefs(S6.default.scope)}return ${U}`, this.opts.code.process) K = this.opts.code.process(K, Q);
          let V = Function(`${S6.default.self}`, `${S6.default.scope}`, K)(this, this.scope.get());
          if (this.scope.value(B, { ref: V }), V.errors = null, V.schema = Q.schema, V.schemaEnv = Q, Q.$async) V.$async = true;
          if (this.opts.code.source === true) V.source = { validateName: B, validateCode: U, scopeValues: W._values };
          if (this.opts.unevaluated) {
            let { props: L, items: F } = z;
            if (V.evaluated = { props: L instanceof V1.Name ? void 0 : L, items: F instanceof V1.Name ? void 0 : F, dynamicProps: L instanceof V1.Name, dynamicItems: F instanceof V1.Name }, V.source) V.source.evaluated = (0, V1.stringify)(V.evaluated);
          }
          return Q.validate = V, Q;
        } catch (U) {
          if (delete Q.validate, delete Q.validateName, K) this.logger.error("Error compiling schema, function code:", K);
          throw U;
        } finally {
          this._compilations.delete(Q);
        }
      }
      XB.compileSchema = D7;
      function aj(Q, $, X) {
        var Y;
        X = (0, q1.resolveUrl)(this.opts.uriResolver, $, X);
        let J = Q.refs[X];
        if (J) return J;
        let G = Q2.call(this, Q, X);
        if (G === void 0) {
          let W = (Y = Q.localRefs) === null || Y === void 0 ? void 0 : Y[X], { schemaId: H } = this.opts;
          if (W) G = new C9({ schema: W, schemaId: H, root: Q, baseId: $ });
        }
        if (G === void 0) return;
        return Q.refs[X] = sj.call(this, G);
      }
      XB.resolveRef = aj;
      function sj(Q) {
        if ((0, q1.inlineRef)(Q.schema, this.opts.inlineRefs)) return Q.schema;
        return Q.validate ? Q : D7.call(this, Q);
      }
      function $B(Q) {
        for (let $ of this._compilations) if (ej($, Q)) return $;
      }
      XB.getCompilingSchema = $B;
      function ej(Q, $) {
        return Q.schema === $.schema && Q.root === $.root && Q.baseId === $.baseId;
      }
      function Q2(Q, $) {
        let X;
        while (typeof (X = this.refs[$]) == "string") $ = X;
        return X || this.schemas[$] || FQ.call(this, Q, $);
      }
      function FQ(Q, $) {
        let X = this.opts.uriResolver.parse($), Y = (0, q1._getFullPath)(this.opts.uriResolver, X), J = (0, q1.getFullPath)(this.opts.uriResolver, Q.baseId, void 0);
        if (Object.keys(Q.schema).length > 0 && Y === J) return O7.call(this, X, Q);
        let G = (0, q1.normalizeId)(Y), W = this.refs[G] || this.schemas[G];
        if (typeof W == "string") {
          let H = FQ.call(this, Q, W);
          if (typeof (H === null || H === void 0 ? void 0 : H.schema) !== "object") return;
          return O7.call(this, X, H);
        }
        if (typeof (W === null || W === void 0 ? void 0 : W.schema) !== "object") return;
        if (!W.validate) D7.call(this, W);
        if (G === (0, q1.normalizeId)($)) {
          let { schema: H } = W, { schemaId: B } = this.opts, z = H[B];
          if (z) J = (0, q1.resolveUrl)(this.opts.uriResolver, J, z);
          return new C9({ schema: H, schemaId: B, root: Q, baseId: J });
        }
        return O7.call(this, X, W);
      }
      XB.resolveSchema = FQ;
      var $2 = /* @__PURE__ */ new Set(["properties", "patternProperties", "enum", "dependencies", "definitions"]);
      function O7(Q, { baseId: $, schema: X, root: Y }) {
        var J;
        if (((J = Q.fragment) === null || J === void 0 ? void 0 : J[0]) !== "/") return;
        for (let H of Q.fragment.slice(1).split("/")) {
          if (typeof X === "boolean") return;
          let B = X[(0, QB.unescapeFragment)(H)];
          if (B === void 0) return;
          X = B;
          let z = typeof X === "object" && X[this.opts.schemaId];
          if (!$2.has(H) && z) $ = (0, q1.resolveUrl)(this.opts.uriResolver, $, z);
        }
        let G;
        if (typeof X != "boolean" && X.$ref && !(0, QB.schemaHasRulesButRef)(X, this.RULES)) {
          let H = (0, q1.resolveUrl)(this.opts.uriResolver, $, X.$ref);
          G = FQ.call(this, Y, H);
        }
        let { schemaId: W } = this.opts;
        if (G = G || new C9({ schema: X, schemaId: W, root: Y, baseId: $ }), G.schema !== G.root.schema) return G;
        return;
      }
    });
    JB = P((Ay, W2) => {
      W2.exports = { $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#", description: "Meta-schema for $data reference (JSON AnySchema extension proposal)", type: "object", required: ["$data"], properties: { $data: { type: "string", anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }] } }, additionalProperties: false };
    });
    WB = P((jy, GB) => {
      var H2 = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, a: 10, A: 10, b: 11, B: 11, c: 12, C: 12, d: 13, D: 13, e: 14, E: 14, f: 15, F: 15 };
      GB.exports = { HEX: H2 };
    });
    LB = P((Ry, UB) => {
      var { HEX: B2 } = WB(), z2 = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u;
      function KB(Q) {
        if (qB(Q, ".") < 3) return { host: Q, isIPV4: false };
        let $ = Q.match(z2) || [], [X] = $;
        if (X) return { host: V2(X, "."), isIPV4: true };
        else return { host: Q, isIPV4: false };
      }
      function w7(Q, $ = false) {
        let X = "", Y = true;
        for (let J of Q) {
          if (B2[J] === void 0) return;
          if (J !== "0" && Y === true) Y = false;
          if (!Y) X += J;
        }
        if ($ && X.length === 0) X = "0";
        return X;
      }
      function K2(Q) {
        let $ = 0, X = { error: false, address: "", zone: "" }, Y = [], J = [], G = false, W = false, H = false;
        function B() {
          if (J.length) {
            if (G === false) {
              let z = w7(J);
              if (z !== void 0) Y.push(z);
              else return X.error = true, false;
            }
            J.length = 0;
          }
          return true;
        }
        for (let z = 0; z < Q.length; z++) {
          let K = Q[z];
          if (K === "[" || K === "]") continue;
          if (K === ":") {
            if (W === true) H = true;
            if (!B()) break;
            if ($++, Y.push(":"), $ > 7) {
              X.error = true;
              break;
            }
            if (z - 1 >= 0 && Q[z - 1] === ":") W = true;
            continue;
          } else if (K === "%") {
            if (!B()) break;
            G = true;
          } else {
            J.push(K);
            continue;
          }
        }
        if (J.length) if (G) X.zone = J.join("");
        else if (H) Y.push(J.join(""));
        else Y.push(w7(J));
        return X.address = Y.join(""), X;
      }
      function VB(Q) {
        if (qB(Q, ":") < 2) return { host: Q, isIPV6: false };
        let $ = K2(Q);
        if (!$.error) {
          let { address: X, address: Y } = $;
          if ($.zone) X += "%" + $.zone, Y += "%25" + $.zone;
          return { host: X, escapedHost: Y, isIPV6: true };
        } else return { host: Q, isIPV6: false };
      }
      function V2(Q, $) {
        let X = "", Y = true, J = Q.length;
        for (let G = 0; G < J; G++) {
          let W = Q[G];
          if (W === "0" && Y) {
            if (G + 1 <= J && Q[G + 1] === $ || G + 1 === J) X += W, Y = false;
          } else {
            if (W === $) Y = true;
            else Y = false;
            X += W;
          }
        }
        return X;
      }
      function qB(Q, $) {
        let X = 0;
        for (let Y = 0; Y < Q.length; Y++) if (Q[Y] === $) X++;
        return X;
      }
      var HB = /^\.\.?\//u, BB = /^\/\.(?:\/|$)/u, zB = /^\/\.\.(?:\/|$)/u, q2 = /^\/?(?:.|\n)*?(?=\/|$)/u;
      function U2(Q) {
        let $ = [];
        while (Q.length) if (Q.match(HB)) Q = Q.replace(HB, "");
        else if (Q.match(BB)) Q = Q.replace(BB, "/");
        else if (Q.match(zB)) Q = Q.replace(zB, "/"), $.pop();
        else if (Q === "." || Q === "..") Q = "";
        else {
          let X = Q.match(q2);
          if (X) {
            let Y = X[0];
            Q = Q.slice(Y.length), $.push(Y);
          } else throw Error("Unexpected dot segment condition");
        }
        return $.join("");
      }
      function L2(Q, $) {
        let X = $ !== true ? escape : unescape;
        if (Q.scheme !== void 0) Q.scheme = X(Q.scheme);
        if (Q.userinfo !== void 0) Q.userinfo = X(Q.userinfo);
        if (Q.host !== void 0) Q.host = X(Q.host);
        if (Q.path !== void 0) Q.path = X(Q.path);
        if (Q.query !== void 0) Q.query = X(Q.query);
        if (Q.fragment !== void 0) Q.fragment = X(Q.fragment);
        return Q;
      }
      function F2(Q) {
        let $ = [];
        if (Q.userinfo !== void 0) $.push(Q.userinfo), $.push("@");
        if (Q.host !== void 0) {
          let X = unescape(Q.host), Y = KB(X);
          if (Y.isIPV4) X = Y.host;
          else {
            let J = VB(Y.host);
            if (J.isIPV6 === true) X = `[${J.escapedHost}]`;
            else X = Q.host;
          }
          $.push(X);
        }
        if (typeof Q.port === "number" || typeof Q.port === "string") $.push(":"), $.push(String(Q.port));
        return $.length ? $.join("") : void 0;
      }
      UB.exports = { recomposeAuthority: F2, normalizeComponentEncoding: L2, removeDotSegments: U2, normalizeIPv4: KB, normalizeIPv6: VB, stringArrayToHexStripped: w7 };
    });
    MB = P((Iy, wB) => {
      var N2 = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu, O2 = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
      function FB(Q) {
        return typeof Q.secure === "boolean" ? Q.secure : String(Q.scheme).toLowerCase() === "wss";
      }
      function NB(Q) {
        if (!Q.host) Q.error = Q.error || "HTTP URIs must have a host.";
        return Q;
      }
      function OB(Q) {
        let $ = String(Q.scheme).toLowerCase() === "https";
        if (Q.port === ($ ? 443 : 80) || Q.port === "") Q.port = void 0;
        if (!Q.path) Q.path = "/";
        return Q;
      }
      function D2(Q) {
        return Q.secure = FB(Q), Q.resourceName = (Q.path || "/") + (Q.query ? "?" + Q.query : ""), Q.path = void 0, Q.query = void 0, Q;
      }
      function w2(Q) {
        if (Q.port === (FB(Q) ? 443 : 80) || Q.port === "") Q.port = void 0;
        if (typeof Q.secure === "boolean") Q.scheme = Q.secure ? "wss" : "ws", Q.secure = void 0;
        if (Q.resourceName) {
          let [$, X] = Q.resourceName.split("?");
          Q.path = $ && $ !== "/" ? $ : void 0, Q.query = X, Q.resourceName = void 0;
        }
        return Q.fragment = void 0, Q;
      }
      function M2(Q, $) {
        if (!Q.path) return Q.error = "URN can not be parsed", Q;
        let X = Q.path.match(O2);
        if (X) {
          let Y = $.scheme || Q.scheme || "urn";
          Q.nid = X[1].toLowerCase(), Q.nss = X[2];
          let J = `${Y}:${$.nid || Q.nid}`, G = M7[J];
          if (Q.path = void 0, G) Q = G.parse(Q, $);
        } else Q.error = Q.error || "URN can not be parsed.";
        return Q;
      }
      function A2(Q, $) {
        let X = $.scheme || Q.scheme || "urn", Y = Q.nid.toLowerCase(), J = `${X}:${$.nid || Y}`, G = M7[J];
        if (G) Q = G.serialize(Q, $);
        let W = Q, H = Q.nss;
        return W.path = `${Y || $.nid}:${H}`, $.skipEscape = true, W;
      }
      function j2(Q, $) {
        let X = Q;
        if (X.uuid = X.nss, X.nss = void 0, !$.tolerant && (!X.uuid || !N2.test(X.uuid))) X.error = X.error || "UUID is not valid.";
        return X;
      }
      function R2(Q) {
        let $ = Q;
        return $.nss = (Q.uuid || "").toLowerCase(), $;
      }
      var DB = { scheme: "http", domainHost: true, parse: NB, serialize: OB }, I2 = { scheme: "https", domainHost: DB.domainHost, parse: NB, serialize: OB }, OQ = { scheme: "ws", domainHost: true, parse: D2, serialize: w2 }, E2 = { scheme: "wss", domainHost: OQ.domainHost, parse: OQ.parse, serialize: OQ.serialize }, P2 = { scheme: "urn", parse: M2, serialize: A2, skipNormalize: true }, b2 = { scheme: "urn:uuid", parse: j2, serialize: R2, skipNormalize: true }, M7 = { http: DB, https: I2, ws: OQ, wss: E2, urn: P2, "urn:uuid": b2 };
      wB.exports = M7;
    });
    jB = P((Ey, wQ) => {
      var { normalizeIPv6: Z2, normalizeIPv4: C2, removeDotSegments: S9, recomposeAuthority: S2, normalizeComponentEncoding: DQ } = LB(), A7 = MB();
      function _2(Q, $) {
        if (typeof Q === "string") Q = I1(T1(Q, $), $);
        else if (typeof Q === "object") Q = T1(I1(Q, $), $);
        return Q;
      }
      function k2(Q, $, X) {
        let Y = Object.assign({ scheme: "null" }, X), J = AB(T1(Q, Y), T1($, Y), Y, true);
        return I1(J, { ...Y, skipEscape: true });
      }
      function AB(Q, $, X, Y) {
        let J = {};
        if (!Y) Q = T1(I1(Q, X), X), $ = T1(I1($, X), X);
        if (X = X || {}, !X.tolerant && $.scheme) J.scheme = $.scheme, J.userinfo = $.userinfo, J.host = $.host, J.port = $.port, J.path = S9($.path || ""), J.query = $.query;
        else {
          if ($.userinfo !== void 0 || $.host !== void 0 || $.port !== void 0) J.userinfo = $.userinfo, J.host = $.host, J.port = $.port, J.path = S9($.path || ""), J.query = $.query;
          else {
            if (!$.path) if (J.path = Q.path, $.query !== void 0) J.query = $.query;
            else J.query = Q.query;
            else {
              if ($.path.charAt(0) === "/") J.path = S9($.path);
              else {
                if ((Q.userinfo !== void 0 || Q.host !== void 0 || Q.port !== void 0) && !Q.path) J.path = "/" + $.path;
                else if (!Q.path) J.path = $.path;
                else J.path = Q.path.slice(0, Q.path.lastIndexOf("/") + 1) + $.path;
                J.path = S9(J.path);
              }
              J.query = $.query;
            }
            J.userinfo = Q.userinfo, J.host = Q.host, J.port = Q.port;
          }
          J.scheme = Q.scheme;
        }
        return J.fragment = $.fragment, J;
      }
      function v2(Q, $, X) {
        if (typeof Q === "string") Q = unescape(Q), Q = I1(DQ(T1(Q, X), true), { ...X, skipEscape: true });
        else if (typeof Q === "object") Q = I1(DQ(Q, true), { ...X, skipEscape: true });
        if (typeof $ === "string") $ = unescape($), $ = I1(DQ(T1($, X), true), { ...X, skipEscape: true });
        else if (typeof $ === "object") $ = I1(DQ($, true), { ...X, skipEscape: true });
        return Q.toLowerCase() === $.toLowerCase();
      }
      function I1(Q, $) {
        let X = { host: Q.host, scheme: Q.scheme, userinfo: Q.userinfo, port: Q.port, path: Q.path, query: Q.query, nid: Q.nid, nss: Q.nss, uuid: Q.uuid, fragment: Q.fragment, reference: Q.reference, resourceName: Q.resourceName, secure: Q.secure, error: "" }, Y = Object.assign({}, $), J = [], G = A7[(Y.scheme || X.scheme || "").toLowerCase()];
        if (G && G.serialize) G.serialize(X, Y);
        if (X.path !== void 0) if (!Y.skipEscape) {
          if (X.path = escape(X.path), X.scheme !== void 0) X.path = X.path.split("%3A").join(":");
        } else X.path = unescape(X.path);
        if (Y.reference !== "suffix" && X.scheme) J.push(X.scheme, ":");
        let W = S2(X);
        if (W !== void 0) {
          if (Y.reference !== "suffix") J.push("//");
          if (J.push(W), X.path && X.path.charAt(0) !== "/") J.push("/");
        }
        if (X.path !== void 0) {
          let H = X.path;
          if (!Y.absolutePath && (!G || !G.absolutePath)) H = S9(H);
          if (W === void 0) H = H.replace(/^\/\//u, "/%2F");
          J.push(H);
        }
        if (X.query !== void 0) J.push("?", X.query);
        if (X.fragment !== void 0) J.push("#", X.fragment);
        return J.join("");
      }
      var T2 = Array.from({ length: 127 }, (Q, $) => /[^!"$&'()*+,\-.;=_`a-z{}~]/u.test(String.fromCharCode($)));
      function x2(Q) {
        let $ = 0;
        for (let X = 0, Y = Q.length; X < Y; ++X) if ($ = Q.charCodeAt(X), $ > 126 || T2[$]) return true;
        return false;
      }
      var y2 = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
      function T1(Q, $) {
        let X = Object.assign({}, $), Y = { scheme: void 0, userinfo: void 0, host: "", port: void 0, path: "", query: void 0, fragment: void 0 }, J = Q.indexOf("%") !== -1, G = false;
        if (X.reference === "suffix") Q = (X.scheme ? X.scheme + ":" : "") + "//" + Q;
        let W = Q.match(y2);
        if (W) {
          if (Y.scheme = W[1], Y.userinfo = W[3], Y.host = W[4], Y.port = parseInt(W[5], 10), Y.path = W[6] || "", Y.query = W[7], Y.fragment = W[8], isNaN(Y.port)) Y.port = W[5];
          if (Y.host) {
            let B = C2(Y.host);
            if (B.isIPV4 === false) {
              let z = Z2(B.host);
              Y.host = z.host.toLowerCase(), G = z.isIPV6;
            } else Y.host = B.host, G = true;
          }
          if (Y.scheme === void 0 && Y.userinfo === void 0 && Y.host === void 0 && Y.port === void 0 && Y.query === void 0 && !Y.path) Y.reference = "same-document";
          else if (Y.scheme === void 0) Y.reference = "relative";
          else if (Y.fragment === void 0) Y.reference = "absolute";
          else Y.reference = "uri";
          if (X.reference && X.reference !== "suffix" && X.reference !== Y.reference) Y.error = Y.error || "URI is not a " + X.reference + " reference.";
          let H = A7[(X.scheme || Y.scheme || "").toLowerCase()];
          if (!X.unicodeSupport && (!H || !H.unicodeSupport)) {
            if (Y.host && (X.domainHost || H && H.domainHost) && G === false && x2(Y.host)) try {
              Y.host = URL.domainToASCII(Y.host.toLowerCase());
            } catch (B) {
              Y.error = Y.error || "Host's domain name can not be converted to ASCII: " + B;
            }
          }
          if (!H || H && !H.skipNormalize) {
            if (J && Y.scheme !== void 0) Y.scheme = unescape(Y.scheme);
            if (J && Y.host !== void 0) Y.host = unescape(Y.host);
            if (Y.path) Y.path = escape(unescape(Y.path));
            if (Y.fragment) Y.fragment = encodeURI(decodeURIComponent(Y.fragment));
          }
          if (H && H.parse) H.parse(Y, X);
        } else Y.error = Y.error || "URI can not be parsed.";
        return Y;
      }
      var j7 = { SCHEMES: A7, normalize: _2, resolve: k2, resolveComponents: AB, equal: v2, serialize: I1, parse: T1 };
      wQ.exports = j7;
      wQ.exports.default = j7;
      wQ.exports.fastUri = j7;
    });
    EB = P((IB) => {
      Object.defineProperty(IB, "__esModule", { value: true });
      var RB = jB();
      RB.code = 'require("ajv/dist/runtime/uri").default';
      IB.default = RB;
    });
    vB = P((x1) => {
      Object.defineProperty(x1, "__esModule", { value: true });
      x1.CodeGen = x1.Name = x1.nil = x1.stringify = x1.str = x1._ = x1.KeywordCxt = void 0;
      var h2 = b9();
      Object.defineProperty(x1, "KeywordCxt", { enumerable: true, get: function() {
        return h2.KeywordCxt;
      } });
      var E4 = c();
      Object.defineProperty(x1, "_", { enumerable: true, get: function() {
        return E4._;
      } });
      Object.defineProperty(x1, "str", { enumerable: true, get: function() {
        return E4.str;
      } });
      Object.defineProperty(x1, "stringify", { enumerable: true, get: function() {
        return E4.stringify;
      } });
      Object.defineProperty(x1, "nil", { enumerable: true, get: function() {
        return E4.nil;
      } });
      Object.defineProperty(x1, "Name", { enumerable: true, get: function() {
        return E4.Name;
      } });
      Object.defineProperty(x1, "CodeGen", { enumerable: true, get: function() {
        return E4.CodeGen;
      } });
      var f2 = LQ(), SB = Z9(), u2 = X7(), _9 = NQ(), m2 = c(), k9 = I9(), MQ = R9(), I7 = a(), PB = JB(), l2 = EB(), _B = (Q, $) => new RegExp(Q, $);
      _B.code = "new RegExp";
      var c2 = ["removeAdditional", "useDefaults", "coerceTypes"], p2 = /* @__PURE__ */ new Set(["validate", "serialize", "parse", "wrapper", "root", "schema", "keyword", "pattern", "formats", "validate$data", "func", "obj", "Error"]), d2 = { errorDataPath: "", format: "`validateFormats: false` can be used instead.", nullable: '"nullable" keyword is supported by default.', jsonPointers: "Deprecated jsPropertySyntax can be used instead.", extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.", missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.", processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`", sourceCode: "Use option `code: {source: true}`", strictDefaults: "It is default now, see option `strict`.", strictKeywords: "It is default now, see option `strict`.", uniqueItems: '"uniqueItems" keyword is always validated.', unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).", cache: "Map is used as cache, schema object as key.", serialize: "Map is used as cache, schema object as key.", ajvErrors: "It is default now." }, i2 = { ignoreKeywordsWithRef: "", jsPropertySyntax: "", unicode: '"minLength"/"maxLength" account for unicode characters by default.' }, bB = 200;
      function n2(Q) {
        var $, X, Y, J, G, W, H, B, z, K, U, q, V, L, F, w, D, M, R, Z, v, O0, D0, d0, B6;
        let F1 = Q.strict, z6 = ($ = Q.code) === null || $ === void 0 ? void 0 : $.optimize, y1 = z6 === true || z6 === void 0 ? 1 : z6 || 0, K6 = (Y = (X = Q.code) === null || X === void 0 ? void 0 : X.regExp) !== null && Y !== void 0 ? Y : _B, h = (J = Q.uriResolver) !== null && J !== void 0 ? J : l2.default;
        return { strictSchema: (W = (G = Q.strictSchema) !== null && G !== void 0 ? G : F1) !== null && W !== void 0 ? W : true, strictNumbers: (B = (H = Q.strictNumbers) !== null && H !== void 0 ? H : F1) !== null && B !== void 0 ? B : true, strictTypes: (K = (z = Q.strictTypes) !== null && z !== void 0 ? z : F1) !== null && K !== void 0 ? K : "log", strictTuples: (q = (U = Q.strictTuples) !== null && U !== void 0 ? U : F1) !== null && q !== void 0 ? q : "log", strictRequired: (L = (V = Q.strictRequired) !== null && V !== void 0 ? V : F1) !== null && L !== void 0 ? L : false, code: Q.code ? { ...Q.code, optimize: y1, regExp: K6 } : { optimize: y1, regExp: K6 }, loopRequired: (F = Q.loopRequired) !== null && F !== void 0 ? F : bB, loopEnum: (w = Q.loopEnum) !== null && w !== void 0 ? w : bB, meta: (D = Q.meta) !== null && D !== void 0 ? D : true, messages: (M = Q.messages) !== null && M !== void 0 ? M : true, inlineRefs: (R = Q.inlineRefs) !== null && R !== void 0 ? R : true, schemaId: (Z = Q.schemaId) !== null && Z !== void 0 ? Z : "$id", addUsedSchema: (v = Q.addUsedSchema) !== null && v !== void 0 ? v : true, validateSchema: (O0 = Q.validateSchema) !== null && O0 !== void 0 ? O0 : true, validateFormats: (D0 = Q.validateFormats) !== null && D0 !== void 0 ? D0 : true, unicodeRegExp: (d0 = Q.unicodeRegExp) !== null && d0 !== void 0 ? d0 : true, int32range: (B6 = Q.int32range) !== null && B6 !== void 0 ? B6 : true, uriResolver: h };
      }
      class AQ {
        constructor(Q = {}) {
          this.schemas = {}, this.refs = {}, this.formats = {}, this._compilations = /* @__PURE__ */ new Set(), this._loading = {}, this._cache = /* @__PURE__ */ new Map(), Q = this.opts = { ...Q, ...n2(Q) };
          let { es5: $, lines: X } = this.opts.code;
          this.scope = new m2.ValueScope({ scope: {}, prefixes: p2, es5: $, lines: X }), this.logger = e2(Q.logger);
          let Y = Q.validateFormats;
          if (Q.validateFormats = false, this.RULES = (0, u2.getRules)(), ZB.call(this, d2, Q, "NOT SUPPORTED"), ZB.call(this, i2, Q, "DEPRECATED", "warn"), this._metaOpts = a2.call(this), Q.formats) r2.call(this);
          if (this._addVocabularies(), this._addDefaultMetaSchema(), Q.keywords) t2.call(this, Q.keywords);
          if (typeof Q.meta == "object") this.addMetaSchema(Q.meta);
          o2.call(this), Q.validateFormats = Y;
        }
        _addVocabularies() {
          this.addKeyword("$async");
        }
        _addDefaultMetaSchema() {
          let { $data: Q, meta: $, schemaId: X } = this.opts, Y = PB;
          if (X === "id") Y = { ...PB }, Y.id = Y.$id, delete Y.$id;
          if ($ && Q) this.addMetaSchema(Y, Y[X], false);
        }
        defaultMeta() {
          let { meta: Q, schemaId: $ } = this.opts;
          return this.opts.defaultMeta = typeof Q == "object" ? Q[$] || Q : void 0;
        }
        validate(Q, $) {
          let X;
          if (typeof Q == "string") {
            if (X = this.getSchema(Q), !X) throw Error(`no schema with key or ref "${Q}"`);
          } else X = this.compile(Q);
          let Y = X($);
          if (!("$async" in X)) this.errors = X.errors;
          return Y;
        }
        compile(Q, $) {
          let X = this._addSchema(Q, $);
          return X.validate || this._compileSchemaEnv(X);
        }
        compileAsync(Q, $) {
          if (typeof this.opts.loadSchema != "function") throw Error("options.loadSchema should be a function");
          let { loadSchema: X } = this.opts;
          return Y.call(this, Q, $);
          async function Y(z, K) {
            await J.call(this, z.$schema);
            let U = this._addSchema(z, K);
            return U.validate || G.call(this, U);
          }
          async function J(z) {
            if (z && !this.getSchema(z)) await Y.call(this, { $ref: z }, true);
          }
          async function G(z) {
            try {
              return this._compileSchemaEnv(z);
            } catch (K) {
              if (!(K instanceof SB.default)) throw K;
              return W.call(this, K), await H.call(this, K.missingSchema), G.call(this, z);
            }
          }
          function W({ missingSchema: z, missingRef: K }) {
            if (this.refs[z]) throw Error(`AnySchema ${z} is loaded but ${K} cannot be resolved`);
          }
          async function H(z) {
            let K = await B.call(this, z);
            if (!this.refs[z]) await J.call(this, K.$schema);
            if (!this.refs[z]) this.addSchema(K, z, $);
          }
          async function B(z) {
            let K = this._loading[z];
            if (K) return K;
            try {
              return await (this._loading[z] = X(z));
            } finally {
              delete this._loading[z];
            }
          }
        }
        addSchema(Q, $, X, Y = this.opts.validateSchema) {
          if (Array.isArray(Q)) {
            for (let G of Q) this.addSchema(G, void 0, X, Y);
            return this;
          }
          let J;
          if (typeof Q === "object") {
            let { schemaId: G } = this.opts;
            if (J = Q[G], J !== void 0 && typeof J != "string") throw Error(`schema ${G} must be string`);
          }
          return $ = (0, k9.normalizeId)($ || J), this._checkUnique($), this.schemas[$] = this._addSchema(Q, X, $, Y, true), this;
        }
        addMetaSchema(Q, $, X = this.opts.validateSchema) {
          return this.addSchema(Q, $, true, X), this;
        }
        validateSchema(Q, $) {
          if (typeof Q == "boolean") return true;
          let X;
          if (X = Q.$schema, X !== void 0 && typeof X != "string") throw Error("$schema must be a string");
          if (X = X || this.opts.defaultMeta || this.defaultMeta(), !X) return this.logger.warn("meta-schema not available"), this.errors = null, true;
          let Y = this.validate(X, Q);
          if (!Y && $) {
            let J = "schema is invalid: " + this.errorsText();
            if (this.opts.validateSchema === "log") this.logger.error(J);
            else throw Error(J);
          }
          return Y;
        }
        getSchema(Q) {
          let $;
          while (typeof ($ = CB.call(this, Q)) == "string") Q = $;
          if ($ === void 0) {
            let { schemaId: X } = this.opts, Y = new _9.SchemaEnv({ schema: {}, schemaId: X });
            if ($ = _9.resolveSchema.call(this, Y, Q), !$) return;
            this.refs[Q] = $;
          }
          return $.validate || this._compileSchemaEnv($);
        }
        removeSchema(Q) {
          if (Q instanceof RegExp) return this._removeAllSchemas(this.schemas, Q), this._removeAllSchemas(this.refs, Q), this;
          switch (typeof Q) {
            case "undefined":
              return this._removeAllSchemas(this.schemas), this._removeAllSchemas(this.refs), this._cache.clear(), this;
            case "string": {
              let $ = CB.call(this, Q);
              if (typeof $ == "object") this._cache.delete($.schema);
              return delete this.schemas[Q], delete this.refs[Q], this;
            }
            case "object": {
              let $ = Q;
              this._cache.delete($);
              let X = Q[this.opts.schemaId];
              if (X) X = (0, k9.normalizeId)(X), delete this.schemas[X], delete this.refs[X];
              return this;
            }
            default:
              throw Error("ajv.removeSchema: invalid parameter");
          }
        }
        addVocabulary(Q) {
          for (let $ of Q) this.addKeyword($);
          return this;
        }
        addKeyword(Q, $) {
          let X;
          if (typeof Q == "string") {
            if (X = Q, typeof $ == "object") this.logger.warn("these parameters are deprecated, see docs for addKeyword"), $.keyword = X;
          } else if (typeof Q == "object" && $ === void 0) {
            if ($ = Q, X = $.keyword, Array.isArray(X) && !X.length) throw Error("addKeywords: keyword must be string or non-empty array");
          } else throw Error("invalid addKeywords parameters");
          if ($R.call(this, X, $), !$) return (0, I7.eachItem)(X, (J) => R7.call(this, J)), this;
          YR.call(this, $);
          let Y = { ...$, type: (0, MQ.getJSONTypes)($.type), schemaType: (0, MQ.getJSONTypes)($.schemaType) };
          return (0, I7.eachItem)(X, Y.type.length === 0 ? (J) => R7.call(this, J, Y) : (J) => Y.type.forEach((G) => R7.call(this, J, Y, G))), this;
        }
        getKeyword(Q) {
          let $ = this.RULES.all[Q];
          return typeof $ == "object" ? $.definition : !!$;
        }
        removeKeyword(Q) {
          let { RULES: $ } = this;
          delete $.keywords[Q], delete $.all[Q];
          for (let X of $.rules) {
            let Y = X.rules.findIndex((J) => J.keyword === Q);
            if (Y >= 0) X.rules.splice(Y, 1);
          }
          return this;
        }
        addFormat(Q, $) {
          if (typeof $ == "string") $ = new RegExp($);
          return this.formats[Q] = $, this;
        }
        errorsText(Q = this.errors, { separator: $ = ", ", dataVar: X = "data" } = {}) {
          if (!Q || Q.length === 0) return "No errors";
          return Q.map((Y) => `${X}${Y.instancePath} ${Y.message}`).reduce((Y, J) => Y + $ + J);
        }
        $dataMetaSchema(Q, $) {
          let X = this.RULES.all;
          Q = JSON.parse(JSON.stringify(Q));
          for (let Y of $) {
            let J = Y.split("/").slice(1), G = Q;
            for (let W of J) G = G[W];
            for (let W in X) {
              let H = X[W];
              if (typeof H != "object") continue;
              let { $data: B } = H.definition, z = G[W];
              if (B && z) G[W] = kB(z);
            }
          }
          return Q;
        }
        _removeAllSchemas(Q, $) {
          for (let X in Q) {
            let Y = Q[X];
            if (!$ || $.test(X)) {
              if (typeof Y == "string") delete Q[X];
              else if (Y && !Y.meta) this._cache.delete(Y.schema), delete Q[X];
            }
          }
        }
        _addSchema(Q, $, X, Y = this.opts.validateSchema, J = this.opts.addUsedSchema) {
          let G, { schemaId: W } = this.opts;
          if (typeof Q == "object") G = Q[W];
          else if (this.opts.jtd) throw Error("schema must be object");
          else if (typeof Q != "boolean") throw Error("schema must be object or boolean");
          let H = this._cache.get(Q);
          if (H !== void 0) return H;
          X = (0, k9.normalizeId)(G || X);
          let B = k9.getSchemaRefs.call(this, Q, X);
          if (H = new _9.SchemaEnv({ schema: Q, schemaId: W, meta: $, baseId: X, localRefs: B }), this._cache.set(H.schema, H), J && !X.startsWith("#")) {
            if (X) this._checkUnique(X);
            this.refs[X] = H;
          }
          if (Y) this.validateSchema(Q, true);
          return H;
        }
        _checkUnique(Q) {
          if (this.schemas[Q] || this.refs[Q]) throw Error(`schema with key or id "${Q}" already exists`);
        }
        _compileSchemaEnv(Q) {
          if (Q.meta) this._compileMetaSchema(Q);
          else _9.compileSchema.call(this, Q);
          if (!Q.validate) throw Error("ajv implementation error");
          return Q.validate;
        }
        _compileMetaSchema(Q) {
          let $ = this.opts;
          this.opts = this._metaOpts;
          try {
            _9.compileSchema.call(this, Q);
          } finally {
            this.opts = $;
          }
        }
      }
      AQ.ValidationError = f2.default;
      AQ.MissingRefError = SB.default;
      x1.default = AQ;
      function ZB(Q, $, X, Y = "error") {
        for (let J in Q) {
          let G = J;
          if (G in $) this.logger[Y](`${X}: option ${J}. ${Q[G]}`);
        }
      }
      function CB(Q) {
        return Q = (0, k9.normalizeId)(Q), this.schemas[Q] || this.refs[Q];
      }
      function o2() {
        let Q = this.opts.schemas;
        if (!Q) return;
        if (Array.isArray(Q)) this.addSchema(Q);
        else for (let $ in Q) this.addSchema(Q[$], $);
      }
      function r2() {
        for (let Q in this.opts.formats) {
          let $ = this.opts.formats[Q];
          if ($) this.addFormat(Q, $);
        }
      }
      function t2(Q) {
        if (Array.isArray(Q)) {
          this.addVocabulary(Q);
          return;
        }
        this.logger.warn("keywords option as map is deprecated, pass array");
        for (let $ in Q) {
          let X = Q[$];
          if (!X.keyword) X.keyword = $;
          this.addKeyword(X);
        }
      }
      function a2() {
        let Q = { ...this.opts };
        for (let $ of c2) delete Q[$];
        return Q;
      }
      var s2 = { log() {
      }, warn() {
      }, error() {
      } };
      function e2(Q) {
        if (Q === false) return s2;
        if (Q === void 0) return console;
        if (Q.log && Q.warn && Q.error) return Q;
        throw Error("logger must implement log, warn and error methods");
      }
      var QR = /^[a-z_$][a-z0-9_$:-]*$/i;
      function $R(Q, $) {
        let { RULES: X } = this;
        if ((0, I7.eachItem)(Q, (Y) => {
          if (X.keywords[Y]) throw Error(`Keyword ${Y} is already defined`);
          if (!QR.test(Y)) throw Error(`Keyword ${Y} has invalid name`);
        }), !$) return;
        if ($.$data && !("code" in $ || "validate" in $)) throw Error('$data keyword must have "code" or "validate" function');
      }
      function R7(Q, $, X) {
        var Y;
        let J = $ === null || $ === void 0 ? void 0 : $.post;
        if (X && J) throw Error('keyword with "post" flag cannot have "type"');
        let { RULES: G } = this, W = J ? G.post : G.rules.find(({ type: B }) => B === X);
        if (!W) W = { type: X, rules: [] }, G.rules.push(W);
        if (G.keywords[Q] = true, !$) return;
        let H = { keyword: Q, definition: { ...$, type: (0, MQ.getJSONTypes)($.type), schemaType: (0, MQ.getJSONTypes)($.schemaType) } };
        if ($.before) XR.call(this, W, H, $.before);
        else W.rules.push(H);
        G.all[Q] = H, (Y = $.implements) === null || Y === void 0 || Y.forEach((B) => this.addKeyword(B));
      }
      function XR(Q, $, X) {
        let Y = Q.rules.findIndex((J) => J.keyword === X);
        if (Y >= 0) Q.rules.splice(Y, 0, $);
        else Q.rules.push($), this.logger.warn(`rule ${X} is not defined`);
      }
      function YR(Q) {
        let { metaSchema: $ } = Q;
        if ($ === void 0) return;
        if (Q.$data && this.opts.$data) $ = kB($);
        Q.validateSchema = this.compile($, true);
      }
      var JR = { $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#" };
      function kB(Q) {
        return { anyOf: [Q, JR] };
      }
    });
    xB = P((TB) => {
      Object.defineProperty(TB, "__esModule", { value: true });
      var HR = { keyword: "id", code() {
        throw Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      } };
      TB.default = HR;
    });
    mB = P((fB) => {
      Object.defineProperty(fB, "__esModule", { value: true });
      fB.callRef = fB.getValidate = void 0;
      var zR = Z9(), yB = e0(), f0 = c(), P4 = k1(), gB = NQ(), jQ = a(), KR = { keyword: "$ref", schemaType: "string", code(Q) {
        let { gen: $, schema: X, it: Y } = Q, { baseId: J, schemaEnv: G, validateName: W, opts: H, self: B } = Y, { root: z } = G;
        if ((X === "#" || X === "#/") && J === z.baseId) return U();
        let K = gB.resolveRef.call(B, z, J, X);
        if (K === void 0) throw new zR.default(Y.opts.uriResolver, J, X);
        if (K instanceof gB.SchemaEnv) return q(K);
        return V(K);
        function U() {
          if (G === z) return RQ(Q, W, G, G.$async);
          let L = $.scopeValue("root", { ref: z });
          return RQ(Q, f0._`${L}.validate`, z, z.$async);
        }
        function q(L) {
          let F = hB(Q, L);
          RQ(Q, F, L, L.$async);
        }
        function V(L) {
          let F = $.scopeValue("schema", H.code.source === true ? { ref: L, code: (0, f0.stringify)(L) } : { ref: L }), w = $.name("valid"), D = Q.subschema({ schema: L, dataTypes: [], schemaPath: f0.nil, topSchemaRef: F, errSchemaPath: X }, w);
          Q.mergeEvaluated(D), Q.ok(w);
        }
      } };
      function hB(Q, $) {
        let { gen: X } = Q;
        return $.validate ? X.scopeValue("validate", { ref: $.validate }) : f0._`${X.scopeValue("wrapper", { ref: $ })}.validate`;
      }
      fB.getValidate = hB;
      function RQ(Q, $, X, Y) {
        let { gen: J, it: G } = Q, { allErrors: W, schemaEnv: H, opts: B } = G, z = B.passContext ? P4.default.this : f0.nil;
        if (Y) K();
        else U();
        function K() {
          if (!H.$async) throw Error("async schema referenced by sync schema");
          let L = J.let("valid");
          J.try(() => {
            if (J.code(f0._`await ${(0, yB.callValidateCode)(Q, $, z)}`), V($), !W) J.assign(L, true);
          }, (F) => {
            if (J.if(f0._`!(${F} instanceof ${G.ValidationError})`, () => J.throw(F)), q(F), !W) J.assign(L, false);
          }), Q.ok(L);
        }
        function U() {
          Q.result((0, yB.callValidateCode)(Q, $, z), () => V($), () => q($));
        }
        function q(L) {
          let F = f0._`${L}.errors`;
          J.assign(P4.default.vErrors, f0._`${P4.default.vErrors} === null ? ${F} : ${P4.default.vErrors}.concat(${F})`), J.assign(P4.default.errors, f0._`${P4.default.vErrors}.length`);
        }
        function V(L) {
          var F;
          if (!G.opts.unevaluated) return;
          let w = (F = X === null || X === void 0 ? void 0 : X.validate) === null || F === void 0 ? void 0 : F.evaluated;
          if (G.props !== true) if (w && !w.dynamicProps) {
            if (w.props !== void 0) G.props = jQ.mergeEvaluated.props(J, w.props, G.props);
          } else {
            let D = J.var("props", f0._`${L}.evaluated.props`);
            G.props = jQ.mergeEvaluated.props(J, D, G.props, f0.Name);
          }
          if (G.items !== true) if (w && !w.dynamicItems) {
            if (w.items !== void 0) G.items = jQ.mergeEvaluated.items(J, w.items, G.items);
          } else {
            let D = J.var("items", f0._`${L}.evaluated.items`);
            G.items = jQ.mergeEvaluated.items(J, D, G.items, f0.Name);
          }
        }
      }
      fB.callRef = RQ;
      fB.default = KR;
    });
    cB = P((lB) => {
      Object.defineProperty(lB, "__esModule", { value: true });
      var UR = xB(), LR = mB(), FR = ["$schema", "$id", "$defs", "$vocabulary", { keyword: "$comment" }, "definitions", UR.default, LR.default];
      lB.default = FR;
    });
    dB = P((pB) => {
      Object.defineProperty(pB, "__esModule", { value: true });
      var IQ = c(), G6 = IQ.operators, EQ = { maximum: { okStr: "<=", ok: G6.LTE, fail: G6.GT }, minimum: { okStr: ">=", ok: G6.GTE, fail: G6.LT }, exclusiveMaximum: { okStr: "<", ok: G6.LT, fail: G6.GTE }, exclusiveMinimum: { okStr: ">", ok: G6.GT, fail: G6.LTE } }, OR = { message: ({ keyword: Q, schemaCode: $ }) => IQ.str`must be ${EQ[Q].okStr} ${$}`, params: ({ keyword: Q, schemaCode: $ }) => IQ._`{comparison: ${EQ[Q].okStr}, limit: ${$}}` }, DR = { keyword: Object.keys(EQ), type: "number", schemaType: "number", $data: true, error: OR, code(Q) {
        let { keyword: $, data: X, schemaCode: Y } = Q;
        Q.fail$data(IQ._`${X} ${EQ[$].fail} ${Y} || isNaN(${X})`);
      } };
      pB.default = DR;
    });
    nB = P((iB) => {
      Object.defineProperty(iB, "__esModule", { value: true });
      var v9 = c(), MR = { message: ({ schemaCode: Q }) => v9.str`must be multiple of ${Q}`, params: ({ schemaCode: Q }) => v9._`{multipleOf: ${Q}}` }, AR = { keyword: "multipleOf", type: "number", schemaType: "number", $data: true, error: MR, code(Q) {
        let { gen: $, data: X, schemaCode: Y, it: J } = Q, G = J.opts.multipleOfPrecision, W = $.let("res"), H = G ? v9._`Math.abs(Math.round(${W}) - ${W}) > 1e-${G}` : v9._`${W} !== parseInt(${W})`;
        Q.fail$data(v9._`(${Y} === 0 || (${W} = ${X}/${Y}, ${H}))`);
      } };
      iB.default = AR;
    });
    tB = P((rB) => {
      Object.defineProperty(rB, "__esModule", { value: true });
      function oB(Q) {
        let $ = Q.length, X = 0, Y = 0, J;
        while (Y < $) if (X++, J = Q.charCodeAt(Y++), J >= 55296 && J <= 56319 && Y < $) {
          if (J = Q.charCodeAt(Y), (J & 64512) === 56320) Y++;
        }
        return X;
      }
      rB.default = oB;
      oB.code = 'require("ajv/dist/runtime/ucs2length").default';
    });
    sB = P((aB) => {
      Object.defineProperty(aB, "__esModule", { value: true });
      var _6 = c(), IR = a(), ER = tB(), PR = { message({ keyword: Q, schemaCode: $ }) {
        let X = Q === "maxLength" ? "more" : "fewer";
        return _6.str`must NOT have ${X} than ${$} characters`;
      }, params: ({ schemaCode: Q }) => _6._`{limit: ${Q}}` }, bR = { keyword: ["maxLength", "minLength"], type: "string", schemaType: "number", $data: true, error: PR, code(Q) {
        let { keyword: $, data: X, schemaCode: Y, it: J } = Q, G = $ === "maxLength" ? _6.operators.GT : _6.operators.LT, W = J.opts.unicode === false ? _6._`${X}.length` : _6._`${(0, IR.useFunc)(Q.gen, ER.default)}(${X})`;
        Q.fail$data(_6._`${W} ${G} ${Y}`);
      } };
      aB.default = bR;
    });
    Qz = P((eB) => {
      Object.defineProperty(eB, "__esModule", { value: true });
      var CR = e0(), PQ = c(), SR = { message: ({ schemaCode: Q }) => PQ.str`must match pattern "${Q}"`, params: ({ schemaCode: Q }) => PQ._`{pattern: ${Q}}` }, _R = { keyword: "pattern", type: "string", schemaType: "string", $data: true, error: SR, code(Q) {
        let { data: $, $data: X, schema: Y, schemaCode: J, it: G } = Q, W = G.opts.unicodeRegExp ? "u" : "", H = X ? PQ._`(new RegExp(${J}, ${W}))` : (0, CR.usePattern)(Q, Y);
        Q.fail$data(PQ._`!${H}.test(${$})`);
      } };
      eB.default = _R;
    });
    Xz = P(($z) => {
      Object.defineProperty($z, "__esModule", { value: true });
      var T9 = c(), vR = { message({ keyword: Q, schemaCode: $ }) {
        let X = Q === "maxProperties" ? "more" : "fewer";
        return T9.str`must NOT have ${X} than ${$} properties`;
      }, params: ({ schemaCode: Q }) => T9._`{limit: ${Q}}` }, TR = { keyword: ["maxProperties", "minProperties"], type: "object", schemaType: "number", $data: true, error: vR, code(Q) {
        let { keyword: $, data: X, schemaCode: Y } = Q, J = $ === "maxProperties" ? T9.operators.GT : T9.operators.LT;
        Q.fail$data(T9._`Object.keys(${X}).length ${J} ${Y}`);
      } };
      $z.default = TR;
    });
    Jz = P((Yz) => {
      Object.defineProperty(Yz, "__esModule", { value: true });
      var x9 = e0(), y9 = c(), yR = a(), gR = { message: ({ params: { missingProperty: Q } }) => y9.str`must have required property '${Q}'`, params: ({ params: { missingProperty: Q } }) => y9._`{missingProperty: ${Q}}` }, hR = { keyword: "required", type: "object", schemaType: "array", $data: true, error: gR, code(Q) {
        let { gen: $, schema: X, schemaCode: Y, data: J, $data: G, it: W } = Q, { opts: H } = W;
        if (!G && X.length === 0) return;
        let B = X.length >= H.loopRequired;
        if (W.allErrors) z();
        else K();
        if (H.strictRequired) {
          let V = Q.parentSchema.properties, { definedProperties: L } = Q.it;
          for (let F of X) if ((V === null || V === void 0 ? void 0 : V[F]) === void 0 && !L.has(F)) {
            let w = W.schemaEnv.baseId + W.errSchemaPath, D = `required property "${F}" is not defined at "${w}" (strictRequired)`;
            (0, yR.checkStrictMode)(W, D, W.opts.strictRequired);
          }
        }
        function z() {
          if (B || G) Q.block$data(y9.nil, U);
          else for (let V of X) (0, x9.checkReportMissingProp)(Q, V);
        }
        function K() {
          let V = $.let("missing");
          if (B || G) {
            let L = $.let("valid", true);
            Q.block$data(L, () => q(V, L)), Q.ok(L);
          } else $.if((0, x9.checkMissingProp)(Q, X, V)), (0, x9.reportMissingProp)(Q, V), $.else();
        }
        function U() {
          $.forOf("prop", Y, (V) => {
            Q.setParams({ missingProperty: V }), $.if((0, x9.noPropertyInData)($, J, V, H.ownProperties), () => Q.error());
          });
        }
        function q(V, L) {
          Q.setParams({ missingProperty: V }), $.forOf(V, Y, () => {
            $.assign(L, (0, x9.propertyInData)($, J, V, H.ownProperties)), $.if((0, y9.not)(L), () => {
              Q.error(), $.break();
            });
          }, y9.nil);
        }
      } };
      Yz.default = hR;
    });
    Wz = P((Gz) => {
      Object.defineProperty(Gz, "__esModule", { value: true });
      var g9 = c(), uR = { message({ keyword: Q, schemaCode: $ }) {
        let X = Q === "maxItems" ? "more" : "fewer";
        return g9.str`must NOT have ${X} than ${$} items`;
      }, params: ({ schemaCode: Q }) => g9._`{limit: ${Q}}` }, mR = { keyword: ["maxItems", "minItems"], type: "array", schemaType: "number", $data: true, error: uR, code(Q) {
        let { keyword: $, data: X, schemaCode: Y } = Q, J = $ === "maxItems" ? g9.operators.GT : g9.operators.LT;
        Q.fail$data(g9._`${X}.length ${J} ${Y}`);
      } };
      Gz.default = mR;
    });
    bQ = P((Bz) => {
      Object.defineProperty(Bz, "__esModule", { value: true });
      var Hz = K7();
      Hz.code = 'require("ajv/dist/runtime/equal").default';
      Bz.default = Hz;
    });
    Kz = P((zz) => {
      Object.defineProperty(zz, "__esModule", { value: true });
      var E7 = R9(), P0 = c(), pR = a(), dR = bQ(), iR = { message: ({ params: { i: Q, j: $ } }) => P0.str`must NOT have duplicate items (items ## ${$} and ${Q} are identical)`, params: ({ params: { i: Q, j: $ } }) => P0._`{i: ${Q}, j: ${$}}` }, nR = { keyword: "uniqueItems", type: "array", schemaType: "boolean", $data: true, error: iR, code(Q) {
        let { gen: $, data: X, $data: Y, schema: J, parentSchema: G, schemaCode: W, it: H } = Q;
        if (!Y && !J) return;
        let B = $.let("valid"), z = G.items ? (0, E7.getSchemaTypes)(G.items) : [];
        Q.block$data(B, K, P0._`${W} === false`), Q.ok(B);
        function K() {
          let L = $.let("i", P0._`${X}.length`), F = $.let("j");
          Q.setParams({ i: L, j: F }), $.assign(B, true), $.if(P0._`${L} > 1`, () => (U() ? q : V)(L, F));
        }
        function U() {
          return z.length > 0 && !z.some((L) => L === "object" || L === "array");
        }
        function q(L, F) {
          let w = $.name("item"), D = (0, E7.checkDataTypes)(z, w, H.opts.strictNumbers, E7.DataType.Wrong), M = $.const("indices", P0._`{}`);
          $.for(P0._`;${L}--;`, () => {
            if ($.let(w, P0._`${X}[${L}]`), $.if(D, P0._`continue`), z.length > 1) $.if(P0._`typeof ${w} == "string"`, P0._`${w} += "_"`);
            $.if(P0._`typeof ${M}[${w}] == "number"`, () => {
              $.assign(F, P0._`${M}[${w}]`), Q.error(), $.assign(B, false).break();
            }).code(P0._`${M}[${w}] = ${L}`);
          });
        }
        function V(L, F) {
          let w = (0, pR.useFunc)($, dR.default), D = $.name("outer");
          $.label(D).for(P0._`;${L}--;`, () => $.for(P0._`${F} = ${L}; ${F}--;`, () => $.if(P0._`${w}(${X}[${L}], ${X}[${F}])`, () => {
            Q.error(), $.assign(B, false).break(D);
          })));
        }
      } };
      zz.default = nR;
    });
    qz = P((Vz) => {
      Object.defineProperty(Vz, "__esModule", { value: true });
      var P7 = c(), rR = a(), tR = bQ(), aR = { message: "must be equal to constant", params: ({ schemaCode: Q }) => P7._`{allowedValue: ${Q}}` }, sR = { keyword: "const", $data: true, error: aR, code(Q) {
        let { gen: $, data: X, $data: Y, schemaCode: J, schema: G } = Q;
        if (Y || G && typeof G == "object") Q.fail$data(P7._`!${(0, rR.useFunc)($, tR.default)}(${X}, ${J})`);
        else Q.fail(P7._`${G} !== ${X}`);
      } };
      Vz.default = sR;
    });
    Lz = P((Uz) => {
      Object.defineProperty(Uz, "__esModule", { value: true });
      var h9 = c(), QI = a(), $I = bQ(), XI = { message: "must be equal to one of the allowed values", params: ({ schemaCode: Q }) => h9._`{allowedValues: ${Q}}` }, YI = { keyword: "enum", schemaType: "array", $data: true, error: XI, code(Q) {
        let { gen: $, data: X, $data: Y, schema: J, schemaCode: G, it: W } = Q;
        if (!Y && J.length === 0) throw Error("enum must have non-empty array");
        let H = J.length >= W.opts.loopEnum, B, z = () => B !== null && B !== void 0 ? B : B = (0, QI.useFunc)($, $I.default), K;
        if (H || Y) K = $.let("valid"), Q.block$data(K, U);
        else {
          if (!Array.isArray(J)) throw Error("ajv implementation error");
          let V = $.const("vSchema", G);
          K = (0, h9.or)(...J.map((L, F) => q(V, F)));
        }
        Q.pass(K);
        function U() {
          $.assign(K, false), $.forOf("v", G, (V) => $.if(h9._`${z()}(${X}, ${V})`, () => $.assign(K, true).break()));
        }
        function q(V, L) {
          let F = J[L];
          return typeof F === "object" && F !== null ? h9._`${z()}(${X}, ${V}[${L}])` : h9._`${X} === ${F}`;
        }
      } };
      Uz.default = YI;
    });
    Nz = P((Fz) => {
      Object.defineProperty(Fz, "__esModule", { value: true });
      var GI = dB(), WI = nB(), HI = sB(), BI = Qz(), zI = Xz(), KI = Jz(), VI = Wz(), qI = Kz(), UI = qz(), LI = Lz(), FI = [GI.default, WI.default, HI.default, BI.default, zI.default, KI.default, VI.default, qI.default, { keyword: "type", schemaType: ["string", "array"] }, { keyword: "nullable", schemaType: "boolean" }, UI.default, LI.default];
      Fz.default = FI;
    });
    Z7 = P((Dz) => {
      Object.defineProperty(Dz, "__esModule", { value: true });
      Dz.validateAdditionalItems = void 0;
      var k6 = c(), b7 = a(), OI = { message: ({ params: { len: Q } }) => k6.str`must NOT have more than ${Q} items`, params: ({ params: { len: Q } }) => k6._`{limit: ${Q}}` }, DI = { keyword: "additionalItems", type: "array", schemaType: ["boolean", "object"], before: "uniqueItems", error: OI, code(Q) {
        let { parentSchema: $, it: X } = Q, { items: Y } = $;
        if (!Array.isArray(Y)) {
          (0, b7.checkStrictMode)(X, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        Oz(Q, Y);
      } };
      function Oz(Q, $) {
        let { gen: X, schema: Y, data: J, keyword: G, it: W } = Q;
        W.items = true;
        let H = X.const("len", k6._`${J}.length`);
        if (Y === false) Q.setParams({ len: $.length }), Q.pass(k6._`${H} <= ${$.length}`);
        else if (typeof Y == "object" && !(0, b7.alwaysValidSchema)(W, Y)) {
          let z = X.var("valid", k6._`${H} <= ${$.length}`);
          X.if((0, k6.not)(z), () => B(z)), Q.ok(z);
        }
        function B(z) {
          X.forRange("i", $.length, H, (K) => {
            if (Q.subschema({ keyword: G, dataProp: K, dataPropType: b7.Type.Num }, z), !W.allErrors) X.if((0, k6.not)(z), () => X.break());
          });
        }
      }
      Dz.validateAdditionalItems = Oz;
      Dz.default = DI;
    });
    C7 = P((jz) => {
      Object.defineProperty(jz, "__esModule", { value: true });
      jz.validateTuple = void 0;
      var Mz = c(), ZQ = a(), MI = e0(), AI = { keyword: "items", type: "array", schemaType: ["object", "array", "boolean"], before: "uniqueItems", code(Q) {
        let { schema: $, it: X } = Q;
        if (Array.isArray($)) return Az(Q, "additionalItems", $);
        if (X.items = true, (0, ZQ.alwaysValidSchema)(X, $)) return;
        Q.ok((0, MI.validateArray)(Q));
      } };
      function Az(Q, $, X = Q.schema) {
        let { gen: Y, parentSchema: J, data: G, keyword: W, it: H } = Q;
        if (K(J), H.opts.unevaluated && X.length && H.items !== true) H.items = ZQ.mergeEvaluated.items(Y, X.length, H.items);
        let B = Y.name("valid"), z = Y.const("len", Mz._`${G}.length`);
        X.forEach((U, q) => {
          if ((0, ZQ.alwaysValidSchema)(H, U)) return;
          Y.if(Mz._`${z} > ${q}`, () => Q.subschema({ keyword: W, schemaProp: q, dataProp: q }, B)), Q.ok(B);
        });
        function K(U) {
          let { opts: q, errSchemaPath: V } = H, L = X.length, F = L === U.minItems && (L === U.maxItems || U[$] === false);
          if (q.strictTuples && !F) {
            let w = `"${W}" is ${L}-tuple, but minItems or maxItems/${$} are not specified or different at path "${V}"`;
            (0, ZQ.checkStrictMode)(H, w, q.strictTuples);
          }
        }
      }
      jz.validateTuple = Az;
      jz.default = AI;
    });
    Ez = P((Iz) => {
      Object.defineProperty(Iz, "__esModule", { value: true });
      var RI = C7(), II = { keyword: "prefixItems", type: "array", schemaType: ["array"], before: "uniqueItems", code: (Q) => (0, RI.validateTuple)(Q, "items") };
      Iz.default = II;
    });
    Zz = P((bz) => {
      Object.defineProperty(bz, "__esModule", { value: true });
      var Pz = c(), PI = a(), bI = e0(), ZI = Z7(), CI = { message: ({ params: { len: Q } }) => Pz.str`must NOT have more than ${Q} items`, params: ({ params: { len: Q } }) => Pz._`{limit: ${Q}}` }, SI = { keyword: "items", type: "array", schemaType: ["object", "boolean"], before: "uniqueItems", error: CI, code(Q) {
        let { schema: $, parentSchema: X, it: Y } = Q, { prefixItems: J } = X;
        if (Y.items = true, (0, PI.alwaysValidSchema)(Y, $)) return;
        if (J) (0, ZI.validateAdditionalItems)(Q, J);
        else Q.ok((0, bI.validateArray)(Q));
      } };
      bz.default = SI;
    });
    Sz = P((Cz) => {
      Object.defineProperty(Cz, "__esModule", { value: true });
      var Q1 = c(), CQ = a(), kI = { message: ({ params: { min: Q, max: $ } }) => $ === void 0 ? Q1.str`must contain at least ${Q} valid item(s)` : Q1.str`must contain at least ${Q} and no more than ${$} valid item(s)`, params: ({ params: { min: Q, max: $ } }) => $ === void 0 ? Q1._`{minContains: ${Q}}` : Q1._`{minContains: ${Q}, maxContains: ${$}}` }, vI = { keyword: "contains", type: "array", schemaType: ["object", "boolean"], before: "uniqueItems", trackErrors: true, error: kI, code(Q) {
        let { gen: $, schema: X, parentSchema: Y, data: J, it: G } = Q, W, H, { minContains: B, maxContains: z } = Y;
        if (G.opts.next) W = B === void 0 ? 1 : B, H = z;
        else W = 1;
        let K = $.const("len", Q1._`${J}.length`);
        if (Q.setParams({ min: W, max: H }), H === void 0 && W === 0) {
          (0, CQ.checkStrictMode)(G, '"minContains" == 0 without "maxContains": "contains" keyword ignored');
          return;
        }
        if (H !== void 0 && W > H) {
          (0, CQ.checkStrictMode)(G, '"minContains" > "maxContains" is always invalid'), Q.fail();
          return;
        }
        if ((0, CQ.alwaysValidSchema)(G, X)) {
          let F = Q1._`${K} >= ${W}`;
          if (H !== void 0) F = Q1._`${F} && ${K} <= ${H}`;
          Q.pass(F);
          return;
        }
        G.items = true;
        let U = $.name("valid");
        if (H === void 0 && W === 1) V(U, () => $.if(U, () => $.break()));
        else if (W === 0) {
          if ($.let(U, true), H !== void 0) $.if(Q1._`${J}.length > 0`, q);
        } else $.let(U, false), q();
        Q.result(U, () => Q.reset());
        function q() {
          let F = $.name("_valid"), w = $.let("count", 0);
          V(F, () => $.if(F, () => L(w)));
        }
        function V(F, w) {
          $.forRange("i", 0, K, (D) => {
            Q.subschema({ keyword: "contains", dataProp: D, dataPropType: CQ.Type.Num, compositeRule: true }, F), w();
          });
        }
        function L(F) {
          if ($.code(Q1._`${F}++`), H === void 0) $.if(Q1._`${F} >= ${W}`, () => $.assign(U, true).break());
          else if ($.if(Q1._`${F} > ${H}`, () => $.assign(U, false).break()), W === 1) $.assign(U, true);
          else $.if(Q1._`${F} >= ${W}`, () => $.assign(U, true));
        }
      } };
      Cz.default = vI;
    });
    yz = P((vz) => {
      Object.defineProperty(vz, "__esModule", { value: true });
      vz.validateSchemaDeps = vz.validatePropertyDeps = vz.error = void 0;
      var S7 = c(), xI = a(), f9 = e0();
      vz.error = { message: ({ params: { property: Q, depsCount: $, deps: X } }) => {
        let Y = $ === 1 ? "property" : "properties";
        return S7.str`must have ${Y} ${X} when property ${Q} is present`;
      }, params: ({ params: { property: Q, depsCount: $, deps: X, missingProperty: Y } }) => S7._`{property: ${Q},
    missingProperty: ${Y},
    depsCount: ${$},
    deps: ${X}}` };
      var yI = { keyword: "dependencies", type: "object", schemaType: "object", error: vz.error, code(Q) {
        let [$, X] = gI(Q);
        _z(Q, $), kz(Q, X);
      } };
      function gI({ schema: Q }) {
        let $ = {}, X = {};
        for (let Y in Q) {
          if (Y === "__proto__") continue;
          let J = Array.isArray(Q[Y]) ? $ : X;
          J[Y] = Q[Y];
        }
        return [$, X];
      }
      function _z(Q, $ = Q.schema) {
        let { gen: X, data: Y, it: J } = Q;
        if (Object.keys($).length === 0) return;
        let G = X.let("missing");
        for (let W in $) {
          let H = $[W];
          if (H.length === 0) continue;
          let B = (0, f9.propertyInData)(X, Y, W, J.opts.ownProperties);
          if (Q.setParams({ property: W, depsCount: H.length, deps: H.join(", ") }), J.allErrors) X.if(B, () => {
            for (let z of H) (0, f9.checkReportMissingProp)(Q, z);
          });
          else X.if(S7._`${B} && (${(0, f9.checkMissingProp)(Q, H, G)})`), (0, f9.reportMissingProp)(Q, G), X.else();
        }
      }
      vz.validatePropertyDeps = _z;
      function kz(Q, $ = Q.schema) {
        let { gen: X, data: Y, keyword: J, it: G } = Q, W = X.name("valid");
        for (let H in $) {
          if ((0, xI.alwaysValidSchema)(G, $[H])) continue;
          X.if((0, f9.propertyInData)(X, Y, H, G.opts.ownProperties), () => {
            let B = Q.subschema({ keyword: J, schemaProp: H }, W);
            Q.mergeValidEvaluated(B, W);
          }, () => X.var(W, true)), Q.ok(W);
        }
      }
      vz.validateSchemaDeps = kz;
      vz.default = yI;
    });
    fz = P((hz) => {
      Object.defineProperty(hz, "__esModule", { value: true });
      var gz = c(), uI = a(), mI = { message: "property name must be valid", params: ({ params: Q }) => gz._`{propertyName: ${Q.propertyName}}` }, lI = { keyword: "propertyNames", type: "object", schemaType: ["object", "boolean"], error: mI, code(Q) {
        let { gen: $, schema: X, data: Y, it: J } = Q;
        if ((0, uI.alwaysValidSchema)(J, X)) return;
        let G = $.name("valid");
        $.forIn("key", Y, (W) => {
          Q.setParams({ propertyName: W }), Q.subschema({ keyword: "propertyNames", data: W, dataTypes: ["string"], propertyName: W, compositeRule: true }, G), $.if((0, gz.not)(G), () => {
            if (Q.error(true), !J.allErrors) $.break();
          });
        }), Q.ok(G);
      } };
      hz.default = lI;
    });
    _7 = P((uz) => {
      Object.defineProperty(uz, "__esModule", { value: true });
      var SQ = e0(), U1 = c(), pI = k1(), _Q = a(), dI = { message: "must NOT have additional properties", params: ({ params: Q }) => U1._`{additionalProperty: ${Q.additionalProperty}}` }, iI = { keyword: "additionalProperties", type: ["object"], schemaType: ["boolean", "object"], allowUndefined: true, trackErrors: true, error: dI, code(Q) {
        let { gen: $, schema: X, parentSchema: Y, data: J, errsCount: G, it: W } = Q;
        if (!G) throw Error("ajv implementation error");
        let { allErrors: H, opts: B } = W;
        if (W.props = true, B.removeAdditional !== "all" && (0, _Q.alwaysValidSchema)(W, X)) return;
        let z = (0, SQ.allSchemaProperties)(Y.properties), K = (0, SQ.allSchemaProperties)(Y.patternProperties);
        U(), Q.ok(U1._`${G} === ${pI.default.errors}`);
        function U() {
          $.forIn("key", J, (w) => {
            if (!z.length && !K.length) L(w);
            else $.if(q(w), () => L(w));
          });
        }
        function q(w) {
          let D;
          if (z.length > 8) {
            let M = (0, _Q.schemaRefOrVal)(W, Y.properties, "properties");
            D = (0, SQ.isOwnProperty)($, M, w);
          } else if (z.length) D = (0, U1.or)(...z.map((M) => U1._`${w} === ${M}`));
          else D = U1.nil;
          if (K.length) D = (0, U1.or)(D, ...K.map((M) => U1._`${(0, SQ.usePattern)(Q, M)}.test(${w})`));
          return (0, U1.not)(D);
        }
        function V(w) {
          $.code(U1._`delete ${J}[${w}]`);
        }
        function L(w) {
          if (B.removeAdditional === "all" || B.removeAdditional && X === false) {
            V(w);
            return;
          }
          if (X === false) {
            if (Q.setParams({ additionalProperty: w }), Q.error(), !H) $.break();
            return;
          }
          if (typeof X == "object" && !(0, _Q.alwaysValidSchema)(W, X)) {
            let D = $.name("valid");
            if (B.removeAdditional === "failing") F(w, D, false), $.if((0, U1.not)(D), () => {
              Q.reset(), V(w);
            });
            else if (F(w, D), !H) $.if((0, U1.not)(D), () => $.break());
          }
        }
        function F(w, D, M) {
          let R = { keyword: "additionalProperties", dataProp: w, dataPropType: _Q.Type.Str };
          if (M === false) Object.assign(R, { compositeRule: true, createErrors: false, allErrors: false });
          Q.subschema(R, D);
        }
      } };
      uz.default = iI;
    });
    pz = P((cz) => {
      Object.defineProperty(cz, "__esModule", { value: true });
      var oI = b9(), mz = e0(), k7 = a(), lz = _7(), rI = { keyword: "properties", type: "object", schemaType: "object", code(Q) {
        let { gen: $, schema: X, parentSchema: Y, data: J, it: G } = Q;
        if (G.opts.removeAdditional === "all" && Y.additionalProperties === void 0) lz.default.code(new oI.KeywordCxt(G, lz.default, "additionalProperties"));
        let W = (0, mz.allSchemaProperties)(X);
        for (let U of W) G.definedProperties.add(U);
        if (G.opts.unevaluated && W.length && G.props !== true) G.props = k7.mergeEvaluated.props($, (0, k7.toHash)(W), G.props);
        let H = W.filter((U) => !(0, k7.alwaysValidSchema)(G, X[U]));
        if (H.length === 0) return;
        let B = $.name("valid");
        for (let U of H) {
          if (z(U)) K(U);
          else {
            if ($.if((0, mz.propertyInData)($, J, U, G.opts.ownProperties)), K(U), !G.allErrors) $.else().var(B, true);
            $.endIf();
          }
          Q.it.definedProperties.add(U), Q.ok(B);
        }
        function z(U) {
          return G.opts.useDefaults && !G.compositeRule && X[U].default !== void 0;
        }
        function K(U) {
          Q.subschema({ keyword: "properties", schemaProp: U, dataProp: U }, B);
        }
      } };
      cz.default = rI;
    });
    rz = P((oz) => {
      Object.defineProperty(oz, "__esModule", { value: true });
      var dz = e0(), kQ = c(), iz = a(), nz = a(), aI = { keyword: "patternProperties", type: "object", schemaType: "object", code(Q) {
        let { gen: $, schema: X, data: Y, parentSchema: J, it: G } = Q, { opts: W } = G, H = (0, dz.allSchemaProperties)(X), B = H.filter((F) => (0, iz.alwaysValidSchema)(G, X[F]));
        if (H.length === 0 || B.length === H.length && (!G.opts.unevaluated || G.props === true)) return;
        let z = W.strictSchema && !W.allowMatchingProperties && J.properties, K = $.name("valid");
        if (G.props !== true && !(G.props instanceof kQ.Name)) G.props = (0, nz.evaluatedPropsToName)($, G.props);
        let { props: U } = G;
        q();
        function q() {
          for (let F of H) {
            if (z) V(F);
            if (G.allErrors) L(F);
            else $.var(K, true), L(F), $.if(K);
          }
        }
        function V(F) {
          for (let w in z) if (new RegExp(F).test(w)) (0, iz.checkStrictMode)(G, `property ${w} matches pattern ${F} (use allowMatchingProperties)`);
        }
        function L(F) {
          $.forIn("key", Y, (w) => {
            $.if(kQ._`${(0, dz.usePattern)(Q, F)}.test(${w})`, () => {
              let D = B.includes(F);
              if (!D) Q.subschema({ keyword: "patternProperties", schemaProp: F, dataProp: w, dataPropType: nz.Type.Str }, K);
              if (G.opts.unevaluated && U !== true) $.assign(kQ._`${U}[${w}]`, true);
              else if (!D && !G.allErrors) $.if((0, kQ.not)(K), () => $.break());
            });
          });
        }
      } };
      oz.default = aI;
    });
    az = P((tz) => {
      Object.defineProperty(tz, "__esModule", { value: true });
      var eI = a(), QE = { keyword: "not", schemaType: ["object", "boolean"], trackErrors: true, code(Q) {
        let { gen: $, schema: X, it: Y } = Q;
        if ((0, eI.alwaysValidSchema)(Y, X)) {
          Q.fail();
          return;
        }
        let J = $.name("valid");
        Q.subschema({ keyword: "not", compositeRule: true, createErrors: false, allErrors: false }, J), Q.failResult(J, () => Q.reset(), () => Q.error());
      }, error: { message: "must NOT be valid" } };
      tz.default = QE;
    });
    ez = P((sz) => {
      Object.defineProperty(sz, "__esModule", { value: true });
      var XE = e0(), YE = { keyword: "anyOf", schemaType: "array", trackErrors: true, code: XE.validateUnion, error: { message: "must match a schema in anyOf" } };
      sz.default = YE;
    });
    $K = P((QK) => {
      Object.defineProperty(QK, "__esModule", { value: true });
      var vQ = c(), GE = a(), WE = { message: "must match exactly one schema in oneOf", params: ({ params: Q }) => vQ._`{passingSchemas: ${Q.passing}}` }, HE = { keyword: "oneOf", schemaType: "array", trackErrors: true, error: WE, code(Q) {
        let { gen: $, schema: X, parentSchema: Y, it: J } = Q;
        if (!Array.isArray(X)) throw Error("ajv implementation error");
        if (J.opts.discriminator && Y.discriminator) return;
        let G = X, W = $.let("valid", false), H = $.let("passing", null), B = $.name("_valid");
        Q.setParams({ passing: H }), $.block(z), Q.result(W, () => Q.reset(), () => Q.error(true));
        function z() {
          G.forEach((K, U) => {
            let q;
            if ((0, GE.alwaysValidSchema)(J, K)) $.var(B, true);
            else q = Q.subschema({ keyword: "oneOf", schemaProp: U, compositeRule: true }, B);
            if (U > 0) $.if(vQ._`${B} && ${W}`).assign(W, false).assign(H, vQ._`[${H}, ${U}]`).else();
            $.if(B, () => {
              if ($.assign(W, true), $.assign(H, U), q) Q.mergeEvaluated(q, vQ.Name);
            });
          });
        }
      } };
      QK.default = HE;
    });
    YK = P((XK) => {
      Object.defineProperty(XK, "__esModule", { value: true });
      var zE = a(), KE = { keyword: "allOf", schemaType: "array", code(Q) {
        let { gen: $, schema: X, it: Y } = Q;
        if (!Array.isArray(X)) throw Error("ajv implementation error");
        let J = $.name("valid");
        X.forEach((G, W) => {
          if ((0, zE.alwaysValidSchema)(Y, G)) return;
          let H = Q.subschema({ keyword: "allOf", schemaProp: W }, J);
          Q.ok(J), Q.mergeEvaluated(H);
        });
      } };
      XK.default = KE;
    });
    HK = P((WK) => {
      Object.defineProperty(WK, "__esModule", { value: true });
      var TQ = c(), GK = a(), qE = { message: ({ params: Q }) => TQ.str`must match "${Q.ifClause}" schema`, params: ({ params: Q }) => TQ._`{failingKeyword: ${Q.ifClause}}` }, UE = { keyword: "if", schemaType: ["object", "boolean"], trackErrors: true, error: qE, code(Q) {
        let { gen: $, parentSchema: X, it: Y } = Q;
        if (X.then === void 0 && X.else === void 0) (0, GK.checkStrictMode)(Y, '"if" without "then" and "else" is ignored');
        let J = JK(Y, "then"), G = JK(Y, "else");
        if (!J && !G) return;
        let W = $.let("valid", true), H = $.name("_valid");
        if (B(), Q.reset(), J && G) {
          let K = $.let("ifClause");
          Q.setParams({ ifClause: K }), $.if(H, z("then", K), z("else", K));
        } else if (J) $.if(H, z("then"));
        else $.if((0, TQ.not)(H), z("else"));
        Q.pass(W, () => Q.error(true));
        function B() {
          let K = Q.subschema({ keyword: "if", compositeRule: true, createErrors: false, allErrors: false }, H);
          Q.mergeEvaluated(K);
        }
        function z(K, U) {
          return () => {
            let q = Q.subschema({ keyword: K }, H);
            if ($.assign(W, H), Q.mergeValidEvaluated(q, W), U) $.assign(U, TQ._`${K}`);
            else Q.setParams({ ifClause: K });
          };
        }
      } };
      function JK(Q, $) {
        let X = Q.schema[$];
        return X !== void 0 && !(0, GK.alwaysValidSchema)(Q, X);
      }
      WK.default = UE;
    });
    zK = P((BK) => {
      Object.defineProperty(BK, "__esModule", { value: true });
      var FE = a(), NE = { keyword: ["then", "else"], schemaType: ["object", "boolean"], code({ keyword: Q, parentSchema: $, it: X }) {
        if ($.if === void 0) (0, FE.checkStrictMode)(X, `"${Q}" without "if" is ignored`);
      } };
      BK.default = NE;
    });
    VK = P((KK) => {
      Object.defineProperty(KK, "__esModule", { value: true });
      var DE = Z7(), wE = Ez(), ME = C7(), AE = Zz(), jE = Sz(), RE = yz(), IE = fz(), EE = _7(), PE = pz(), bE = rz(), ZE = az(), CE = ez(), SE = $K(), _E = YK(), kE = HK(), vE = zK();
      function TE(Q = false) {
        let $ = [ZE.default, CE.default, SE.default, _E.default, kE.default, vE.default, IE.default, EE.default, RE.default, PE.default, bE.default];
        if (Q) $.push(wE.default, AE.default);
        else $.push(DE.default, ME.default);
        return $.push(jE.default), $;
      }
      KK.default = TE;
    });
    UK = P((qK) => {
      Object.defineProperty(qK, "__esModule", { value: true });
      var N0 = c(), yE = { message: ({ schemaCode: Q }) => N0.str`must match format "${Q}"`, params: ({ schemaCode: Q }) => N0._`{format: ${Q}}` }, gE = { keyword: "format", type: ["number", "string"], schemaType: "string", $data: true, error: yE, code(Q, $) {
        let { gen: X, data: Y, $data: J, schema: G, schemaCode: W, it: H } = Q, { opts: B, errSchemaPath: z, schemaEnv: K, self: U } = H;
        if (!B.validateFormats) return;
        if (J) q();
        else V();
        function q() {
          let L = X.scopeValue("formats", { ref: U.formats, code: B.code.formats }), F = X.const("fDef", N0._`${L}[${W}]`), w = X.let("fType"), D = X.let("format");
          X.if(N0._`typeof ${F} == "object" && !(${F} instanceof RegExp)`, () => X.assign(w, N0._`${F}.type || "string"`).assign(D, N0._`${F}.validate`), () => X.assign(w, N0._`"string"`).assign(D, F)), Q.fail$data((0, N0.or)(M(), R()));
          function M() {
            if (B.strictSchema === false) return N0.nil;
            return N0._`${W} && !${D}`;
          }
          function R() {
            let Z = K.$async ? N0._`(${F}.async ? await ${D}(${Y}) : ${D}(${Y}))` : N0._`${D}(${Y})`, v = N0._`(typeof ${D} == "function" ? ${Z} : ${D}.test(${Y}))`;
            return N0._`${D} && ${D} !== true && ${w} === ${$} && !${v}`;
          }
        }
        function V() {
          let L = U.formats[G];
          if (!L) {
            M();
            return;
          }
          if (L === true) return;
          let [F, w, D] = R(L);
          if (F === $) Q.pass(Z());
          function M() {
            if (B.strictSchema === false) {
              U.logger.warn(v());
              return;
            }
            throw Error(v());
            function v() {
              return `unknown format "${G}" ignored in schema at path "${z}"`;
            }
          }
          function R(v) {
            let O0 = v instanceof RegExp ? (0, N0.regexpCode)(v) : B.code.formats ? N0._`${B.code.formats}${(0, N0.getProperty)(G)}` : void 0, D0 = X.scopeValue("formats", { key: G, ref: v, code: O0 });
            if (typeof v == "object" && !(v instanceof RegExp)) return [v.type || "string", v.validate, N0._`${D0}.validate`];
            return ["string", v, D0];
          }
          function Z() {
            if (typeof L == "object" && !(L instanceof RegExp) && L.async) {
              if (!K.$async) throw Error("async format in sync schema");
              return N0._`await ${D}(${Y})`;
            }
            return typeof w == "function" ? N0._`${D}(${Y})` : N0._`${D}.test(${Y})`;
          }
        }
      } };
      qK.default = gE;
    });
    FK = P((LK) => {
      Object.defineProperty(LK, "__esModule", { value: true });
      var fE = UK(), uE = [fE.default];
      LK.default = uE;
    });
    DK = P((NK) => {
      Object.defineProperty(NK, "__esModule", { value: true });
      NK.contentVocabulary = NK.metadataVocabulary = void 0;
      NK.metadataVocabulary = ["title", "description", "default", "deprecated", "readOnly", "writeOnly", "examples"];
      NK.contentVocabulary = ["contentMediaType", "contentEncoding", "contentSchema"];
    });
    AK = P((MK) => {
      Object.defineProperty(MK, "__esModule", { value: true });
      var cE = cB(), pE = Nz(), dE = VK(), iE = FK(), wK = DK(), nE = [cE.default, pE.default, (0, dE.default)(), iE.default, wK.metadataVocabulary, wK.contentVocabulary];
      MK.default = nE;
    });
    EK = P((RK) => {
      Object.defineProperty(RK, "__esModule", { value: true });
      RK.DiscrError = void 0;
      var jK;
      (function(Q) {
        Q.Tag = "tag", Q.Mapping = "mapping";
      })(jK || (RK.DiscrError = jK = {}));
    });
    ZK = P((bK) => {
      Object.defineProperty(bK, "__esModule", { value: true });
      var b4 = c(), v7 = EK(), PK = NQ(), rE = Z9(), tE = a(), aE = { message: ({ params: { discrError: Q, tagName: $ } }) => Q === v7.DiscrError.Tag ? `tag "${$}" must be string` : `value of tag "${$}" must be in oneOf`, params: ({ params: { discrError: Q, tag: $, tagName: X } }) => b4._`{error: ${Q}, tag: ${X}, tagValue: ${$}}` }, sE = { keyword: "discriminator", type: "object", schemaType: "object", error: aE, code(Q) {
        let { gen: $, data: X, schema: Y, parentSchema: J, it: G } = Q, { oneOf: W } = J;
        if (!G.opts.discriminator) throw Error("discriminator: requires discriminator option");
        let H = Y.propertyName;
        if (typeof H != "string") throw Error("discriminator: requires propertyName");
        if (Y.mapping) throw Error("discriminator: mapping is not supported");
        if (!W) throw Error("discriminator: requires oneOf keyword");
        let B = $.let("valid", false), z = $.const("tag", b4._`${X}${(0, b4.getProperty)(H)}`);
        $.if(b4._`typeof ${z} == "string"`, () => K(), () => Q.error(false, { discrError: v7.DiscrError.Tag, tag: z, tagName: H })), Q.ok(B);
        function K() {
          let V = q();
          $.if(false);
          for (let L in V) $.elseIf(b4._`${z} === ${L}`), $.assign(B, U(V[L]));
          $.else(), Q.error(false, { discrError: v7.DiscrError.Mapping, tag: z, tagName: H }), $.endIf();
        }
        function U(V) {
          let L = $.name("valid"), F = Q.subschema({ keyword: "oneOf", schemaProp: V }, L);
          return Q.mergeEvaluated(F, b4.Name), L;
        }
        function q() {
          var V;
          let L = {}, F = D(J), w = true;
          for (let Z = 0; Z < W.length; Z++) {
            let v = W[Z];
            if ((v === null || v === void 0 ? void 0 : v.$ref) && !(0, tE.schemaHasRulesButRef)(v, G.self.RULES)) {
              let D0 = v.$ref;
              if (v = PK.resolveRef.call(G.self, G.schemaEnv.root, G.baseId, D0), v instanceof PK.SchemaEnv) v = v.schema;
              if (v === void 0) throw new rE.default(G.opts.uriResolver, G.baseId, D0);
            }
            let O0 = (V = v === null || v === void 0 ? void 0 : v.properties) === null || V === void 0 ? void 0 : V[H];
            if (typeof O0 != "object") throw Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${H}"`);
            w = w && (F || D(v)), M(O0, Z);
          }
          if (!w) throw Error(`discriminator: "${H}" must be required`);
          return L;
          function D({ required: Z }) {
            return Array.isArray(Z) && Z.includes(H);
          }
          function M(Z, v) {
            if (Z.const) R(Z.const, v);
            else if (Z.enum) for (let O0 of Z.enum) R(O0, v);
            else throw Error(`discriminator: "properties/${H}" must have "const" or "enum"`);
          }
          function R(Z, v) {
            if (typeof Z != "string" || Z in L) throw Error(`discriminator: "${H}" values must be unique strings`);
            L[Z] = v;
          }
        }
      } };
      bK.default = sE;
    });
    CK = P((wg, QP) => {
      QP.exports = { $schema: "http://json-schema.org/draft-07/schema#", $id: "http://json-schema.org/draft-07/schema#", title: "Core schema meta-schema", definitions: { schemaArray: { type: "array", minItems: 1, items: { $ref: "#" } }, nonNegativeInteger: { type: "integer", minimum: 0 }, nonNegativeIntegerDefault0: { allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }] }, simpleTypes: { enum: ["array", "boolean", "integer", "null", "number", "object", "string"] }, stringArray: { type: "array", items: { type: "string" }, uniqueItems: true, default: [] } }, type: ["object", "boolean"], properties: { $id: { type: "string", format: "uri-reference" }, $schema: { type: "string", format: "uri" }, $ref: { type: "string", format: "uri-reference" }, $comment: { type: "string" }, title: { type: "string" }, description: { type: "string" }, default: true, readOnly: { type: "boolean", default: false }, examples: { type: "array", items: true }, multipleOf: { type: "number", exclusiveMinimum: 0 }, maximum: { type: "number" }, exclusiveMaximum: { type: "number" }, minimum: { type: "number" }, exclusiveMinimum: { type: "number" }, maxLength: { $ref: "#/definitions/nonNegativeInteger" }, minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, pattern: { type: "string", format: "regex" }, additionalItems: { $ref: "#" }, items: { anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }], default: true }, maxItems: { $ref: "#/definitions/nonNegativeInteger" }, minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, uniqueItems: { type: "boolean", default: false }, contains: { $ref: "#" }, maxProperties: { $ref: "#/definitions/nonNegativeInteger" }, minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" }, required: { $ref: "#/definitions/stringArray" }, additionalProperties: { $ref: "#" }, definitions: { type: "object", additionalProperties: { $ref: "#" }, default: {} }, properties: { type: "object", additionalProperties: { $ref: "#" }, default: {} }, patternProperties: { type: "object", additionalProperties: { $ref: "#" }, propertyNames: { format: "regex" }, default: {} }, dependencies: { type: "object", additionalProperties: { anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }] } }, propertyNames: { $ref: "#" }, const: true, enum: { type: "array", items: true, minItems: 1, uniqueItems: true }, type: { anyOf: [{ $ref: "#/definitions/simpleTypes" }, { type: "array", items: { $ref: "#/definitions/simpleTypes" }, minItems: 1, uniqueItems: true }] }, format: { type: "string" }, contentMediaType: { type: "string" }, contentEncoding: { type: "string" }, if: { $ref: "#" }, then: { $ref: "#" }, else: { $ref: "#" }, allOf: { $ref: "#/definitions/schemaArray" }, anyOf: { $ref: "#/definitions/schemaArray" }, oneOf: { $ref: "#/definitions/schemaArray" }, not: { $ref: "#" } }, default: true };
    });
    x7 = P((u0, T7) => {
      Object.defineProperty(u0, "__esModule", { value: true });
      u0.MissingRefError = u0.ValidationError = u0.CodeGen = u0.Name = u0.nil = u0.stringify = u0.str = u0._ = u0.KeywordCxt = u0.Ajv = void 0;
      var $P = vB(), XP = AK(), YP = ZK(), SK = CK(), JP = ["/properties"], xQ = "http://json-schema.org/draft-07/schema";
      class u9 extends $P.default {
        _addVocabularies() {
          if (super._addVocabularies(), XP.default.forEach((Q) => this.addVocabulary(Q)), this.opts.discriminator) this.addKeyword(YP.default);
        }
        _addDefaultMetaSchema() {
          if (super._addDefaultMetaSchema(), !this.opts.meta) return;
          let Q = this.opts.$data ? this.$dataMetaSchema(SK, JP) : SK;
          this.addMetaSchema(Q, xQ, false), this.refs["http://json-schema.org/schema"] = xQ;
        }
        defaultMeta() {
          return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(xQ) ? xQ : void 0);
        }
      }
      u0.Ajv = u9;
      T7.exports = u0 = u9;
      T7.exports.Ajv = u9;
      Object.defineProperty(u0, "__esModule", { value: true });
      u0.default = u9;
      var GP = b9();
      Object.defineProperty(u0, "KeywordCxt", { enumerable: true, get: function() {
        return GP.KeywordCxt;
      } });
      var Z4 = c();
      Object.defineProperty(u0, "_", { enumerable: true, get: function() {
        return Z4._;
      } });
      Object.defineProperty(u0, "str", { enumerable: true, get: function() {
        return Z4.str;
      } });
      Object.defineProperty(u0, "stringify", { enumerable: true, get: function() {
        return Z4.stringify;
      } });
      Object.defineProperty(u0, "nil", { enumerable: true, get: function() {
        return Z4.nil;
      } });
      Object.defineProperty(u0, "Name", { enumerable: true, get: function() {
        return Z4.Name;
      } });
      Object.defineProperty(u0, "CodeGen", { enumerable: true, get: function() {
        return Z4.CodeGen;
      } });
      var WP = LQ();
      Object.defineProperty(u0, "ValidationError", { enumerable: true, get: function() {
        return WP.default;
      } });
      var HP = Z9();
      Object.defineProperty(u0, "MissingRefError", { enumerable: true, get: function() {
        return HP.default;
      } });
    });
    uK = P((hK) => {
      Object.defineProperty(hK, "__esModule", { value: true });
      hK.formatNames = hK.fastFormats = hK.fullFormats = void 0;
      function E1(Q, $) {
        return { validate: Q, compare: $ };
      }
      hK.fullFormats = { date: E1(TK, f7), time: E1(g7(true), u7), "date-time": E1(_K(true), yK), "iso-time": E1(g7(), xK), "iso-date-time": E1(_K(), gK), duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/, uri: FP, "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i, "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i, url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu, email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i, hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i, ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/, ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i, regex: jP, uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i, "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/, "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i, "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/, byte: NP, int32: { type: "number", validate: wP }, int64: { type: "number", validate: MP }, float: { type: "number", validate: vK }, double: { type: "number", validate: vK }, password: true, binary: true };
      hK.fastFormats = { ...hK.fullFormats, date: E1(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, f7), time: E1(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, u7), "date-time": E1(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, yK), "iso-time": E1(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, xK), "iso-date-time": E1(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, gK), uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i, "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i, email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i };
      hK.formatNames = Object.keys(hK.fullFormats);
      function KP(Q) {
        return Q % 4 === 0 && (Q % 100 !== 0 || Q % 400 === 0);
      }
      var VP = /^(\d\d\d\d)-(\d\d)-(\d\d)$/, qP = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      function TK(Q) {
        let $ = VP.exec(Q);
        if (!$) return false;
        let X = +$[1], Y = +$[2], J = +$[3];
        return Y >= 1 && Y <= 12 && J >= 1 && J <= (Y === 2 && KP(X) ? 29 : qP[Y]);
      }
      function f7(Q, $) {
        if (!(Q && $)) return;
        if (Q > $) return 1;
        if (Q < $) return -1;
        return 0;
      }
      var y7 = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
      function g7(Q) {
        return function(X) {
          let Y = y7.exec(X);
          if (!Y) return false;
          let J = +Y[1], G = +Y[2], W = +Y[3], H = Y[4], B = Y[5] === "-" ? -1 : 1, z = +(Y[6] || 0), K = +(Y[7] || 0);
          if (z > 23 || K > 59 || Q && !H) return false;
          if (J <= 23 && G <= 59 && W < 60) return true;
          let U = G - K * B, q = J - z * B - (U < 0 ? 1 : 0);
          return (q === 23 || q === -1) && (U === 59 || U === -1) && W < 61;
        };
      }
      function u7(Q, $) {
        if (!(Q && $)) return;
        let X = (/* @__PURE__ */ new Date("2020-01-01T" + Q)).valueOf(), Y = (/* @__PURE__ */ new Date("2020-01-01T" + $)).valueOf();
        if (!(X && Y)) return;
        return X - Y;
      }
      function xK(Q, $) {
        if (!(Q && $)) return;
        let X = y7.exec(Q), Y = y7.exec($);
        if (!(X && Y)) return;
        if (Q = X[1] + X[2] + X[3], $ = Y[1] + Y[2] + Y[3], Q > $) return 1;
        if (Q < $) return -1;
        return 0;
      }
      var h7 = /t|\s/i;
      function _K(Q) {
        let $ = g7(Q);
        return function(Y) {
          let J = Y.split(h7);
          return J.length === 2 && TK(J[0]) && $(J[1]);
        };
      }
      function yK(Q, $) {
        if (!(Q && $)) return;
        let X = new Date(Q).valueOf(), Y = new Date($).valueOf();
        if (!(X && Y)) return;
        return X - Y;
      }
      function gK(Q, $) {
        if (!(Q && $)) return;
        let [X, Y] = Q.split(h7), [J, G] = $.split(h7), W = f7(X, J);
        if (W === void 0) return;
        return W || u7(Y, G);
      }
      var UP = /\/|:/, LP = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
      function FP(Q) {
        return UP.test(Q) && LP.test(Q);
      }
      var kK = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
      function NP(Q) {
        return kK.lastIndex = 0, kK.test(Q);
      }
      var OP = -2147483648, DP = 2147483647;
      function wP(Q) {
        return Number.isInteger(Q) && Q <= DP && Q >= OP;
      }
      function MP(Q) {
        return Number.isInteger(Q);
      }
      function vK() {
        return true;
      }
      var AP = /[^\\]\\Z/;
      function jP(Q) {
        if (AP.test(Q)) return false;
        try {
          return new RegExp(Q), true;
        } catch ($) {
          return false;
        }
      }
    });
    lK = P((mK) => {
      Object.defineProperty(mK, "__esModule", { value: true });
      mK.formatLimitDefinition = void 0;
      var IP = x7(), L1 = c(), W6 = L1.operators, yQ = { formatMaximum: { okStr: "<=", ok: W6.LTE, fail: W6.GT }, formatMinimum: { okStr: ">=", ok: W6.GTE, fail: W6.LT }, formatExclusiveMaximum: { okStr: "<", ok: W6.LT, fail: W6.GTE }, formatExclusiveMinimum: { okStr: ">", ok: W6.GT, fail: W6.LTE } }, EP = { message: ({ keyword: Q, schemaCode: $ }) => L1.str`should be ${yQ[Q].okStr} ${$}`, params: ({ keyword: Q, schemaCode: $ }) => L1._`{comparison: ${yQ[Q].okStr}, limit: ${$}}` };
      mK.formatLimitDefinition = { keyword: Object.keys(yQ), type: "string", schemaType: "string", $data: true, error: EP, code(Q) {
        let { gen: $, data: X, schemaCode: Y, keyword: J, it: G } = Q, { opts: W, self: H } = G;
        if (!W.validateFormats) return;
        let B = new IP.KeywordCxt(G, H.RULES.all.format.definition, "format");
        if (B.$data) z();
        else K();
        function z() {
          let q = $.scopeValue("formats", { ref: H.formats, code: W.code.formats }), V = $.const("fmt", L1._`${q}[${B.schemaCode}]`);
          Q.fail$data((0, L1.or)(L1._`typeof ${V} != "object"`, L1._`${V} instanceof RegExp`, L1._`typeof ${V}.compare != "function"`, U(V)));
        }
        function K() {
          let q = B.schema, V = H.formats[q];
          if (!V || V === true) return;
          if (typeof V != "object" || V instanceof RegExp || typeof V.compare != "function") throw Error(`"${J}": format "${q}" does not define "compare" function`);
          let L = $.scopeValue("formats", { key: q, ref: V, code: W.code.formats ? L1._`${W.code.formats}${(0, L1.getProperty)(q)}` : void 0 });
          Q.fail$data(U(L));
        }
        function U(q) {
          return L1._`${q}.compare(${X}, ${Y}) ${yQ[J].fail} 0`;
        }
      }, dependencies: ["format"] };
      var PP = (Q) => {
        return Q.addKeyword(mK.formatLimitDefinition), Q;
      };
      mK.default = PP;
    });
    iK = P((m9, dK) => {
      Object.defineProperty(m9, "__esModule", { value: true });
      var C4 = uK(), ZP = lK(), c7 = c(), cK = new c7.Name("fullFormats"), CP = new c7.Name("fastFormats"), p7 = (Q, $ = { keywords: true }) => {
        if (Array.isArray($)) return pK(Q, $, C4.fullFormats, cK), Q;
        let [X, Y] = $.mode === "fast" ? [C4.fastFormats, CP] : [C4.fullFormats, cK], J = $.formats || C4.formatNames;
        if (pK(Q, J, X, Y), $.keywords) (0, ZP.default)(Q);
        return Q;
      };
      p7.get = (Q, $ = "full") => {
        let Y = ($ === "fast" ? C4.fastFormats : C4.fullFormats)[Q];
        if (!Y) throw Error(`Unknown format "${Q}"`);
        return Y;
      };
      function pK(Q, $, X, Y) {
        var J, G;
        (J = (G = Q.opts.code).formats) !== null && J !== void 0 || (G.formats = c7._`require("ajv-formats/dist/formats").${Y}`);
        for (let W of $) Q.addFormat(W, X[W]);
      }
      dK.exports = m9 = p7;
      Object.defineProperty(m9, "__esModule", { value: true });
      m9.default = p7;
    });
    kV = 50;
    vV = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "PermissionRequest", "Setup", "TeammateIdle", "TaskCompleted", "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate", "WorktreeRemove", "InstructionsLoaded"];
    TV = ["clear", "resume", "logout", "prompt_input_exit", "other", "bypass_permissions_disabled"];
    T0 = class extends Error {
    };
    xV = typeof global == "object" && global && global.Object === Object && global;
    W5 = xV;
    yV = typeof self == "object" && self && self.Object === Object && self;
    gV = W5 || yV || Function("return this")();
    f6 = gV;
    hV = f6.Symbol;
    u6 = hV;
    H5 = Object.prototype;
    fV = H5.hasOwnProperty;
    uV = H5.toString;
    T4 = u6 ? u6.toStringTag : void 0;
    B5 = mV;
    lV = Object.prototype;
    cV = lV.toString;
    z5 = pV;
    dV = "[object Null]";
    iV = "[object Undefined]";
    K5 = u6 ? u6.toStringTag : void 0;
    V5 = nV;
    p9 = oV;
    rV = "[object AsyncFunction]";
    tV = "[object Function]";
    aV = "[object GeneratorFunction]";
    sV = "[object Proxy]";
    q5 = eV;
    Qq = f6["__core-js_shared__"];
    d9 = Qq;
    U5 = (function() {
      var Q = /[^.]+$/.exec(d9 && d9.keys && d9.keys.IE_PROTO || "");
      return Q ? "Symbol(src)_1." + Q : "";
    })();
    L5 = $q;
    Xq = Function.prototype;
    Yq = Xq.toString;
    F5 = Jq;
    Gq = /[\\^$.*+?()[\]{}|]/g;
    Wq = /^\[object .+?Constructor\]$/;
    Hq = Function.prototype;
    Bq = Object.prototype;
    zq = Hq.toString;
    Kq = Bq.hasOwnProperty;
    Vq = RegExp("^" + zq.call(Kq).replace(Gq, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
    N5 = qq;
    O5 = Uq;
    i9 = Lq;
    Fq = i9(Object, "create");
    b1 = Fq;
    D5 = Nq;
    w5 = Oq;
    Dq = "__lodash_hash_undefined__";
    wq = Object.prototype;
    Mq = wq.hasOwnProperty;
    M5 = Aq;
    jq = Object.prototype;
    Rq = jq.hasOwnProperty;
    A5 = Iq;
    Eq = "__lodash_hash_undefined__";
    j5 = Pq;
    m6.prototype.clear = D5;
    m6.prototype.delete = w5;
    m6.prototype.get = M5;
    m6.prototype.has = A5;
    m6.prototype.set = j5;
    mQ = m6;
    R5 = bq;
    I5 = Zq;
    h1 = Cq;
    Sq = Array.prototype;
    _q = Sq.splice;
    E5 = kq;
    P5 = vq;
    b5 = Tq;
    Z5 = xq;
    l6.prototype.clear = R5;
    l6.prototype.delete = E5;
    l6.prototype.get = P5;
    l6.prototype.has = b5;
    l6.prototype.set = Z5;
    C5 = l6;
    yq = i9(f6, "Map");
    S5 = yq;
    _5 = gq;
    k5 = hq;
    f1 = fq;
    v5 = uq;
    T5 = mq;
    x5 = lq;
    y5 = cq;
    c6.prototype.clear = _5;
    c6.prototype.delete = v5;
    c6.prototype.get = T5;
    c6.prototype.has = x5;
    c6.prototype.set = y5;
    lQ = c6;
    pq = "Expected a function";
    cQ.Cache = lQ;
    $1 = cQ;
    p6 = $1(() => {
      return (process.env.CLAUDE_CONFIG_DIR ?? dq(iq(), ".claude")).normalize("NFC");
    }, () => process.env.CLAUDE_CONFIG_DIR);
    d6 = null;
    eq = sq();
    m5 = /* @__PURE__ */ new Set();
    c5 = $1((Q) => {
      if (!Q || Q.trim() === "") return null;
      let $ = Q.split(",").map((G) => G.trim()).filter(Boolean);
      if ($.length === 0) return null;
      let X = $.some((G) => G.startsWith("!")), Y = $.some((G) => !G.startsWith("!"));
      if (X && Y) return null;
      let J = $.map((G) => G.replace(/^!/, "").toLowerCase());
      return { include: X ? [] : J, exclude: X ? J : [], isExclusive: X };
    });
    KU = { cwd() {
      return process.cwd();
    }, existsSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.existsSync(${Q})`, 0);
        return u.existsSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, async stat(Q) {
      return XU(Q);
    }, async readdir(Q) {
      return YU(Q, { withFileTypes: true });
    }, async unlink(Q) {
      return JU(Q);
    }, async rmdir(Q) {
      return GU(Q);
    }, async rm(Q, $) {
      return WU(Q, $);
    }, async mkdir(Q, $) {
      try {
        await HU(Q, { recursive: true, ...$ });
      } catch (X) {
        if (X.code !== "EEXIST") throw X;
      }
    }, async readFile(Q, $) {
      return d5(Q, { encoding: $.encoding });
    }, async rename(Q, $) {
      return BU(Q, $);
    }, statSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.statSync(${Q})`, 0);
        return u.statSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, lstatSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.lstatSync(${Q})`, 0);
        return u.lstatSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, readFileSync(Q, $) {
      let Y = [];
      try {
        const X = $0(Y, q0`fs.readFileSync(${Q})`, 0);
        return u.readFileSync(Q, { encoding: $.encoding });
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, readFileBytesSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.readFileBytesSync(${Q})`, 0);
        return u.readFileSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, readSync(Q, $) {
      let J = [];
      try {
        const X = $0(J, q0`fs.readSync(${Q}, ${$.length} bytes)`, 0);
        let Y = void 0;
        try {
          Y = u.openSync(Q, "r");
          let B = Buffer.alloc($.length), z = u.readSync(Y, B, 0, $.length, 0);
          return { buffer: B, bytesRead: z };
        } finally {
          if (Y) u.closeSync(Y);
        }
      } catch (G) {
        var W = G, H = 1;
      } finally {
        X0(J, W, H);
      }
    }, appendFileSync(Q, $, X) {
      let J = [];
      try {
        const Y = $0(J, q0`fs.appendFileSync(${Q}, ${$.length} chars)`, 0);
        if (X?.mode !== void 0) try {
          let B = u.openSync(Q, "ax", X.mode);
          try {
            u.appendFileSync(B, $);
          } finally {
            u.closeSync(B);
          }
          return;
        } catch (B) {
          if (B.code !== "EEXIST") throw B;
        }
        u.appendFileSync(Q, $);
      } catch (G) {
        var W = G, H = 1;
      } finally {
        X0(J, W, H);
      }
    }, copyFileSync(Q, $) {
      let Y = [];
      try {
        const X = $0(Y, q0`fs.copyFileSync(${Q} → ${$})`, 0);
        u.copyFileSync(Q, $);
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, unlinkSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.unlinkSync(${Q})`, 0);
        u.unlinkSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, renameSync(Q, $) {
      let Y = [];
      try {
        const X = $0(Y, q0`fs.renameSync(${Q} → ${$})`, 0);
        u.renameSync(Q, $);
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, linkSync(Q, $) {
      let Y = [];
      try {
        const X = $0(Y, q0`fs.linkSync(${Q} → ${$})`, 0);
        u.linkSync(Q, $);
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, symlinkSync(Q, $, X) {
      let J = [];
      try {
        const Y = $0(J, q0`fs.symlinkSync(${Q} → ${$})`, 0);
        u.symlinkSync(Q, $, X);
      } catch (G) {
        var W = G, H = 1;
      } finally {
        X0(J, W, H);
      }
    }, readlinkSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.readlinkSync(${Q})`, 0);
        return u.readlinkSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, realpathSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.realpathSync(${Q})`, 0);
        return u.realpathSync(Q).normalize("NFC");
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, mkdirSync(Q, $) {
      let J = [];
      try {
        const X = $0(J, q0`fs.mkdirSync(${Q})`, 0);
        let Y = { recursive: true };
        if ($?.mode !== void 0) Y.mode = $.mode;
        try {
          u.mkdirSync(Q, Y);
        } catch (B) {
          if (B.code !== "EEXIST") throw B;
        }
      } catch (G) {
        var W = G, H = 1;
      } finally {
        X0(J, W, H);
      }
    }, readdirSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.readdirSync(${Q})`, 0);
        return u.readdirSync(Q, { withFileTypes: true });
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, readdirStringSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.readdirStringSync(${Q})`, 0);
        return u.readdirSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, isDirEmptySync(Q) {
      let Y = [];
      try {
        const $ = $0(Y, q0`fs.isDirEmptySync(${Q})`, 0);
        let X = this.readdirSync(Q);
        return X.length === 0;
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, rmdirSync(Q) {
      let X = [];
      try {
        const $ = $0(X, q0`fs.rmdirSync(${Q})`, 0);
        u.rmdirSync(Q);
      } catch (Y) {
        var J = Y, G = 1;
      } finally {
        X0(X, J, G);
      }
    }, rmSync(Q, $) {
      let Y = [];
      try {
        const X = $0(Y, q0`fs.rmSync(${Q})`, 0);
        u.rmSync(Q, $);
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    }, createWriteStream(Q) {
      return u.createWriteStream(Q);
    }, async readFileBytes(Q, $) {
      if ($ === void 0) return d5(Q);
      let X = await zU(Q, "r");
      try {
        let { size: Y } = await X.stat(), J = Math.min(Y, $), G = Buffer.allocUnsafe(J), W = 0;
        while (W < J) {
          let { bytesRead: H } = await X.read(G, W, J - W, W);
          if (H === 0) break;
          W += H;
        }
        return W < J ? G.subarray(0, W) : G;
      } finally {
        await X.close();
      }
    } };
    VU = KU;
    iQ = { verbose: 0, debug: 1, info: 2, warn: 3, error: 4 };
    OU = $1(() => {
      let Q = process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim();
      if (Q && Object.hasOwn(iQ, Q)) return Q;
      return "debug";
    });
    DU = false;
    nQ = $1(() => {
      return DU || x4(process.env.DEBUG) || x4(process.env.DEBUG_SDK) || process.argv.includes("--debug") || process.argv.includes("-d") || r5() || process.argv.some((Q) => Q.startsWith("--debug=")) || t5() !== null;
    });
    wU = $1(() => {
      let Q = process.argv.find((X) => X.startsWith("--debug="));
      if (!Q) return null;
      let $ = Q.substring(8);
      return c5($);
    });
    r5 = $1(() => {
      return process.argv.includes("--debug-to-stderr") || process.argv.includes("-d2e");
    });
    t5 = $1(() => {
      for (let Q = 0; Q < process.argv.length; Q++) {
        let $ = process.argv[Q];
        if ($.startsWith("--debug-file=")) return $.substring(13);
        if ($ === "--debug-file" && Q + 1 < process.argv.length) return process.argv[Q + 1];
      }
      return null;
    });
    AU = false;
    o9 = null;
    dQ = Promise.resolve();
    s5 = $1(async () => {
      try {
        let Q = a5(), $ = n5(Q), X = o5($, "latest");
        await FU(X).catch(() => {
        }), await NU(Q, X);
      } catch {
      }
    });
    PC = (() => {
      let Q = process.env.CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS;
      if (Q !== void 0) {
        let $ = Number(Q);
        if (!Number.isNaN($) && $ >= 0) return $;
      }
      return 1 / 0;
    })();
    EU = { [Symbol.dispose]() {
    } };
    q0 = PU;
    O1 = (Q, $) => {
      let Y = [];
      try {
        const X = $0(Y, q0`JSON.parse(${Q})`, 0);
        return typeof $ > "u" ? JSON.parse(Q) : JSON.parse(Q, $);
      } catch (J) {
        var G = J, W = 1;
      } finally {
        X0(Y, G, W);
      }
    };
    SU = 2e3;
    y4 = class {
      options;
      process;
      processStdin;
      processStdout;
      ready = false;
      abortController;
      exitError;
      exitListeners = [];
      processExitHandler;
      abortHandler;
      constructor(Q) {
        this.options = Q;
        this.abortController = Q.abortController || g6(), this.initialize();
      }
      getDefaultExecutable() {
        return h6() ? "bun" : "node";
      }
      spawnLocalProcess(Q) {
        let { command: $, args: X, cwd: Y, env: J, signal: G } = Q, W = J.DEBUG_CLAUDE_AGENT_SDK || this.options.stderr ? "pipe" : "ignore", H = ZU($, X, { cwd: Y, stdio: ["pipe", "pipe", W], signal: G, env: J, windowsHide: true });
        if (J.DEBUG_CLAUDE_AGENT_SDK || this.options.stderr) H.stderr.on("data", (z) => {
          let K = z.toString();
          if (i0(K), this.options.stderr) this.options.stderr(K);
        });
        return { stdin: H.stdin, stdout: H.stdout, get killed() {
          return H.killed;
        }, get exitCode() {
          return H.exitCode;
        }, kill: H.kill.bind(H), on: H.on.bind(H), once: H.once.bind(H), off: H.off.bind(H) };
      }
      initialize() {
        try {
          let { additionalDirectories: Q = [], agent: $, betas: X, cwd: Y, executable: J = this.getDefaultExecutable(), executableArgs: G = [], extraArgs: W = {}, pathToClaudeCodeExecutable: H, env: B = { ...process.env }, thinkingConfig: z, maxTurns: K, maxBudgetUsd: U, model: q, fallbackModel: V, jsonSchema: L, permissionMode: F, allowDangerouslySkipPermissions: w, permissionPromptToolName: D, continueConversation: M, resume: R, settingSources: Z, allowedTools: v = [], disallowedTools: O0 = [], tools: D0, mcpServers: d0, strictMcpConfig: B6, canUseTool: F1, includePartialMessages: z6, plugins: y1, sandbox: K6 } = this.options, h = ["--output-format", "stream-json", "--verbose", "--input-format", "stream-json"];
          if (z) switch (z.type) {
            case "enabled":
              if (z.budgetTokens === void 0) h.push("--thinking", "adaptive");
              else h.push("--max-thinking-tokens", z.budgetTokens.toString());
              break;
            case "disabled":
              h.push("--thinking", "disabled");
              break;
            case "adaptive":
              h.push("--thinking", "adaptive");
              break;
          }
          if (this.options.effort) h.push("--effort", this.options.effort);
          if (K) h.push("--max-turns", K.toString());
          if (U !== void 0) h.push("--max-budget-usd", U.toString());
          if (q) h.push("--model", q);
          if ($) h.push("--agent", $);
          if (X && X.length > 0) h.push("--betas", X.join(","));
          if (L) h.push("--json-schema", W0(L));
          if (this.options.debugFile) h.push("--debug-file", this.options.debugFile);
          else if (this.options.debug) h.push("--debug");
          if (B.DEBUG_CLAUDE_AGENT_SDK) h.push("--debug-to-stderr");
          if (F1) {
            if (D) throw Error("canUseTool callback cannot be used with permissionPromptToolName. Please use one or the other.");
            h.push("--permission-prompt-tool", "stdio");
          } else if (D) h.push("--permission-prompt-tool", D);
          if (M) h.push("--continue");
          if (R) h.push("--resume", R);
          if (this.options.proactive) h.push("--proactive");
          if (this.options.assistant) h.push("--assistant");
          if (v.length > 0) h.push("--allowedTools", v.join(","));
          if (O0.length > 0) h.push("--disallowedTools", O0.join(","));
          if (D0 !== void 0) if (Array.isArray(D0)) if (D0.length === 0) h.push("--tools", "");
          else h.push("--tools", D0.join(","));
          else h.push("--tools", "default");
          if (d0 && Object.keys(d0).length > 0) h.push("--mcp-config", W0({ mcpServers: d0 }));
          if (Z) h.push("--setting-sources", Z.join(","));
          if (B6) h.push("--strict-mcp-config");
          if (F) h.push("--permission-mode", F);
          if (w) h.push("--allow-dangerously-skip-permissions");
          if (V) {
            if (q && V === q) throw Error("Fallback model cannot be the same as the main model. Please specify a different model for fallbackModel option.");
            h.push("--fallback-model", V);
          }
          if (z6) h.push("--include-partial-messages");
          for (let C0 of Q) h.push("--add-dir", C0);
          if (y1 && y1.length > 0) for (let C0 of y1) if (C0.type === "local") h.push("--plugin-dir", C0.path);
          else throw Error(`Unsupported plugin type: ${C0.type}`);
          if (this.options.forkSession) h.push("--fork-session");
          if (this.options.resumeSessionAt) h.push("--resume-session-at", this.options.resumeSessionAt);
          if (this.options.sessionId) h.push("--session-id", this.options.sessionId);
          if (this.options.persistSession === false) h.push("--no-session-persistence");
          let S4 = { ...W ?? {} };
          if (this.options.settings) S4.settings = this.options.settings;
          let gQ = e5(S4, K6);
          for (let [C0, g1] of Object.entries(gQ)) if (g1 === null) h.push(`--${C0}`);
          else h.push(`--${C0}`, g1);
          if (!B.CLAUDE_CODE_ENTRYPOINT) B.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
          if (delete B.NODE_OPTIONS, B.DEBUG_CLAUDE_AGENT_SDK) B.DEBUG = "1";
          else delete B.DEBUG;
          let _4 = _U(H), k4 = _4 ? H : J, V6 = _4 ? [...G, ...h] : [...G, H, ...h], c9 = { command: k4, args: V6, cwd: Y, env: B, signal: this.abortController.signal };
          if (this.options.spawnClaudeCodeProcess) i0(`Spawning Claude Code (custom): ${k4} ${V6.join(" ")}`), this.process = this.options.spawnClaudeCodeProcess(c9);
          else i0(`Spawning Claude Code: ${k4} ${V6.join(" ")}`), this.process = this.spawnLocalProcess(c9);
          this.processStdin = this.process.stdin, this.processStdout = this.process.stdout;
          let v6 = () => {
            if (this.process && !this.process.killed) this.process.kill("SIGTERM");
          };
          this.processExitHandler = v6, this.abortHandler = v6, process.on("exit", this.processExitHandler), this.abortController.signal.addEventListener("abort", this.abortHandler), this.process.on("error", (C0) => {
            if (this.ready = false, this.abortController.signal.aborted) this.exitError = new T0("Claude Code process aborted by user");
            else if (C0.code === "ENOENT") {
              let g1 = _4 ? `Claude Code native binary not found at ${H}. Please ensure Claude Code is installed via native installer or specify a valid path with options.pathToClaudeCodeExecutable.` : `Claude Code executable not found at ${H}. Is options.pathToClaudeCodeExecutable set?`;
              this.exitError = ReferenceError(g1), i0(this.exitError.message);
            } else this.exitError = Error(`Failed to spawn Claude Code process: ${C0.message}`), i0(this.exitError.message);
          }), this.process.on("exit", (C0, g1) => {
            if (this.ready = false, this.abortController.signal.aborted) this.exitError = new T0("Claude Code process aborted by user");
            else {
              let T6 = this.getProcessExitError(C0, g1);
              if (T6) this.exitError = T6, i0(T6.message);
            }
          }), this.ready = true;
        } catch (Q) {
          throw this.ready = false, Q;
        }
      }
      getProcessExitError(Q, $) {
        if (Q !== 0 && Q !== null) return Error(`Claude Code process exited with code ${Q}`);
        else if ($) return Error(`Claude Code process terminated by signal ${$}`);
        return;
      }
      write(Q) {
        if (this.abortController.signal.aborted) throw new T0("Operation aborted");
        if (!this.ready || !this.processStdin) throw Error("ProcessTransport is not ready for writing");
        if (this.process?.killed || this.process?.exitCode !== null) throw Error("Cannot write to terminated process");
        if (this.exitError) throw Error(`Cannot write to process that exited with error: ${this.exitError.message}`);
        i0(`[ProcessTransport] Writing to stdin: ${Q.substring(0, 100)}`);
        try {
          if (!this.processStdin.write(Q)) i0("[ProcessTransport] Write buffer full, data queued");
        } catch ($) {
          throw this.ready = false, Error(`Failed to write to process stdin: ${$.message}`);
        }
      }
      close() {
        if (this.processStdin) this.processStdin.end(), this.processStdin = void 0;
        if (this.abortHandler) this.abortController.signal.removeEventListener("abort", this.abortHandler), this.abortHandler = void 0;
        for (let { handler: $ } of this.exitListeners) this.process?.off("exit", $);
        this.exitListeners = [];
        let Q = this.process;
        if (Q && !Q.killed && Q.exitCode === null) setTimeout(($) => {
          if ($.killed || $.exitCode !== null) return;
          $.kill("SIGTERM"), setTimeout((X) => {
            if (X.exitCode === null) X.kill("SIGKILL");
          }, 5e3, $).unref();
        }, SU, Q).unref(), Q.once("exit", () => {
          if (this.processExitHandler) process.off("exit", this.processExitHandler), this.processExitHandler = void 0;
        });
        else if (this.processExitHandler) process.off("exit", this.processExitHandler), this.processExitHandler = void 0;
        this.ready = false;
      }
      isReady() {
        return this.ready;
      }
      async *readMessages() {
        if (!this.processStdout) throw Error("ProcessTransport output stream not available");
        let Q = CU({ input: this.processStdout });
        try {
          for await (let $ of Q) if ($.trim()) try {
            yield O1($);
          } catch (X) {
            throw i0(`Non-JSON stdout: ${$}`), Error(`CLI output was not valid JSON. This may indicate an error during startup. Output: ${$.slice(0, 200)}${$.length > 200 ? "..." : ""}`);
          }
          await this.waitForExit();
        } catch ($) {
          throw $;
        } finally {
          Q.close();
        }
      }
      endInput() {
        if (this.processStdin) this.processStdin.end();
      }
      getInputStream() {
        return this.processStdin;
      }
      onExit(Q) {
        if (!this.process) return () => {
        };
        let $ = (X, Y) => {
          let J = this.getProcessExitError(X, Y);
          Q(J);
        };
        return this.process.on("exit", $), this.exitListeners.push({ callback: Q, handler: $ }), () => {
          if (this.process) this.process.off("exit", $);
          let X = this.exitListeners.findIndex((Y) => Y.handler === $);
          if (X !== -1) this.exitListeners.splice(X, 1);
        };
      }
      async waitForExit() {
        if (!this.process) {
          if (this.exitError) throw this.exitError;
          return;
        }
        if (this.process.exitCode !== null || this.process.killed) {
          if (this.exitError) throw this.exitError;
          return;
        }
        return new Promise((Q, $) => {
          let X = (J, G) => {
            if (this.abortController.signal.aborted) {
              $(new T0("Operation aborted"));
              return;
            }
            let W = this.getProcessExitError(J, G);
            if (W) $(W);
            else Q();
          };
          this.process.once("exit", X);
          let Y = (J) => {
            this.process.off("exit", X), $(J);
          };
          this.process.once("error", Y), this.process.once("exit", () => {
            this.process.off("error", Y);
          });
        });
      }
    };
    g4 = class {
      returned;
      queue = [];
      readResolve;
      readReject;
      isDone = false;
      hasError;
      started = false;
      constructor(Q) {
        this.returned = Q;
      }
      [Symbol.asyncIterator]() {
        if (this.started) throw Error("Stream can only be iterated once");
        return this.started = true, this;
      }
      next() {
        if (this.queue.length > 0) return Promise.resolve({ done: false, value: this.queue.shift() });
        if (this.isDone) return Promise.resolve({ done: true, value: void 0 });
        if (this.hasError) return Promise.reject(this.hasError);
        return new Promise((Q, $) => {
          this.readResolve = Q, this.readReject = $;
        });
      }
      enqueue(Q) {
        if (this.readResolve) {
          let $ = this.readResolve;
          this.readResolve = void 0, this.readReject = void 0, $({ done: false, value: Q });
        } else this.queue.push(Q);
      }
      done() {
        if (this.isDone = true, this.readResolve) {
          let Q = this.readResolve;
          this.readResolve = void 0, this.readReject = void 0, Q({ done: true, value: void 0 });
        }
      }
      error(Q) {
        if (this.hasError = Q, this.readReject) {
          let $ = this.readReject;
          this.readResolve = void 0, this.readReject = void 0, $(Q);
        }
      }
      return() {
        if (this.isDone = true, this.returned) this.returned();
        return Promise.resolve({ done: true, value: void 0 });
      }
    };
    oQ = class {
      sendMcpMessage;
      isClosed = false;
      constructor(Q) {
        this.sendMcpMessage = Q;
      }
      onclose;
      onerror;
      onmessage;
      async start() {
      }
      async send(Q) {
        if (this.isClosed) throw Error("Transport is closed");
        this.sendMcpMessage(Q);
      }
      async close() {
        if (this.isClosed) return;
        this.isClosed = true, this.onclose?.();
      }
    };
    h4 = class {
      transport;
      isSingleUserTurn;
      canUseTool;
      hooks;
      abortController;
      jsonSchema;
      initConfig;
      onElicitation;
      pendingControlResponses = /* @__PURE__ */ new Map();
      cleanupPerformed = false;
      sdkMessages;
      inputStream = new g4();
      initialization;
      cancelControllers = /* @__PURE__ */ new Map();
      hookCallbacks = /* @__PURE__ */ new Map();
      nextCallbackId = 0;
      sdkMcpTransports = /* @__PURE__ */ new Map();
      sdkMcpServerInstances = /* @__PURE__ */ new Map();
      pendingMcpResponses = /* @__PURE__ */ new Map();
      firstResultReceivedResolve;
      firstResultReceived = false;
      lastErrorResultText;
      hasBidirectionalNeeds() {
        return this.sdkMcpTransports.size > 0 || this.hooks !== void 0 && Object.keys(this.hooks).length > 0 || this.canUseTool !== void 0 || this.onElicitation !== void 0;
      }
      constructor(Q, $, X, Y, J, G = /* @__PURE__ */ new Map(), W, H, B) {
        this.transport = Q;
        this.isSingleUserTurn = $;
        this.canUseTool = X;
        this.hooks = Y;
        this.abortController = J;
        this.jsonSchema = W;
        this.initConfig = H;
        this.onElicitation = B;
        for (let [z, K] of G) this.connectSdkMcpServer(z, K);
        this.sdkMessages = this.readSdkMessages(), this.readMessages(), this.initialization = this.initialize(), this.initialization.catch(() => {
        });
      }
      setError(Q) {
        this.inputStream.error(Q);
      }
      async stopTask(Q) {
        await this.request({ subtype: "stop_task", task_id: Q });
      }
      close() {
        this.cleanup();
      }
      cleanup(Q) {
        if (this.cleanupPerformed) return;
        this.cleanupPerformed = true;
        try {
          this.transport.close();
          let $ = Error("Query closed before response received");
          for (let { reject: X } of this.pendingControlResponses.values()) X($);
          this.pendingControlResponses.clear();
          for (let { reject: X } of this.pendingMcpResponses.values()) X($);
          this.pendingMcpResponses.clear(), this.cancelControllers.clear(), this.hookCallbacks.clear();
          for (let X of this.sdkMcpTransports.values()) try {
            X.close();
          } catch {
          }
          if (this.sdkMcpTransports.clear(), Q) this.inputStream.error(Q);
          else this.inputStream.done();
        } catch ($) {
        }
      }
      next(...[Q]) {
        return this.sdkMessages.next(...[Q]);
      }
      return(Q) {
        return this.sdkMessages.return(Q);
      }
      throw(Q) {
        return this.sdkMessages.throw(Q);
      }
      [Symbol.asyncIterator]() {
        return this.sdkMessages;
      }
      [Symbol.asyncDispose]() {
        return this.sdkMessages[Symbol.asyncDispose]();
      }
      async readMessages() {
        try {
          for await (let Q of this.transport.readMessages()) {
            if (Q.type === "control_response") {
              let $ = this.pendingControlResponses.get(Q.response.request_id);
              if ($) $.handler(Q.response);
              continue;
            } else if (Q.type === "control_request") {
              this.handleControlRequest(Q);
              continue;
            } else if (Q.type === "control_cancel_request") {
              this.handleControlCancelRequest(Q);
              continue;
            } else if (Q.type === "keep_alive") continue;
            if (Q.type === "streamlined_text" || Q.type === "streamlined_tool_use_summary") continue;
            if (Q.type === "result") {
              if (this.lastErrorResultText = Q.is_error ? Q.subtype === "success" ? Q.result : Q.errors.join("; ") : void 0, this.firstResultReceived = true, this.firstResultReceivedResolve) this.firstResultReceivedResolve();
              if (this.isSingleUserTurn) N1("[Query.readMessages] First result received for single-turn query, closing stdin"), this.transport.endInput();
            } else this.lastErrorResultText = void 0;
            this.inputStream.enqueue(Q);
          }
          if (this.firstResultReceivedResolve) this.firstResultReceivedResolve();
          this.inputStream.done(), this.cleanup();
        } catch (Q) {
          if (this.firstResultReceivedResolve) this.firstResultReceivedResolve();
          if (this.lastErrorResultText !== void 0 && !(Q instanceof T0)) {
            let $ = Error(`Claude Code returned an error result: ${this.lastErrorResultText}`);
            N1(`[Query.readMessages] Replacing exit error with result text. Original: ${Q.message}`), this.inputStream.error($), this.cleanup($);
            return;
          }
          this.inputStream.error(Q), this.cleanup(Q);
        }
      }
      async handleControlRequest(Q) {
        let $ = new AbortController();
        this.cancelControllers.set(Q.request_id, $);
        try {
          let X = await this.processControlRequest(Q, $.signal), Y = { type: "control_response", response: { subtype: "success", request_id: Q.request_id, response: X } };
          await Promise.resolve(this.transport.write(W0(Y) + `
`));
        } catch (X) {
          let Y = { type: "control_response", response: { subtype: "error", request_id: Q.request_id, error: X.message || String(X) } };
          await Promise.resolve(this.transport.write(W0(Y) + `
`));
        } finally {
          this.cancelControllers.delete(Q.request_id);
        }
      }
      handleControlCancelRequest(Q) {
        let $ = this.cancelControllers.get(Q.request_id);
        if ($) $.abort(), this.cancelControllers.delete(Q.request_id);
      }
      async processControlRequest(Q, $) {
        if (Q.request.subtype === "can_use_tool") {
          if (!this.canUseTool) throw Error("canUseTool callback is not provided.");
          return { ...await this.canUseTool(Q.request.tool_name, Q.request.input, { signal: $, suggestions: Q.request.permission_suggestions, blockedPath: Q.request.blocked_path, decisionReason: Q.request.decision_reason, title: Q.request.title, displayName: Q.request.display_name, description: Q.request.description, toolUseID: Q.request.tool_use_id, agentID: Q.request.agent_id }), toolUseID: Q.request.tool_use_id };
        } else if (Q.request.subtype === "hook_callback") return await this.handleHookCallbacks(Q.request.callback_id, Q.request.input, Q.request.tool_use_id, $);
        else if (Q.request.subtype === "mcp_message") {
          let X = Q.request, Y = this.sdkMcpTransports.get(X.server_name);
          if (!Y) throw Error(`SDK MCP server not found: ${X.server_name}`);
          if ("method" in X.message && "id" in X.message && X.message.id !== null) return { mcp_response: await this.handleMcpControlRequest(X.server_name, X, Y) };
          else {
            if (Y.onmessage) Y.onmessage(X.message);
            return { mcp_response: { jsonrpc: "2.0", result: {}, id: 0 } };
          }
        } else if (Q.request.subtype === "elicitation") {
          let X = Q.request;
          if (this.onElicitation) return await this.onElicitation({ serverName: X.mcp_server_name, message: X.message, mode: X.mode, url: X.url, elicitationId: X.elicitation_id, requestedSchema: X.requested_schema }, { signal: $ });
          return { action: "decline" };
        }
        throw Error("Unsupported control request subtype: " + Q.request.subtype);
      }
      async *readSdkMessages() {
        for await (let Q of this.inputStream) yield Q;
      }
      async initialize() {
        let Q;
        if (this.hooks) {
          Q = {};
          for (let [J, G] of Object.entries(this.hooks)) if (G.length > 0) Q[J] = G.map((W) => {
            let H = [];
            for (let B of W.hooks) {
              let z = `hook_${this.nextCallbackId++}`;
              this.hookCallbacks.set(z, B), H.push(z);
            }
            return { matcher: W.matcher, hookCallbackIds: H, timeout: W.timeout };
          });
        }
        let $ = this.sdkMcpTransports.size > 0 ? Array.from(this.sdkMcpTransports.keys()) : void 0, X = { subtype: "initialize", hooks: Q, sdkMcpServers: $, jsonSchema: this.jsonSchema, systemPrompt: this.initConfig?.systemPrompt, appendSystemPrompt: this.initConfig?.appendSystemPrompt, agents: this.initConfig?.agents, promptSuggestions: this.initConfig?.promptSuggestions, agentProgressSummaries: this.initConfig?.agentProgressSummaries };
        return (await this.request(X)).response;
      }
      async interrupt() {
        await this.request({ subtype: "interrupt" });
      }
      async setPermissionMode(Q) {
        await this.request({ subtype: "set_permission_mode", mode: Q });
      }
      async setModel(Q) {
        await this.request({ subtype: "set_model", model: Q });
      }
      async setMaxThinkingTokens(Q) {
        await this.request({ subtype: "set_max_thinking_tokens", max_thinking_tokens: Q });
      }
      async applyFlagSettings(Q) {
        await this.request({ subtype: "apply_flag_settings", settings: Q });
      }
      async getSettings() {
        return (await this.request({ subtype: "get_settings" })).response;
      }
      async rewindFiles(Q, $) {
        return (await this.request({ subtype: "rewind_files", user_message_id: Q, dry_run: $?.dryRun })).response;
      }
      async cancelAsyncMessage(Q) {
        return (await this.request({ subtype: "cancel_async_message", message_uuid: Q })).response.cancelled;
      }
      async enableRemoteControl(Q) {
        return (await this.request({ subtype: "remote_control", enabled: Q })).response;
      }
      async setProactive(Q) {
        await this.request({ subtype: "set_proactive", enabled: Q });
      }
      async generateSessionTitle(Q, $) {
        return (await this.request({ subtype: "generate_session_title", description: Q, persist: $?.persist })).response.title;
      }
      async processPendingPermissionRequests(Q) {
        for (let $ of Q) if ($.request.subtype === "can_use_tool") this.handleControlRequest($).catch(() => {
        });
      }
      request(Q) {
        let $ = Math.random().toString(36).substring(2, 15), X = { request_id: $, type: "control_request", request: Q };
        return new Promise((Y, J) => {
          this.pendingControlResponses.set($, { handler: (G) => {
            if (this.pendingControlResponses.delete($), G.subtype === "success") Y(G);
            else if (J(Error(G.error)), G.pending_permission_requests) this.processPendingPermissionRequests(G.pending_permission_requests);
          }, reject: J }), Promise.resolve(this.transport.write(W0(X) + `
`));
        });
      }
      async initializationResult() {
        return this.initialization;
      }
      async supportedCommands() {
        return (await this.initialization).commands;
      }
      async supportedModels() {
        return (await this.initialization).models;
      }
      async supportedAgents() {
        return (await this.initialization).agents;
      }
      async reconnectMcpServer(Q) {
        await this.request({ subtype: "mcp_reconnect", serverName: Q });
      }
      async toggleMcpServer(Q, $) {
        await this.request({ subtype: "mcp_toggle", serverName: Q, enabled: $ });
      }
      async mcpAuthenticate(Q) {
        return (await this.request({ subtype: "mcp_authenticate", serverName: Q })).response;
      }
      async mcpClearAuth(Q) {
        return (await this.request({ subtype: "mcp_clear_auth", serverName: Q })).response;
      }
      async mcpSubmitOAuthCallbackUrl(Q, $) {
        return (await this.request({ subtype: "mcp_oauth_callback_url", serverName: Q, callbackUrl: $ })).response;
      }
      async claudeAuthenticate(Q) {
        return (await this.request({ subtype: "claude_authenticate", loginWithClaudeAi: Q })).response;
      }
      async claudeOAuthCallback(Q, $) {
        return (await this.request({ subtype: "claude_oauth_callback", authorizationCode: Q, state: $ })).response;
      }
      async claudeOAuthWaitForCompletion() {
        return (await this.request({ subtype: "claude_oauth_wait_for_completion" })).response;
      }
      async mcpServerStatus() {
        return (await this.request({ subtype: "mcp_status" })).response.mcpServers;
      }
      async setMcpServers(Q) {
        let $ = {}, X = {};
        for (let [H, B] of Object.entries(Q)) if (B.type === "sdk" && "instance" in B) $[H] = B.instance;
        else X[H] = B;
        let Y = new Set(this.sdkMcpServerInstances.keys()), J = new Set(Object.keys($));
        for (let H of Y) if (!J.has(H)) await this.disconnectSdkMcpServer(H);
        for (let [H, B] of Object.entries($)) if (!Y.has(H)) this.connectSdkMcpServer(H, B);
        let G = {};
        for (let H of Object.keys($)) G[H] = { type: "sdk", name: H };
        return (await this.request({ subtype: "mcp_set_servers", servers: { ...X, ...G } })).response;
      }
      async accountInfo() {
        return (await this.initialization).account;
      }
      async streamInput(Q) {
        N1("[Query.streamInput] Starting to process input stream");
        try {
          let $ = 0;
          for await (let X of Q) {
            if ($++, N1(`[Query.streamInput] Processing message ${$}: ${X.type}`), this.abortController?.signal.aborted) break;
            await Promise.resolve(this.transport.write(W0(X) + `
`));
          }
          if (N1(`[Query.streamInput] Finished processing ${$} messages from input stream`), $ > 0 && this.hasBidirectionalNeeds()) N1("[Query.streamInput] Has bidirectional needs, waiting for first result"), await this.waitForFirstResult();
          N1("[Query] Calling transport.endInput() to close stdin to CLI process"), this.transport.endInput();
        } catch ($) {
          if (!($ instanceof T0)) throw $;
        }
      }
      waitForFirstResult() {
        if (this.firstResultReceived) return N1("[Query.waitForFirstResult] Result already received, returning immediately"), Promise.resolve();
        return new Promise((Q) => {
          if (this.abortController?.signal.aborted) {
            Q();
            return;
          }
          this.abortController?.signal.addEventListener("abort", () => Q(), { once: true }), this.firstResultReceivedResolve = Q;
        });
      }
      handleHookCallbacks(Q, $, X, Y) {
        let J = this.hookCallbacks.get(Q);
        if (!J) throw Error(`No hook callback found for ID: ${Q}`);
        return J($, X, { signal: Y });
      }
      connectSdkMcpServer(Q, $) {
        let X = new oQ((Y) => this.sendMcpServerMessageToCli(Q, Y));
        this.sdkMcpTransports.set(Q, X), this.sdkMcpServerInstances.set(Q, $), $.connect(X);
      }
      async disconnectSdkMcpServer(Q) {
        let $ = this.sdkMcpTransports.get(Q);
        if ($) await $.close(), this.sdkMcpTransports.delete(Q);
        this.sdkMcpServerInstances.delete(Q);
      }
      sendMcpServerMessageToCli(Q, $) {
        if ("id" in $ && $.id !== null && $.id !== void 0) {
          let Y = `${Q}:${$.id}`, J = this.pendingMcpResponses.get(Y);
          if (J) {
            J.resolve($), this.pendingMcpResponses.delete(Y);
            return;
          }
        }
        let X = { type: "control_request", request_id: n9(), request: { subtype: "mcp_message", server_name: Q, message: $ } };
        this.transport.write(W0(X) + `
`);
      }
      handleMcpControlRequest(Q, $, X) {
        let Y = "id" in $.message ? $.message.id : null, J = `${Q}:${Y}`;
        return new Promise((G, W) => {
          let H = () => {
            this.pendingMcpResponses.delete(J);
          }, B = (K) => {
            H(), G(K);
          }, z = (K) => {
            H(), W(K);
          };
          if (this.pendingMcpResponses.set(J, { resolve: B, reject: z }), X.onmessage) X.onmessage($.message);
          else {
            H(), W(Error("No message handler registered"));
            return;
          }
        });
      }
    };
    vU = 5e3;
    rQ = class {
      closed = false;
      inputStream;
      query;
      queryIterator = null;
      abortController;
      _sessionId = null;
      get sessionId() {
        if (this._sessionId === null) throw Error("Session ID not available until after receiving messages");
        return this._sessionId;
      }
      constructor(Q) {
        if (Q.resume) this._sessionId = Q.resume;
        this.inputStream = new g4();
        let $ = Q.pathToClaudeCodeExecutable;
        if (!$) {
          let J = kU(import.meta.url), G = QJ(J, "..");
          $ = QJ(G, "cli.js");
        }
        let X = { ...Q.env ?? process.env };
        if (!X.CLAUDE_CODE_ENTRYPOINT) X.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
        this.abortController = g6();
        let Y = new y4({ abortController: this.abortController, pathToClaudeCodeExecutable: $, env: X, executable: Q.executable ?? (h6() ? "bun" : "node"), executableArgs: Q.executableArgs ?? [], extraArgs: {}, thinkingConfig: void 0, maxTurns: void 0, maxBudgetUsd: void 0, model: Q.model, fallbackModel: void 0, permissionMode: Q.permissionMode ?? "default", allowDangerouslySkipPermissions: false, continueConversation: false, resume: Q.resume, settingSources: [], allowedTools: Q.allowedTools ?? [], disallowedTools: Q.disallowedTools ?? [], mcpServers: {}, strictMcpConfig: false, canUseTool: !!Q.canUseTool, hooks: !!Q.hooks, includePartialMessages: false, forkSession: false, resumeSessionAt: void 0 });
        this.query = new h4(Y, false, Q.canUseTool, Q.hooks, this.abortController, /* @__PURE__ */ new Map()), this.query.streamInput(this.inputStream);
      }
      async send(Q) {
        if (this.closed) throw Error("Cannot send to closed session");
        let $ = typeof Q === "string" ? { type: "user", session_id: "", message: { role: "user", content: [{ type: "text", text: Q }] }, parent_tool_use_id: null } : Q;
        this.inputStream.enqueue($);
      }
      async *stream() {
        if (!this.queryIterator) this.queryIterator = this.query[Symbol.asyncIterator]();
        while (true) {
          let { value: Q, done: $ } = await this.queryIterator.next();
          if ($) return;
          if (Q.type === "system" && Q.subtype === "init") this._sessionId = Q.session_id;
          if (yield Q, Q.type === "result") return;
        }
      }
      close() {
        if (this.closed) return;
        this.closed = true, this.inputStream.done(), setTimeout(() => {
          if (!this.abortController.signal.aborted) this.abortController.abort();
        }, vU).unref();
      }
      async [Symbol.asyncDispose]() {
        this.close();
      }
    };
    yU = xU(TU);
    r9 = 65536;
    hU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    fU = /^(?:<local-command-stdout>|<session-start-hook>|<tick>|<goal>|\[Request interrupted by user[^\]]*\]|\s*<ide_opened_file>[\s\S]*<\/ide_opened_file>\s*$|\s*<ide_selection>[\s\S]*<\/ide_selection>\s*$)/;
    uU = /<command-name>(.*?)<\/command-name>/;
    o6 = 200;
    cU = 1048576;
    JJ = 5242880;
    a9 = Buffer.from('{"type":"attribution-snapshot"');
    iU = Buffer.from('{"type":"system"');
    f4 = 10;
    nU = Buffer.from([f4]);
    oU = 256;
    KL = 32;
    RL = /* @__PURE__ */ new Set(["user", "assistant", "attachment", "system", "progress"]);
    i1 = {};
    uQ(i1, { void: () => BF, util: () => d, unknown: () => WF, union: () => VF, undefined: () => YF, tuple: () => LF, transformer: () => IF, symbol: () => XF, string: () => EJ, strictObject: () => KF, setErrorMap: () => bL, set: () => OF, record: () => FF, quotelessJson: () => EL, promise: () => RF, preprocess: () => bF, pipeline: () => ZF, ostring: () => CF, optional: () => EF, onumber: () => SF, oboolean: () => _F, objectUtil: () => W$, object: () => z$, number: () => PJ, nullable: () => PF, null: () => JF, never: () => HF, nativeEnum: () => jF, nan: () => eL, map: () => NF, makeIssue: () => l4, literal: () => MF, lazy: () => wF, late: () => aL, isValid: () => m1, isDirty: () => J8, isAsync: () => t6, isAborted: () => Y8, intersection: () => UF, instanceof: () => sL, getParsedType: () => w1, getErrorMap: () => r6, function: () => DF, enum: () => AF, effect: () => IF, discriminatedUnion: () => qF, defaultErrorMap: () => Z1, datetimeRegex: () => jJ, date: () => $F, custom: () => IJ, coerce: () => kF, boolean: () => bJ, bigint: () => QF, array: () => zF, any: () => GF, addIssueToContext: () => E, ZodVoid: () => p4, ZodUnknown: () => l1, ZodUnion: () => X4, ZodUndefined: () => Q4, ZodType: () => p, ZodTuple: () => A1, ZodTransformer: () => G1, ZodSymbol: () => c4, ZodString: () => X1, ZodSet: () => D6, ZodSchema: () => p, ZodRecord: () => d4, ZodReadonly: () => z4, ZodPromise: () => w6, ZodPipeline: () => o4, ZodParsedType: () => I, ZodOptional: () => m0, ZodObject: () => U0, ZodNumber: () => c1, ZodNullable: () => S1, ZodNull: () => $4, ZodNever: () => M1, ZodNativeEnum: () => W4, ZodNaN: () => n4, ZodMap: () => i4, ZodLiteral: () => G4, ZodLazy: () => J4, ZodIssueCode: () => A, ZodIntersection: () => Y4, ZodFunction: () => s6, ZodFirstPartyTypeKind: () => j, ZodError: () => x0, ZodEnum: () => d1, ZodEffects: () => G1, ZodDiscriminatedUnion: () => G8, ZodDefault: () => H4, ZodDate: () => N6, ZodCatch: () => B4, ZodBranded: () => W8, ZodBoolean: () => e6, ZodBigInt: () => p1, ZodArray: () => Y1, ZodAny: () => O6, Schema: () => p, ParseStatus: () => A0, OK: () => b0, NEVER: () => vF, INVALID: () => x, EMPTY_PATH: () => ZL, DIRTY: () => F6, BRAND: () => tL });
    (function(Q) {
      Q.assertEqual = (J) => {
      };
      function $(J) {
      }
      Q.assertIs = $;
      function X(J) {
        throw Error();
      }
      Q.assertNever = X, Q.arrayToEnum = (J) => {
        let G = {};
        for (let W of J) G[W] = W;
        return G;
      }, Q.getValidEnumValues = (J) => {
        let G = Q.objectKeys(J).filter((H) => typeof J[J[H]] !== "number"), W = {};
        for (let H of G) W[H] = J[H];
        return Q.objectValues(W);
      }, Q.objectValues = (J) => {
        return Q.objectKeys(J).map(function(G) {
          return J[G];
        });
      }, Q.objectKeys = typeof Object.keys === "function" ? (J) => Object.keys(J) : (J) => {
        let G = [];
        for (let W in J) if (Object.prototype.hasOwnProperty.call(J, W)) G.push(W);
        return G;
      }, Q.find = (J, G) => {
        for (let W of J) if (G(W)) return W;
        return;
      }, Q.isInteger = typeof Number.isInteger === "function" ? (J) => Number.isInteger(J) : (J) => typeof J === "number" && Number.isFinite(J) && Math.floor(J) === J;
      function Y(J, G = " | ") {
        return J.map((W) => typeof W === "string" ? `'${W}'` : W).join(G);
      }
      Q.joinValues = Y, Q.jsonStringifyReplacer = (J, G) => {
        if (typeof G === "bigint") return G.toString();
        return G;
      };
    })(d || (d = {}));
    (function(Q) {
      Q.mergeShapes = ($, X) => {
        return { ...$, ...X };
      };
    })(W$ || (W$ = {}));
    I = d.arrayToEnum(["string", "nan", "number", "integer", "float", "boolean", "date", "bigint", "symbol", "function", "undefined", "null", "array", "object", "unknown", "promise", "void", "never", "map", "set"]);
    w1 = (Q) => {
      switch (typeof Q) {
        case "undefined":
          return I.undefined;
        case "string":
          return I.string;
        case "number":
          return Number.isNaN(Q) ? I.nan : I.number;
        case "boolean":
          return I.boolean;
        case "function":
          return I.function;
        case "bigint":
          return I.bigint;
        case "symbol":
          return I.symbol;
        case "object":
          if (Array.isArray(Q)) return I.array;
          if (Q === null) return I.null;
          if (Q.then && typeof Q.then === "function" && Q.catch && typeof Q.catch === "function") return I.promise;
          if (typeof Map < "u" && Q instanceof Map) return I.map;
          if (typeof Set < "u" && Q instanceof Set) return I.set;
          if (typeof Date < "u" && Q instanceof Date) return I.date;
          return I.object;
        default:
          return I.unknown;
      }
    };
    A = d.arrayToEnum(["invalid_type", "invalid_literal", "custom", "invalid_union", "invalid_union_discriminator", "invalid_enum_value", "unrecognized_keys", "invalid_arguments", "invalid_return_type", "invalid_date", "invalid_string", "too_small", "too_big", "invalid_intersection_types", "not_multiple_of", "not_finite"]);
    EL = (Q) => {
      return JSON.stringify(Q, null, 2).replace(/"([^"]+)":/g, "$1:");
    };
    x0 = class _x0 extends Error {
      get errors() {
        return this.issues;
      }
      constructor(Q) {
        super();
        this.issues = [], this.addIssue = (X) => {
          this.issues = [...this.issues, X];
        }, this.addIssues = (X = []) => {
          this.issues = [...this.issues, ...X];
        };
        let $ = new.target.prototype;
        if (Object.setPrototypeOf) Object.setPrototypeOf(this, $);
        else this.__proto__ = $;
        this.name = "ZodError", this.issues = Q;
      }
      format(Q) {
        let $ = Q || function(J) {
          return J.message;
        }, X = { _errors: [] }, Y = (J) => {
          for (let G of J.issues) if (G.code === "invalid_union") G.unionErrors.map(Y);
          else if (G.code === "invalid_return_type") Y(G.returnTypeError);
          else if (G.code === "invalid_arguments") Y(G.argumentsError);
          else if (G.path.length === 0) X._errors.push($(G));
          else {
            let W = X, H = 0;
            while (H < G.path.length) {
              let B = G.path[H];
              if (H !== G.path.length - 1) W[B] = W[B] || { _errors: [] };
              else W[B] = W[B] || { _errors: [] }, W[B]._errors.push($(G));
              W = W[B], H++;
            }
          }
        };
        return Y(this), X;
      }
      static assert(Q) {
        if (!(Q instanceof _x0)) throw Error(`Not a ZodError: ${Q}`);
      }
      toString() {
        return this.message;
      }
      get message() {
        return JSON.stringify(this.issues, d.jsonStringifyReplacer, 2);
      }
      get isEmpty() {
        return this.issues.length === 0;
      }
      flatten(Q = ($) => $.message) {
        let $ = {}, X = [];
        for (let Y of this.issues) if (Y.path.length > 0) {
          let J = Y.path[0];
          $[J] = $[J] || [], $[J].push(Q(Y));
        } else X.push(Q(Y));
        return { formErrors: X, fieldErrors: $ };
      }
      get formErrors() {
        return this.flatten();
      }
    };
    x0.create = (Q) => {
      return new x0(Q);
    };
    PL = (Q, $) => {
      let X;
      switch (Q.code) {
        case A.invalid_type:
          if (Q.received === I.undefined) X = "Required";
          else X = `Expected ${Q.expected}, received ${Q.received}`;
          break;
        case A.invalid_literal:
          X = `Invalid literal value, expected ${JSON.stringify(Q.expected, d.jsonStringifyReplacer)}`;
          break;
        case A.unrecognized_keys:
          X = `Unrecognized key(s) in object: ${d.joinValues(Q.keys, ", ")}`;
          break;
        case A.invalid_union:
          X = "Invalid input";
          break;
        case A.invalid_union_discriminator:
          X = `Invalid discriminator value. Expected ${d.joinValues(Q.options)}`;
          break;
        case A.invalid_enum_value:
          X = `Invalid enum value. Expected ${d.joinValues(Q.options)}, received '${Q.received}'`;
          break;
        case A.invalid_arguments:
          X = "Invalid function arguments";
          break;
        case A.invalid_return_type:
          X = "Invalid function return type";
          break;
        case A.invalid_date:
          X = "Invalid date";
          break;
        case A.invalid_string:
          if (typeof Q.validation === "object") if ("includes" in Q.validation) {
            if (X = `Invalid input: must include "${Q.validation.includes}"`, typeof Q.validation.position === "number") X = `${X} at one or more positions greater than or equal to ${Q.validation.position}`;
          } else if ("startsWith" in Q.validation) X = `Invalid input: must start with "${Q.validation.startsWith}"`;
          else if ("endsWith" in Q.validation) X = `Invalid input: must end with "${Q.validation.endsWith}"`;
          else d.assertNever(Q.validation);
          else if (Q.validation !== "regex") X = `Invalid ${Q.validation}`;
          else X = "Invalid";
          break;
        case A.too_small:
          if (Q.type === "array") X = `Array must contain ${Q.exact ? "exactly" : Q.inclusive ? "at least" : "more than"} ${Q.minimum} element(s)`;
          else if (Q.type === "string") X = `String must contain ${Q.exact ? "exactly" : Q.inclusive ? "at least" : "over"} ${Q.minimum} character(s)`;
          else if (Q.type === "number") X = `Number must be ${Q.exact ? "exactly equal to " : Q.inclusive ? "greater than or equal to " : "greater than "}${Q.minimum}`;
          else if (Q.type === "bigint") X = `Number must be ${Q.exact ? "exactly equal to " : Q.inclusive ? "greater than or equal to " : "greater than "}${Q.minimum}`;
          else if (Q.type === "date") X = `Date must be ${Q.exact ? "exactly equal to " : Q.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(Q.minimum))}`;
          else X = "Invalid input";
          break;
        case A.too_big:
          if (Q.type === "array") X = `Array must contain ${Q.exact ? "exactly" : Q.inclusive ? "at most" : "less than"} ${Q.maximum} element(s)`;
          else if (Q.type === "string") X = `String must contain ${Q.exact ? "exactly" : Q.inclusive ? "at most" : "under"} ${Q.maximum} character(s)`;
          else if (Q.type === "number") X = `Number must be ${Q.exact ? "exactly" : Q.inclusive ? "less than or equal to" : "less than"} ${Q.maximum}`;
          else if (Q.type === "bigint") X = `BigInt must be ${Q.exact ? "exactly" : Q.inclusive ? "less than or equal to" : "less than"} ${Q.maximum}`;
          else if (Q.type === "date") X = `Date must be ${Q.exact ? "exactly" : Q.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(Q.maximum))}`;
          else X = "Invalid input";
          break;
        case A.custom:
          X = "Invalid input";
          break;
        case A.invalid_intersection_types:
          X = "Intersection results could not be merged";
          break;
        case A.not_multiple_of:
          X = `Number must be a multiple of ${Q.multipleOf}`;
          break;
        case A.not_finite:
          X = "Number must be finite";
          break;
        default:
          X = $.defaultError, d.assertNever(Q);
      }
      return { message: X };
    };
    Z1 = PL;
    OJ = Z1;
    l4 = (Q) => {
      let { data: $, path: X, errorMaps: Y, issueData: J } = Q, G = [...X, ...J.path || []], W = { ...J, path: G };
      if (J.message !== void 0) return { ...J, path: G, message: J.message };
      let H = "", B = Y.filter((z) => !!z).slice().reverse();
      for (let z of B) H = z(W, { data: $, defaultError: H }).message;
      return { ...J, path: G, message: H };
    };
    ZL = [];
    A0 = class _A0 {
      constructor() {
        this.value = "valid";
      }
      dirty() {
        if (this.value === "valid") this.value = "dirty";
      }
      abort() {
        if (this.value !== "aborted") this.value = "aborted";
      }
      static mergeArray(Q, $) {
        let X = [];
        for (let Y of $) {
          if (Y.status === "aborted") return x;
          if (Y.status === "dirty") Q.dirty();
          X.push(Y.value);
        }
        return { status: Q.value, value: X };
      }
      static async mergeObjectAsync(Q, $) {
        let X = [];
        for (let Y of $) {
          let J = await Y.key, G = await Y.value;
          X.push({ key: J, value: G });
        }
        return _A0.mergeObjectSync(Q, X);
      }
      static mergeObjectSync(Q, $) {
        let X = {};
        for (let Y of $) {
          let { key: J, value: G } = Y;
          if (J.status === "aborted") return x;
          if (G.status === "aborted") return x;
          if (J.status === "dirty") Q.dirty();
          if (G.status === "dirty") Q.dirty();
          if (J.value !== "__proto__" && (typeof G.value < "u" || Y.alwaysSet)) X[J.value] = G.value;
        }
        return { status: Q.value, value: X };
      }
    };
    x = Object.freeze({ status: "aborted" });
    F6 = (Q) => ({ status: "dirty", value: Q });
    b0 = (Q) => ({ status: "valid", value: Q });
    Y8 = (Q) => Q.status === "aborted";
    J8 = (Q) => Q.status === "dirty";
    m1 = (Q) => Q.status === "valid";
    t6 = (Q) => typeof Promise < "u" && Q instanceof Promise;
    (function(Q) {
      Q.errToObj = ($) => typeof $ === "string" ? { message: $ } : $ || {}, Q.toString = ($) => typeof $ === "string" ? $ : $?.message;
    })(C || (C = {}));
    J1 = class {
      constructor(Q, $, X, Y) {
        this._cachedPath = [], this.parent = Q, this.data = $, this._path = X, this._key = Y;
      }
      get path() {
        if (!this._cachedPath.length) if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
        else this._cachedPath.push(...this._path, this._key);
        return this._cachedPath;
      }
    };
    DJ = (Q, $) => {
      if (m1($)) return { success: true, data: $.value };
      else {
        if (!Q.common.issues.length) throw Error("Validation failed but no issues detected.");
        return { success: false, get error() {
          if (this._error) return this._error;
          let X = new x0(Q.common.issues);
          return this._error = X, this._error;
        } };
      }
    };
    p = class {
      get description() {
        return this._def.description;
      }
      _getType(Q) {
        return w1(Q.data);
      }
      _getOrReturnCtx(Q, $) {
        return $ || { common: Q.parent.common, data: Q.data, parsedType: w1(Q.data), schemaErrorMap: this._def.errorMap, path: Q.path, parent: Q.parent };
      }
      _processInputParams(Q) {
        return { status: new A0(), ctx: { common: Q.parent.common, data: Q.data, parsedType: w1(Q.data), schemaErrorMap: this._def.errorMap, path: Q.path, parent: Q.parent } };
      }
      _parseSync(Q) {
        let $ = this._parse(Q);
        if (t6($)) throw Error("Synchronous parse encountered promise.");
        return $;
      }
      _parseAsync(Q) {
        let $ = this._parse(Q);
        return Promise.resolve($);
      }
      parse(Q, $) {
        let X = this.safeParse(Q, $);
        if (X.success) return X.data;
        throw X.error;
      }
      safeParse(Q, $) {
        let X = { common: { issues: [], async: $?.async ?? false, contextualErrorMap: $?.errorMap }, path: $?.path || [], schemaErrorMap: this._def.errorMap, parent: null, data: Q, parsedType: w1(Q) }, Y = this._parseSync({ data: Q, path: X.path, parent: X });
        return DJ(X, Y);
      }
      "~validate"(Q) {
        let $ = { common: { issues: [], async: !!this["~standard"].async }, path: [], schemaErrorMap: this._def.errorMap, parent: null, data: Q, parsedType: w1(Q) };
        if (!this["~standard"].async) try {
          let X = this._parseSync({ data: Q, path: [], parent: $ });
          return m1(X) ? { value: X.value } : { issues: $.common.issues };
        } catch (X) {
          if (X?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
          $.common = { issues: [], async: true };
        }
        return this._parseAsync({ data: Q, path: [], parent: $ }).then((X) => m1(X) ? { value: X.value } : { issues: $.common.issues });
      }
      async parseAsync(Q, $) {
        let X = await this.safeParseAsync(Q, $);
        if (X.success) return X.data;
        throw X.error;
      }
      async safeParseAsync(Q, $) {
        let X = { common: { issues: [], contextualErrorMap: $?.errorMap, async: true }, path: $?.path || [], schemaErrorMap: this._def.errorMap, parent: null, data: Q, parsedType: w1(Q) }, Y = this._parse({ data: Q, path: X.path, parent: X }), J = await (t6(Y) ? Y : Promise.resolve(Y));
        return DJ(X, J);
      }
      refine(Q, $) {
        let X = (Y) => {
          if (typeof $ === "string" || typeof $ > "u") return { message: $ };
          else if (typeof $ === "function") return $(Y);
          else return $;
        };
        return this._refinement((Y, J) => {
          let G = Q(Y), W = () => J.addIssue({ code: A.custom, ...X(Y) });
          if (typeof Promise < "u" && G instanceof Promise) return G.then((H) => {
            if (!H) return W(), false;
            else return true;
          });
          if (!G) return W(), false;
          else return true;
        });
      }
      refinement(Q, $) {
        return this._refinement((X, Y) => {
          if (!Q(X)) return Y.addIssue(typeof $ === "function" ? $(X, Y) : $), false;
          else return true;
        });
      }
      _refinement(Q) {
        return new G1({ schema: this, typeName: j.ZodEffects, effect: { type: "refinement", refinement: Q } });
      }
      superRefine(Q) {
        return this._refinement(Q);
      }
      constructor(Q) {
        this.spa = this.safeParseAsync, this._def = Q, this.parse = this.parse.bind(this), this.safeParse = this.safeParse.bind(this), this.parseAsync = this.parseAsync.bind(this), this.safeParseAsync = this.safeParseAsync.bind(this), this.spa = this.spa.bind(this), this.refine = this.refine.bind(this), this.refinement = this.refinement.bind(this), this.superRefine = this.superRefine.bind(this), this.optional = this.optional.bind(this), this.nullable = this.nullable.bind(this), this.nullish = this.nullish.bind(this), this.array = this.array.bind(this), this.promise = this.promise.bind(this), this.or = this.or.bind(this), this.and = this.and.bind(this), this.transform = this.transform.bind(this), this.brand = this.brand.bind(this), this.default = this.default.bind(this), this.catch = this.catch.bind(this), this.describe = this.describe.bind(this), this.pipe = this.pipe.bind(this), this.readonly = this.readonly.bind(this), this.isNullable = this.isNullable.bind(this), this.isOptional = this.isOptional.bind(this), this["~standard"] = { version: 1, vendor: "zod", validate: ($) => this["~validate"]($) };
      }
      optional() {
        return m0.create(this, this._def);
      }
      nullable() {
        return S1.create(this, this._def);
      }
      nullish() {
        return this.nullable().optional();
      }
      array() {
        return Y1.create(this);
      }
      promise() {
        return w6.create(this, this._def);
      }
      or(Q) {
        return X4.create([this, Q], this._def);
      }
      and(Q) {
        return Y4.create(this, Q, this._def);
      }
      transform(Q) {
        return new G1({ ...m(this._def), schema: this, typeName: j.ZodEffects, effect: { type: "transform", transform: Q } });
      }
      default(Q) {
        let $ = typeof Q === "function" ? Q : () => Q;
        return new H4({ ...m(this._def), innerType: this, defaultValue: $, typeName: j.ZodDefault });
      }
      brand() {
        return new W8({ typeName: j.ZodBranded, type: this, ...m(this._def) });
      }
      catch(Q) {
        let $ = typeof Q === "function" ? Q : () => Q;
        return new B4({ ...m(this._def), innerType: this, catchValue: $, typeName: j.ZodCatch });
      }
      describe(Q) {
        return new this.constructor({ ...this._def, description: Q });
      }
      pipe(Q) {
        return o4.create(this, Q);
      }
      readonly() {
        return z4.create(this);
      }
      isOptional() {
        return this.safeParse(void 0).success;
      }
      isNullable() {
        return this.safeParse(null).success;
      }
    };
    CL = /^c[^\s-]{8,}$/i;
    SL = /^[0-9a-z]+$/;
    _L = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
    kL = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
    vL = /^[a-z0-9_-]{21}$/i;
    TL = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    xL = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
    yL = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
    gL = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
    hL = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    fL = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
    uL = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    mL = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    lL = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    cL = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
    MJ = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))";
    pL = new RegExp(`^${MJ}$`);
    X1 = class _X1 extends p {
      _parse(Q) {
        if (this._def.coerce) Q.data = String(Q.data);
        if (this._getType(Q) !== I.string) {
          let J = this._getOrReturnCtx(Q);
          return E(J, { code: A.invalid_type, expected: I.string, received: J.parsedType }), x;
        }
        let X = new A0(), Y = void 0;
        for (let J of this._def.checks) if (J.kind === "min") {
          if (Q.data.length < J.value) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.too_small, minimum: J.value, type: "string", inclusive: true, exact: false, message: J.message }), X.dirty();
        } else if (J.kind === "max") {
          if (Q.data.length > J.value) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.too_big, maximum: J.value, type: "string", inclusive: true, exact: false, message: J.message }), X.dirty();
        } else if (J.kind === "length") {
          let G = Q.data.length > J.value, W = Q.data.length < J.value;
          if (G || W) {
            if (Y = this._getOrReturnCtx(Q, Y), G) E(Y, { code: A.too_big, maximum: J.value, type: "string", inclusive: true, exact: true, message: J.message });
            else if (W) E(Y, { code: A.too_small, minimum: J.value, type: "string", inclusive: true, exact: true, message: J.message });
            X.dirty();
          }
        } else if (J.kind === "email") {
          if (!yL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "email", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "emoji") {
          if (!H$) H$ = new RegExp(gL, "u");
          if (!H$.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "emoji", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "uuid") {
          if (!kL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "uuid", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "nanoid") {
          if (!vL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "nanoid", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "cuid") {
          if (!CL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "cuid", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "cuid2") {
          if (!SL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "cuid2", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "ulid") {
          if (!_L.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "ulid", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "url") try {
          new URL(Q.data);
        } catch {
          Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "url", code: A.invalid_string, message: J.message }), X.dirty();
        }
        else if (J.kind === "regex") {
          if (J.regex.lastIndex = 0, !J.regex.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "regex", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "trim") Q.data = Q.data.trim();
        else if (J.kind === "includes") {
          if (!Q.data.includes(J.value, J.position)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: { includes: J.value, position: J.position }, message: J.message }), X.dirty();
        } else if (J.kind === "toLowerCase") Q.data = Q.data.toLowerCase();
        else if (J.kind === "toUpperCase") Q.data = Q.data.toUpperCase();
        else if (J.kind === "startsWith") {
          if (!Q.data.startsWith(J.value)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: { startsWith: J.value }, message: J.message }), X.dirty();
        } else if (J.kind === "endsWith") {
          if (!Q.data.endsWith(J.value)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: { endsWith: J.value }, message: J.message }), X.dirty();
        } else if (J.kind === "datetime") {
          if (!jJ(J).test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: "datetime", message: J.message }), X.dirty();
        } else if (J.kind === "date") {
          if (!pL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: "date", message: J.message }), X.dirty();
        } else if (J.kind === "time") {
          if (!dL(J).test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.invalid_string, validation: "time", message: J.message }), X.dirty();
        } else if (J.kind === "duration") {
          if (!xL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "duration", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "ip") {
          if (!iL(Q.data, J.version)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "ip", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "jwt") {
          if (!nL(Q.data, J.alg)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "jwt", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "cidr") {
          if (!oL(Q.data, J.version)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "cidr", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "base64") {
          if (!lL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "base64", code: A.invalid_string, message: J.message }), X.dirty();
        } else if (J.kind === "base64url") {
          if (!cL.test(Q.data)) Y = this._getOrReturnCtx(Q, Y), E(Y, { validation: "base64url", code: A.invalid_string, message: J.message }), X.dirty();
        } else d.assertNever(J);
        return { status: X.value, value: Q.data };
      }
      _regex(Q, $, X) {
        return this.refinement((Y) => Q.test(Y), { validation: $, code: A.invalid_string, ...C.errToObj(X) });
      }
      _addCheck(Q) {
        return new _X1({ ...this._def, checks: [...this._def.checks, Q] });
      }
      email(Q) {
        return this._addCheck({ kind: "email", ...C.errToObj(Q) });
      }
      url(Q) {
        return this._addCheck({ kind: "url", ...C.errToObj(Q) });
      }
      emoji(Q) {
        return this._addCheck({ kind: "emoji", ...C.errToObj(Q) });
      }
      uuid(Q) {
        return this._addCheck({ kind: "uuid", ...C.errToObj(Q) });
      }
      nanoid(Q) {
        return this._addCheck({ kind: "nanoid", ...C.errToObj(Q) });
      }
      cuid(Q) {
        return this._addCheck({ kind: "cuid", ...C.errToObj(Q) });
      }
      cuid2(Q) {
        return this._addCheck({ kind: "cuid2", ...C.errToObj(Q) });
      }
      ulid(Q) {
        return this._addCheck({ kind: "ulid", ...C.errToObj(Q) });
      }
      base64(Q) {
        return this._addCheck({ kind: "base64", ...C.errToObj(Q) });
      }
      base64url(Q) {
        return this._addCheck({ kind: "base64url", ...C.errToObj(Q) });
      }
      jwt(Q) {
        return this._addCheck({ kind: "jwt", ...C.errToObj(Q) });
      }
      ip(Q) {
        return this._addCheck({ kind: "ip", ...C.errToObj(Q) });
      }
      cidr(Q) {
        return this._addCheck({ kind: "cidr", ...C.errToObj(Q) });
      }
      datetime(Q) {
        if (typeof Q === "string") return this._addCheck({ kind: "datetime", precision: null, offset: false, local: false, message: Q });
        return this._addCheck({ kind: "datetime", precision: typeof Q?.precision > "u" ? null : Q?.precision, offset: Q?.offset ?? false, local: Q?.local ?? false, ...C.errToObj(Q?.message) });
      }
      date(Q) {
        return this._addCheck({ kind: "date", message: Q });
      }
      time(Q) {
        if (typeof Q === "string") return this._addCheck({ kind: "time", precision: null, message: Q });
        return this._addCheck({ kind: "time", precision: typeof Q?.precision > "u" ? null : Q?.precision, ...C.errToObj(Q?.message) });
      }
      duration(Q) {
        return this._addCheck({ kind: "duration", ...C.errToObj(Q) });
      }
      regex(Q, $) {
        return this._addCheck({ kind: "regex", regex: Q, ...C.errToObj($) });
      }
      includes(Q, $) {
        return this._addCheck({ kind: "includes", value: Q, position: $?.position, ...C.errToObj($?.message) });
      }
      startsWith(Q, $) {
        return this._addCheck({ kind: "startsWith", value: Q, ...C.errToObj($) });
      }
      endsWith(Q, $) {
        return this._addCheck({ kind: "endsWith", value: Q, ...C.errToObj($) });
      }
      min(Q, $) {
        return this._addCheck({ kind: "min", value: Q, ...C.errToObj($) });
      }
      max(Q, $) {
        return this._addCheck({ kind: "max", value: Q, ...C.errToObj($) });
      }
      length(Q, $) {
        return this._addCheck({ kind: "length", value: Q, ...C.errToObj($) });
      }
      nonempty(Q) {
        return this.min(1, C.errToObj(Q));
      }
      trim() {
        return new _X1({ ...this._def, checks: [...this._def.checks, { kind: "trim" }] });
      }
      toLowerCase() {
        return new _X1({ ...this._def, checks: [...this._def.checks, { kind: "toLowerCase" }] });
      }
      toUpperCase() {
        return new _X1({ ...this._def, checks: [...this._def.checks, { kind: "toUpperCase" }] });
      }
      get isDatetime() {
        return !!this._def.checks.find((Q) => Q.kind === "datetime");
      }
      get isDate() {
        return !!this._def.checks.find((Q) => Q.kind === "date");
      }
      get isTime() {
        return !!this._def.checks.find((Q) => Q.kind === "time");
      }
      get isDuration() {
        return !!this._def.checks.find((Q) => Q.kind === "duration");
      }
      get isEmail() {
        return !!this._def.checks.find((Q) => Q.kind === "email");
      }
      get isURL() {
        return !!this._def.checks.find((Q) => Q.kind === "url");
      }
      get isEmoji() {
        return !!this._def.checks.find((Q) => Q.kind === "emoji");
      }
      get isUUID() {
        return !!this._def.checks.find((Q) => Q.kind === "uuid");
      }
      get isNANOID() {
        return !!this._def.checks.find((Q) => Q.kind === "nanoid");
      }
      get isCUID() {
        return !!this._def.checks.find((Q) => Q.kind === "cuid");
      }
      get isCUID2() {
        return !!this._def.checks.find((Q) => Q.kind === "cuid2");
      }
      get isULID() {
        return !!this._def.checks.find((Q) => Q.kind === "ulid");
      }
      get isIP() {
        return !!this._def.checks.find((Q) => Q.kind === "ip");
      }
      get isCIDR() {
        return !!this._def.checks.find((Q) => Q.kind === "cidr");
      }
      get isBase64() {
        return !!this._def.checks.find((Q) => Q.kind === "base64");
      }
      get isBase64url() {
        return !!this._def.checks.find((Q) => Q.kind === "base64url");
      }
      get minLength() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "min") {
          if (Q === null || $.value > Q) Q = $.value;
        }
        return Q;
      }
      get maxLength() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "max") {
          if (Q === null || $.value < Q) Q = $.value;
        }
        return Q;
      }
    };
    X1.create = (Q) => {
      return new X1({ checks: [], typeName: j.ZodString, coerce: Q?.coerce ?? false, ...m(Q) });
    };
    c1 = class _c1 extends p {
      constructor() {
        super(...arguments);
        this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
      }
      _parse(Q) {
        if (this._def.coerce) Q.data = Number(Q.data);
        if (this._getType(Q) !== I.number) {
          let J = this._getOrReturnCtx(Q);
          return E(J, { code: A.invalid_type, expected: I.number, received: J.parsedType }), x;
        }
        let X = void 0, Y = new A0();
        for (let J of this._def.checks) if (J.kind === "int") {
          if (!d.isInteger(Q.data)) X = this._getOrReturnCtx(Q, X), E(X, { code: A.invalid_type, expected: "integer", received: "float", message: J.message }), Y.dirty();
        } else if (J.kind === "min") {
          if (J.inclusive ? Q.data < J.value : Q.data <= J.value) X = this._getOrReturnCtx(Q, X), E(X, { code: A.too_small, minimum: J.value, type: "number", inclusive: J.inclusive, exact: false, message: J.message }), Y.dirty();
        } else if (J.kind === "max") {
          if (J.inclusive ? Q.data > J.value : Q.data >= J.value) X = this._getOrReturnCtx(Q, X), E(X, { code: A.too_big, maximum: J.value, type: "number", inclusive: J.inclusive, exact: false, message: J.message }), Y.dirty();
        } else if (J.kind === "multipleOf") {
          if (rL(Q.data, J.value) !== 0) X = this._getOrReturnCtx(Q, X), E(X, { code: A.not_multiple_of, multipleOf: J.value, message: J.message }), Y.dirty();
        } else if (J.kind === "finite") {
          if (!Number.isFinite(Q.data)) X = this._getOrReturnCtx(Q, X), E(X, { code: A.not_finite, message: J.message }), Y.dirty();
        } else d.assertNever(J);
        return { status: Y.value, value: Q.data };
      }
      gte(Q, $) {
        return this.setLimit("min", Q, true, C.toString($));
      }
      gt(Q, $) {
        return this.setLimit("min", Q, false, C.toString($));
      }
      lte(Q, $) {
        return this.setLimit("max", Q, true, C.toString($));
      }
      lt(Q, $) {
        return this.setLimit("max", Q, false, C.toString($));
      }
      setLimit(Q, $, X, Y) {
        return new _c1({ ...this._def, checks: [...this._def.checks, { kind: Q, value: $, inclusive: X, message: C.toString(Y) }] });
      }
      _addCheck(Q) {
        return new _c1({ ...this._def, checks: [...this._def.checks, Q] });
      }
      int(Q) {
        return this._addCheck({ kind: "int", message: C.toString(Q) });
      }
      positive(Q) {
        return this._addCheck({ kind: "min", value: 0, inclusive: false, message: C.toString(Q) });
      }
      negative(Q) {
        return this._addCheck({ kind: "max", value: 0, inclusive: false, message: C.toString(Q) });
      }
      nonpositive(Q) {
        return this._addCheck({ kind: "max", value: 0, inclusive: true, message: C.toString(Q) });
      }
      nonnegative(Q) {
        return this._addCheck({ kind: "min", value: 0, inclusive: true, message: C.toString(Q) });
      }
      multipleOf(Q, $) {
        return this._addCheck({ kind: "multipleOf", value: Q, message: C.toString($) });
      }
      finite(Q) {
        return this._addCheck({ kind: "finite", message: C.toString(Q) });
      }
      safe(Q) {
        return this._addCheck({ kind: "min", inclusive: true, value: Number.MIN_SAFE_INTEGER, message: C.toString(Q) })._addCheck({ kind: "max", inclusive: true, value: Number.MAX_SAFE_INTEGER, message: C.toString(Q) });
      }
      get minValue() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "min") {
          if (Q === null || $.value > Q) Q = $.value;
        }
        return Q;
      }
      get maxValue() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "max") {
          if (Q === null || $.value < Q) Q = $.value;
        }
        return Q;
      }
      get isInt() {
        return !!this._def.checks.find((Q) => Q.kind === "int" || Q.kind === "multipleOf" && d.isInteger(Q.value));
      }
      get isFinite() {
        let Q = null, $ = null;
        for (let X of this._def.checks) if (X.kind === "finite" || X.kind === "int" || X.kind === "multipleOf") return true;
        else if (X.kind === "min") {
          if ($ === null || X.value > $) $ = X.value;
        } else if (X.kind === "max") {
          if (Q === null || X.value < Q) Q = X.value;
        }
        return Number.isFinite($) && Number.isFinite(Q);
      }
    };
    c1.create = (Q) => {
      return new c1({ checks: [], typeName: j.ZodNumber, coerce: Q?.coerce || false, ...m(Q) });
    };
    p1 = class _p1 extends p {
      constructor() {
        super(...arguments);
        this.min = this.gte, this.max = this.lte;
      }
      _parse(Q) {
        if (this._def.coerce) try {
          Q.data = BigInt(Q.data);
        } catch {
          return this._getInvalidInput(Q);
        }
        if (this._getType(Q) !== I.bigint) return this._getInvalidInput(Q);
        let X = void 0, Y = new A0();
        for (let J of this._def.checks) if (J.kind === "min") {
          if (J.inclusive ? Q.data < J.value : Q.data <= J.value) X = this._getOrReturnCtx(Q, X), E(X, { code: A.too_small, type: "bigint", minimum: J.value, inclusive: J.inclusive, message: J.message }), Y.dirty();
        } else if (J.kind === "max") {
          if (J.inclusive ? Q.data > J.value : Q.data >= J.value) X = this._getOrReturnCtx(Q, X), E(X, { code: A.too_big, type: "bigint", maximum: J.value, inclusive: J.inclusive, message: J.message }), Y.dirty();
        } else if (J.kind === "multipleOf") {
          if (Q.data % J.value !== BigInt(0)) X = this._getOrReturnCtx(Q, X), E(X, { code: A.not_multiple_of, multipleOf: J.value, message: J.message }), Y.dirty();
        } else d.assertNever(J);
        return { status: Y.value, value: Q.data };
      }
      _getInvalidInput(Q) {
        let $ = this._getOrReturnCtx(Q);
        return E($, { code: A.invalid_type, expected: I.bigint, received: $.parsedType }), x;
      }
      gte(Q, $) {
        return this.setLimit("min", Q, true, C.toString($));
      }
      gt(Q, $) {
        return this.setLimit("min", Q, false, C.toString($));
      }
      lte(Q, $) {
        return this.setLimit("max", Q, true, C.toString($));
      }
      lt(Q, $) {
        return this.setLimit("max", Q, false, C.toString($));
      }
      setLimit(Q, $, X, Y) {
        return new _p1({ ...this._def, checks: [...this._def.checks, { kind: Q, value: $, inclusive: X, message: C.toString(Y) }] });
      }
      _addCheck(Q) {
        return new _p1({ ...this._def, checks: [...this._def.checks, Q] });
      }
      positive(Q) {
        return this._addCheck({ kind: "min", value: BigInt(0), inclusive: false, message: C.toString(Q) });
      }
      negative(Q) {
        return this._addCheck({ kind: "max", value: BigInt(0), inclusive: false, message: C.toString(Q) });
      }
      nonpositive(Q) {
        return this._addCheck({ kind: "max", value: BigInt(0), inclusive: true, message: C.toString(Q) });
      }
      nonnegative(Q) {
        return this._addCheck({ kind: "min", value: BigInt(0), inclusive: true, message: C.toString(Q) });
      }
      multipleOf(Q, $) {
        return this._addCheck({ kind: "multipleOf", value: Q, message: C.toString($) });
      }
      get minValue() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "min") {
          if (Q === null || $.value > Q) Q = $.value;
        }
        return Q;
      }
      get maxValue() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "max") {
          if (Q === null || $.value < Q) Q = $.value;
        }
        return Q;
      }
    };
    p1.create = (Q) => {
      return new p1({ checks: [], typeName: j.ZodBigInt, coerce: Q?.coerce ?? false, ...m(Q) });
    };
    e6 = class extends p {
      _parse(Q) {
        if (this._def.coerce) Q.data = Boolean(Q.data);
        if (this._getType(Q) !== I.boolean) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.boolean, received: X.parsedType }), x;
        }
        return b0(Q.data);
      }
    };
    e6.create = (Q) => {
      return new e6({ typeName: j.ZodBoolean, coerce: Q?.coerce || false, ...m(Q) });
    };
    N6 = class _N6 extends p {
      _parse(Q) {
        if (this._def.coerce) Q.data = new Date(Q.data);
        if (this._getType(Q) !== I.date) {
          let J = this._getOrReturnCtx(Q);
          return E(J, { code: A.invalid_type, expected: I.date, received: J.parsedType }), x;
        }
        if (Number.isNaN(Q.data.getTime())) {
          let J = this._getOrReturnCtx(Q);
          return E(J, { code: A.invalid_date }), x;
        }
        let X = new A0(), Y = void 0;
        for (let J of this._def.checks) if (J.kind === "min") {
          if (Q.data.getTime() < J.value) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.too_small, message: J.message, inclusive: true, exact: false, minimum: J.value, type: "date" }), X.dirty();
        } else if (J.kind === "max") {
          if (Q.data.getTime() > J.value) Y = this._getOrReturnCtx(Q, Y), E(Y, { code: A.too_big, message: J.message, inclusive: true, exact: false, maximum: J.value, type: "date" }), X.dirty();
        } else d.assertNever(J);
        return { status: X.value, value: new Date(Q.data.getTime()) };
      }
      _addCheck(Q) {
        return new _N6({ ...this._def, checks: [...this._def.checks, Q] });
      }
      min(Q, $) {
        return this._addCheck({ kind: "min", value: Q.getTime(), message: C.toString($) });
      }
      max(Q, $) {
        return this._addCheck({ kind: "max", value: Q.getTime(), message: C.toString($) });
      }
      get minDate() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "min") {
          if (Q === null || $.value > Q) Q = $.value;
        }
        return Q != null ? new Date(Q) : null;
      }
      get maxDate() {
        let Q = null;
        for (let $ of this._def.checks) if ($.kind === "max") {
          if (Q === null || $.value < Q) Q = $.value;
        }
        return Q != null ? new Date(Q) : null;
      }
    };
    N6.create = (Q) => {
      return new N6({ checks: [], coerce: Q?.coerce || false, typeName: j.ZodDate, ...m(Q) });
    };
    c4 = class extends p {
      _parse(Q) {
        if (this._getType(Q) !== I.symbol) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.symbol, received: X.parsedType }), x;
        }
        return b0(Q.data);
      }
    };
    c4.create = (Q) => {
      return new c4({ typeName: j.ZodSymbol, ...m(Q) });
    };
    Q4 = class extends p {
      _parse(Q) {
        if (this._getType(Q) !== I.undefined) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.undefined, received: X.parsedType }), x;
        }
        return b0(Q.data);
      }
    };
    Q4.create = (Q) => {
      return new Q4({ typeName: j.ZodUndefined, ...m(Q) });
    };
    $4 = class extends p {
      _parse(Q) {
        if (this._getType(Q) !== I.null) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.null, received: X.parsedType }), x;
        }
        return b0(Q.data);
      }
    };
    $4.create = (Q) => {
      return new $4({ typeName: j.ZodNull, ...m(Q) });
    };
    O6 = class extends p {
      constructor() {
        super(...arguments);
        this._any = true;
      }
      _parse(Q) {
        return b0(Q.data);
      }
    };
    O6.create = (Q) => {
      return new O6({ typeName: j.ZodAny, ...m(Q) });
    };
    l1 = class extends p {
      constructor() {
        super(...arguments);
        this._unknown = true;
      }
      _parse(Q) {
        return b0(Q.data);
      }
    };
    l1.create = (Q) => {
      return new l1({ typeName: j.ZodUnknown, ...m(Q) });
    };
    M1 = class extends p {
      _parse(Q) {
        let $ = this._getOrReturnCtx(Q);
        return E($, { code: A.invalid_type, expected: I.never, received: $.parsedType }), x;
      }
    };
    M1.create = (Q) => {
      return new M1({ typeName: j.ZodNever, ...m(Q) });
    };
    p4 = class extends p {
      _parse(Q) {
        if (this._getType(Q) !== I.undefined) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.void, received: X.parsedType }), x;
        }
        return b0(Q.data);
      }
    };
    p4.create = (Q) => {
      return new p4({ typeName: j.ZodVoid, ...m(Q) });
    };
    Y1 = class _Y1 extends p {
      _parse(Q) {
        let { ctx: $, status: X } = this._processInputParams(Q), Y = this._def;
        if ($.parsedType !== I.array) return E($, { code: A.invalid_type, expected: I.array, received: $.parsedType }), x;
        if (Y.exactLength !== null) {
          let G = $.data.length > Y.exactLength.value, W = $.data.length < Y.exactLength.value;
          if (G || W) E($, { code: G ? A.too_big : A.too_small, minimum: W ? Y.exactLength.value : void 0, maximum: G ? Y.exactLength.value : void 0, type: "array", inclusive: true, exact: true, message: Y.exactLength.message }), X.dirty();
        }
        if (Y.minLength !== null) {
          if ($.data.length < Y.minLength.value) E($, { code: A.too_small, minimum: Y.minLength.value, type: "array", inclusive: true, exact: false, message: Y.minLength.message }), X.dirty();
        }
        if (Y.maxLength !== null) {
          if ($.data.length > Y.maxLength.value) E($, { code: A.too_big, maximum: Y.maxLength.value, type: "array", inclusive: true, exact: false, message: Y.maxLength.message }), X.dirty();
        }
        if ($.common.async) return Promise.all([...$.data].map((G, W) => {
          return Y.type._parseAsync(new J1($, G, $.path, W));
        })).then((G) => {
          return A0.mergeArray(X, G);
        });
        let J = [...$.data].map((G, W) => {
          return Y.type._parseSync(new J1($, G, $.path, W));
        });
        return A0.mergeArray(X, J);
      }
      get element() {
        return this._def.type;
      }
      min(Q, $) {
        return new _Y1({ ...this._def, minLength: { value: Q, message: C.toString($) } });
      }
      max(Q, $) {
        return new _Y1({ ...this._def, maxLength: { value: Q, message: C.toString($) } });
      }
      length(Q, $) {
        return new _Y1({ ...this._def, exactLength: { value: Q, message: C.toString($) } });
      }
      nonempty(Q) {
        return this.min(1, Q);
      }
    };
    Y1.create = (Q, $) => {
      return new Y1({ type: Q, minLength: null, maxLength: null, exactLength: null, typeName: j.ZodArray, ...m($) });
    };
    U0 = class _U0 extends p {
      constructor() {
        super(...arguments);
        this._cached = null, this.nonstrict = this.passthrough, this.augment = this.extend;
      }
      _getCached() {
        if (this._cached !== null) return this._cached;
        let Q = this._def.shape(), $ = d.objectKeys(Q);
        return this._cached = { shape: Q, keys: $ }, this._cached;
      }
      _parse(Q) {
        if (this._getType(Q) !== I.object) {
          let B = this._getOrReturnCtx(Q);
          return E(B, { code: A.invalid_type, expected: I.object, received: B.parsedType }), x;
        }
        let { status: X, ctx: Y } = this._processInputParams(Q), { shape: J, keys: G } = this._getCached(), W = [];
        if (!(this._def.catchall instanceof M1 && this._def.unknownKeys === "strip")) {
          for (let B in Y.data) if (!G.includes(B)) W.push(B);
        }
        let H = [];
        for (let B of G) {
          let z = J[B], K = Y.data[B];
          H.push({ key: { status: "valid", value: B }, value: z._parse(new J1(Y, K, Y.path, B)), alwaysSet: B in Y.data });
        }
        if (this._def.catchall instanceof M1) {
          let B = this._def.unknownKeys;
          if (B === "passthrough") for (let z of W) H.push({ key: { status: "valid", value: z }, value: { status: "valid", value: Y.data[z] } });
          else if (B === "strict") {
            if (W.length > 0) E(Y, { code: A.unrecognized_keys, keys: W }), X.dirty();
          } else if (B === "strip") ;
          else throw Error("Internal ZodObject error: invalid unknownKeys value.");
        } else {
          let B = this._def.catchall;
          for (let z of W) {
            let K = Y.data[z];
            H.push({ key: { status: "valid", value: z }, value: B._parse(new J1(Y, K, Y.path, z)), alwaysSet: z in Y.data });
          }
        }
        if (Y.common.async) return Promise.resolve().then(async () => {
          let B = [];
          for (let z of H) {
            let K = await z.key, U = await z.value;
            B.push({ key: K, value: U, alwaysSet: z.alwaysSet });
          }
          return B;
        }).then((B) => {
          return A0.mergeObjectSync(X, B);
        });
        else return A0.mergeObjectSync(X, H);
      }
      get shape() {
        return this._def.shape();
      }
      strict(Q) {
        return C.errToObj, new _U0({ ...this._def, unknownKeys: "strict", ...Q !== void 0 ? { errorMap: ($, X) => {
          let Y = this._def.errorMap?.($, X).message ?? X.defaultError;
          if ($.code === "unrecognized_keys") return { message: C.errToObj(Q).message ?? Y };
          return { message: Y };
        } } : {} });
      }
      strip() {
        return new _U0({ ...this._def, unknownKeys: "strip" });
      }
      passthrough() {
        return new _U0({ ...this._def, unknownKeys: "passthrough" });
      }
      extend(Q) {
        return new _U0({ ...this._def, shape: () => ({ ...this._def.shape(), ...Q }) });
      }
      merge(Q) {
        return new _U0({ unknownKeys: Q._def.unknownKeys, catchall: Q._def.catchall, shape: () => ({ ...this._def.shape(), ...Q._def.shape() }), typeName: j.ZodObject });
      }
      setKey(Q, $) {
        return this.augment({ [Q]: $ });
      }
      catchall(Q) {
        return new _U0({ ...this._def, catchall: Q });
      }
      pick(Q) {
        let $ = {};
        for (let X of d.objectKeys(Q)) if (Q[X] && this.shape[X]) $[X] = this.shape[X];
        return new _U0({ ...this._def, shape: () => $ });
      }
      omit(Q) {
        let $ = {};
        for (let X of d.objectKeys(this.shape)) if (!Q[X]) $[X] = this.shape[X];
        return new _U0({ ...this._def, shape: () => $ });
      }
      deepPartial() {
        return a6(this);
      }
      partial(Q) {
        let $ = {};
        for (let X of d.objectKeys(this.shape)) {
          let Y = this.shape[X];
          if (Q && !Q[X]) $[X] = Y;
          else $[X] = Y.optional();
        }
        return new _U0({ ...this._def, shape: () => $ });
      }
      required(Q) {
        let $ = {};
        for (let X of d.objectKeys(this.shape)) if (Q && !Q[X]) $[X] = this.shape[X];
        else {
          let J = this.shape[X];
          while (J instanceof m0) J = J._def.innerType;
          $[X] = J;
        }
        return new _U0({ ...this._def, shape: () => $ });
      }
      keyof() {
        return RJ(d.objectKeys(this.shape));
      }
    };
    U0.create = (Q, $) => {
      return new U0({ shape: () => Q, unknownKeys: "strip", catchall: M1.create(), typeName: j.ZodObject, ...m($) });
    };
    U0.strictCreate = (Q, $) => {
      return new U0({ shape: () => Q, unknownKeys: "strict", catchall: M1.create(), typeName: j.ZodObject, ...m($) });
    };
    U0.lazycreate = (Q, $) => {
      return new U0({ shape: Q, unknownKeys: "strip", catchall: M1.create(), typeName: j.ZodObject, ...m($) });
    };
    X4 = class extends p {
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q), X = this._def.options;
        function Y(J) {
          for (let W of J) if (W.result.status === "valid") return W.result;
          for (let W of J) if (W.result.status === "dirty") return $.common.issues.push(...W.ctx.common.issues), W.result;
          let G = J.map((W) => new x0(W.ctx.common.issues));
          return E($, { code: A.invalid_union, unionErrors: G }), x;
        }
        if ($.common.async) return Promise.all(X.map(async (J) => {
          let G = { ...$, common: { ...$.common, issues: [] }, parent: null };
          return { result: await J._parseAsync({ data: $.data, path: $.path, parent: G }), ctx: G };
        })).then(Y);
        else {
          let J = void 0, G = [];
          for (let H of X) {
            let B = { ...$, common: { ...$.common, issues: [] }, parent: null }, z = H._parseSync({ data: $.data, path: $.path, parent: B });
            if (z.status === "valid") return z;
            else if (z.status === "dirty" && !J) J = { result: z, ctx: B };
            if (B.common.issues.length) G.push(B.common.issues);
          }
          if (J) return $.common.issues.push(...J.ctx.common.issues), J.result;
          let W = G.map((H) => new x0(H));
          return E($, { code: A.invalid_union, unionErrors: W }), x;
        }
      }
      get options() {
        return this._def.options;
      }
    };
    X4.create = (Q, $) => {
      return new X4({ options: Q, typeName: j.ZodUnion, ...m($) });
    };
    C1 = (Q) => {
      if (Q instanceof J4) return C1(Q.schema);
      else if (Q instanceof G1) return C1(Q.innerType());
      else if (Q instanceof G4) return [Q.value];
      else if (Q instanceof d1) return Q.options;
      else if (Q instanceof W4) return d.objectValues(Q.enum);
      else if (Q instanceof H4) return C1(Q._def.innerType);
      else if (Q instanceof Q4) return [void 0];
      else if (Q instanceof $4) return [null];
      else if (Q instanceof m0) return [void 0, ...C1(Q.unwrap())];
      else if (Q instanceof S1) return [null, ...C1(Q.unwrap())];
      else if (Q instanceof W8) return C1(Q.unwrap());
      else if (Q instanceof z4) return C1(Q.unwrap());
      else if (Q instanceof B4) return C1(Q._def.innerType);
      else return [];
    };
    G8 = class _G8 extends p {
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q);
        if ($.parsedType !== I.object) return E($, { code: A.invalid_type, expected: I.object, received: $.parsedType }), x;
        let X = this.discriminator, Y = $.data[X], J = this.optionsMap.get(Y);
        if (!J) return E($, { code: A.invalid_union_discriminator, options: Array.from(this.optionsMap.keys()), path: [X] }), x;
        if ($.common.async) return J._parseAsync({ data: $.data, path: $.path, parent: $ });
        else return J._parseSync({ data: $.data, path: $.path, parent: $ });
      }
      get discriminator() {
        return this._def.discriminator;
      }
      get options() {
        return this._def.options;
      }
      get optionsMap() {
        return this._def.optionsMap;
      }
      static create(Q, $, X) {
        let Y = /* @__PURE__ */ new Map();
        for (let J of $) {
          let G = C1(J.shape[Q]);
          if (!G.length) throw Error(`A discriminator value for key \`${Q}\` could not be extracted from all schema options`);
          for (let W of G) {
            if (Y.has(W)) throw Error(`Discriminator property ${String(Q)} has duplicate value ${String(W)}`);
            Y.set(W, J);
          }
        }
        return new _G8({ typeName: j.ZodDiscriminatedUnion, discriminator: Q, options: $, optionsMap: Y, ...m(X) });
      }
    };
    Y4 = class extends p {
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q), Y = (J, G) => {
          if (Y8(J) || Y8(G)) return x;
          let W = B$(J.value, G.value);
          if (!W.valid) return E(X, { code: A.invalid_intersection_types }), x;
          if (J8(J) || J8(G)) $.dirty();
          return { status: $.value, value: W.data };
        };
        if (X.common.async) return Promise.all([this._def.left._parseAsync({ data: X.data, path: X.path, parent: X }), this._def.right._parseAsync({ data: X.data, path: X.path, parent: X })]).then(([J, G]) => Y(J, G));
        else return Y(this._def.left._parseSync({ data: X.data, path: X.path, parent: X }), this._def.right._parseSync({ data: X.data, path: X.path, parent: X }));
      }
    };
    Y4.create = (Q, $, X) => {
      return new Y4({ left: Q, right: $, typeName: j.ZodIntersection, ...m(X) });
    };
    A1 = class _A1 extends p {
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q);
        if (X.parsedType !== I.array) return E(X, { code: A.invalid_type, expected: I.array, received: X.parsedType }), x;
        if (X.data.length < this._def.items.length) return E(X, { code: A.too_small, minimum: this._def.items.length, inclusive: true, exact: false, type: "array" }), x;
        if (!this._def.rest && X.data.length > this._def.items.length) E(X, { code: A.too_big, maximum: this._def.items.length, inclusive: true, exact: false, type: "array" }), $.dirty();
        let J = [...X.data].map((G, W) => {
          let H = this._def.items[W] || this._def.rest;
          if (!H) return null;
          return H._parse(new J1(X, G, X.path, W));
        }).filter((G) => !!G);
        if (X.common.async) return Promise.all(J).then((G) => {
          return A0.mergeArray($, G);
        });
        else return A0.mergeArray($, J);
      }
      get items() {
        return this._def.items;
      }
      rest(Q) {
        return new _A1({ ...this._def, rest: Q });
      }
    };
    A1.create = (Q, $) => {
      if (!Array.isArray(Q)) throw Error("You must pass an array of schemas to z.tuple([ ... ])");
      return new A1({ items: Q, typeName: j.ZodTuple, rest: null, ...m($) });
    };
    d4 = class _d4 extends p {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q);
        if (X.parsedType !== I.object) return E(X, { code: A.invalid_type, expected: I.object, received: X.parsedType }), x;
        let Y = [], J = this._def.keyType, G = this._def.valueType;
        for (let W in X.data) Y.push({ key: J._parse(new J1(X, W, X.path, W)), value: G._parse(new J1(X, X.data[W], X.path, W)), alwaysSet: W in X.data });
        if (X.common.async) return A0.mergeObjectAsync($, Y);
        else return A0.mergeObjectSync($, Y);
      }
      get element() {
        return this._def.valueType;
      }
      static create(Q, $, X) {
        if ($ instanceof p) return new _d4({ keyType: Q, valueType: $, typeName: j.ZodRecord, ...m(X) });
        return new _d4({ keyType: X1.create(), valueType: Q, typeName: j.ZodRecord, ...m($) });
      }
    };
    i4 = class extends p {
      get keySchema() {
        return this._def.keyType;
      }
      get valueSchema() {
        return this._def.valueType;
      }
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q);
        if (X.parsedType !== I.map) return E(X, { code: A.invalid_type, expected: I.map, received: X.parsedType }), x;
        let Y = this._def.keyType, J = this._def.valueType, G = [...X.data.entries()].map(([W, H], B) => {
          return { key: Y._parse(new J1(X, W, X.path, [B, "key"])), value: J._parse(new J1(X, H, X.path, [B, "value"])) };
        });
        if (X.common.async) {
          let W = /* @__PURE__ */ new Map();
          return Promise.resolve().then(async () => {
            for (let H of G) {
              let B = await H.key, z = await H.value;
              if (B.status === "aborted" || z.status === "aborted") return x;
              if (B.status === "dirty" || z.status === "dirty") $.dirty();
              W.set(B.value, z.value);
            }
            return { status: $.value, value: W };
          });
        } else {
          let W = /* @__PURE__ */ new Map();
          for (let H of G) {
            let { key: B, value: z } = H;
            if (B.status === "aborted" || z.status === "aborted") return x;
            if (B.status === "dirty" || z.status === "dirty") $.dirty();
            W.set(B.value, z.value);
          }
          return { status: $.value, value: W };
        }
      }
    };
    i4.create = (Q, $, X) => {
      return new i4({ valueType: $, keyType: Q, typeName: j.ZodMap, ...m(X) });
    };
    D6 = class _D6 extends p {
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q);
        if (X.parsedType !== I.set) return E(X, { code: A.invalid_type, expected: I.set, received: X.parsedType }), x;
        let Y = this._def;
        if (Y.minSize !== null) {
          if (X.data.size < Y.minSize.value) E(X, { code: A.too_small, minimum: Y.minSize.value, type: "set", inclusive: true, exact: false, message: Y.minSize.message }), $.dirty();
        }
        if (Y.maxSize !== null) {
          if (X.data.size > Y.maxSize.value) E(X, { code: A.too_big, maximum: Y.maxSize.value, type: "set", inclusive: true, exact: false, message: Y.maxSize.message }), $.dirty();
        }
        let J = this._def.valueType;
        function G(H) {
          let B = /* @__PURE__ */ new Set();
          for (let z of H) {
            if (z.status === "aborted") return x;
            if (z.status === "dirty") $.dirty();
            B.add(z.value);
          }
          return { status: $.value, value: B };
        }
        let W = [...X.data.values()].map((H, B) => J._parse(new J1(X, H, X.path, B)));
        if (X.common.async) return Promise.all(W).then((H) => G(H));
        else return G(W);
      }
      min(Q, $) {
        return new _D6({ ...this._def, minSize: { value: Q, message: C.toString($) } });
      }
      max(Q, $) {
        return new _D6({ ...this._def, maxSize: { value: Q, message: C.toString($) } });
      }
      size(Q, $) {
        return this.min(Q, $).max(Q, $);
      }
      nonempty(Q) {
        return this.min(1, Q);
      }
    };
    D6.create = (Q, $) => {
      return new D6({ valueType: Q, minSize: null, maxSize: null, typeName: j.ZodSet, ...m($) });
    };
    s6 = class _s6 extends p {
      constructor() {
        super(...arguments);
        this.validate = this.implement;
      }
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q);
        if ($.parsedType !== I.function) return E($, { code: A.invalid_type, expected: I.function, received: $.parsedType }), x;
        function X(W, H) {
          return l4({ data: W, path: $.path, errorMaps: [$.common.contextualErrorMap, $.schemaErrorMap, r6(), Z1].filter((B) => !!B), issueData: { code: A.invalid_arguments, argumentsError: H } });
        }
        function Y(W, H) {
          return l4({ data: W, path: $.path, errorMaps: [$.common.contextualErrorMap, $.schemaErrorMap, r6(), Z1].filter((B) => !!B), issueData: { code: A.invalid_return_type, returnTypeError: H } });
        }
        let J = { errorMap: $.common.contextualErrorMap }, G = $.data;
        if (this._def.returns instanceof w6) {
          let W = this;
          return b0(async function(...H) {
            let B = new x0([]), z = await W._def.args.parseAsync(H, J).catch((q) => {
              throw B.addIssue(X(H, q)), B;
            }), K = await Reflect.apply(G, this, z);
            return await W._def.returns._def.type.parseAsync(K, J).catch((q) => {
              throw B.addIssue(Y(K, q)), B;
            });
          });
        } else {
          let W = this;
          return b0(function(...H) {
            let B = W._def.args.safeParse(H, J);
            if (!B.success) throw new x0([X(H, B.error)]);
            let z = Reflect.apply(G, this, B.data), K = W._def.returns.safeParse(z, J);
            if (!K.success) throw new x0([Y(z, K.error)]);
            return K.data;
          });
        }
      }
      parameters() {
        return this._def.args;
      }
      returnType() {
        return this._def.returns;
      }
      args(...Q) {
        return new _s6({ ...this._def, args: A1.create(Q).rest(l1.create()) });
      }
      returns(Q) {
        return new _s6({ ...this._def, returns: Q });
      }
      implement(Q) {
        return this.parse(Q);
      }
      strictImplement(Q) {
        return this.parse(Q);
      }
      static create(Q, $, X) {
        return new _s6({ args: Q ? Q : A1.create([]).rest(l1.create()), returns: $ || l1.create(), typeName: j.ZodFunction, ...m(X) });
      }
    };
    J4 = class extends p {
      get schema() {
        return this._def.getter();
      }
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q);
        return this._def.getter()._parse({ data: $.data, path: $.path, parent: $ });
      }
    };
    J4.create = (Q, $) => {
      return new J4({ getter: Q, typeName: j.ZodLazy, ...m($) });
    };
    G4 = class extends p {
      _parse(Q) {
        if (Q.data !== this._def.value) {
          let $ = this._getOrReturnCtx(Q);
          return E($, { received: $.data, code: A.invalid_literal, expected: this._def.value }), x;
        }
        return { status: "valid", value: Q.data };
      }
      get value() {
        return this._def.value;
      }
    };
    G4.create = (Q, $) => {
      return new G4({ value: Q, typeName: j.ZodLiteral, ...m($) });
    };
    d1 = class _d1 extends p {
      _parse(Q) {
        if (typeof Q.data !== "string") {
          let $ = this._getOrReturnCtx(Q), X = this._def.values;
          return E($, { expected: d.joinValues(X), received: $.parsedType, code: A.invalid_type }), x;
        }
        if (!this._cache) this._cache = new Set(this._def.values);
        if (!this._cache.has(Q.data)) {
          let $ = this._getOrReturnCtx(Q), X = this._def.values;
          return E($, { received: $.data, code: A.invalid_enum_value, options: X }), x;
        }
        return b0(Q.data);
      }
      get options() {
        return this._def.values;
      }
      get enum() {
        let Q = {};
        for (let $ of this._def.values) Q[$] = $;
        return Q;
      }
      get Values() {
        let Q = {};
        for (let $ of this._def.values) Q[$] = $;
        return Q;
      }
      get Enum() {
        let Q = {};
        for (let $ of this._def.values) Q[$] = $;
        return Q;
      }
      extract(Q, $ = this._def) {
        return _d1.create(Q, { ...this._def, ...$ });
      }
      exclude(Q, $ = this._def) {
        return _d1.create(this.options.filter((X) => !Q.includes(X)), { ...this._def, ...$ });
      }
    };
    d1.create = RJ;
    W4 = class extends p {
      _parse(Q) {
        let $ = d.getValidEnumValues(this._def.values), X = this._getOrReturnCtx(Q);
        if (X.parsedType !== I.string && X.parsedType !== I.number) {
          let Y = d.objectValues($);
          return E(X, { expected: d.joinValues(Y), received: X.parsedType, code: A.invalid_type }), x;
        }
        if (!this._cache) this._cache = new Set(d.getValidEnumValues(this._def.values));
        if (!this._cache.has(Q.data)) {
          let Y = d.objectValues($);
          return E(X, { received: X.data, code: A.invalid_enum_value, options: Y }), x;
        }
        return b0(Q.data);
      }
      get enum() {
        return this._def.values;
      }
    };
    W4.create = (Q, $) => {
      return new W4({ values: Q, typeName: j.ZodNativeEnum, ...m($) });
    };
    w6 = class extends p {
      unwrap() {
        return this._def.type;
      }
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q);
        if ($.parsedType !== I.promise && $.common.async === false) return E($, { code: A.invalid_type, expected: I.promise, received: $.parsedType }), x;
        let X = $.parsedType === I.promise ? $.data : Promise.resolve($.data);
        return b0(X.then((Y) => {
          return this._def.type.parseAsync(Y, { path: $.path, errorMap: $.common.contextualErrorMap });
        }));
      }
    };
    w6.create = (Q, $) => {
      return new w6({ type: Q, typeName: j.ZodPromise, ...m($) });
    };
    G1 = class extends p {
      innerType() {
        return this._def.schema;
      }
      sourceType() {
        return this._def.schema._def.typeName === j.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
      }
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q), Y = this._def.effect || null, J = { addIssue: (G) => {
          if (E(X, G), G.fatal) $.abort();
          else $.dirty();
        }, get path() {
          return X.path;
        } };
        if (J.addIssue = J.addIssue.bind(J), Y.type === "preprocess") {
          let G = Y.transform(X.data, J);
          if (X.common.async) return Promise.resolve(G).then(async (W) => {
            if ($.value === "aborted") return x;
            let H = await this._def.schema._parseAsync({ data: W, path: X.path, parent: X });
            if (H.status === "aborted") return x;
            if (H.status === "dirty") return F6(H.value);
            if ($.value === "dirty") return F6(H.value);
            return H;
          });
          else {
            if ($.value === "aborted") return x;
            let W = this._def.schema._parseSync({ data: G, path: X.path, parent: X });
            if (W.status === "aborted") return x;
            if (W.status === "dirty") return F6(W.value);
            if ($.value === "dirty") return F6(W.value);
            return W;
          }
        }
        if (Y.type === "refinement") {
          let G = (W) => {
            let H = Y.refinement(W, J);
            if (X.common.async) return Promise.resolve(H);
            if (H instanceof Promise) throw Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
            return W;
          };
          if (X.common.async === false) {
            let W = this._def.schema._parseSync({ data: X.data, path: X.path, parent: X });
            if (W.status === "aborted") return x;
            if (W.status === "dirty") $.dirty();
            return G(W.value), { status: $.value, value: W.value };
          } else return this._def.schema._parseAsync({ data: X.data, path: X.path, parent: X }).then((W) => {
            if (W.status === "aborted") return x;
            if (W.status === "dirty") $.dirty();
            return G(W.value).then(() => {
              return { status: $.value, value: W.value };
            });
          });
        }
        if (Y.type === "transform") if (X.common.async === false) {
          let G = this._def.schema._parseSync({ data: X.data, path: X.path, parent: X });
          if (!m1(G)) return x;
          let W = Y.transform(G.value, J);
          if (W instanceof Promise) throw Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
          return { status: $.value, value: W };
        } else return this._def.schema._parseAsync({ data: X.data, path: X.path, parent: X }).then((G) => {
          if (!m1(G)) return x;
          return Promise.resolve(Y.transform(G.value, J)).then((W) => ({ status: $.value, value: W }));
        });
        d.assertNever(Y);
      }
    };
    G1.create = (Q, $, X) => {
      return new G1({ schema: Q, typeName: j.ZodEffects, effect: $, ...m(X) });
    };
    G1.createWithPreprocess = (Q, $, X) => {
      return new G1({ schema: $, effect: { type: "preprocess", transform: Q }, typeName: j.ZodEffects, ...m(X) });
    };
    m0 = class extends p {
      _parse(Q) {
        if (this._getType(Q) === I.undefined) return b0(void 0);
        return this._def.innerType._parse(Q);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    m0.create = (Q, $) => {
      return new m0({ innerType: Q, typeName: j.ZodOptional, ...m($) });
    };
    S1 = class extends p {
      _parse(Q) {
        if (this._getType(Q) === I.null) return b0(null);
        return this._def.innerType._parse(Q);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    S1.create = (Q, $) => {
      return new S1({ innerType: Q, typeName: j.ZodNullable, ...m($) });
    };
    H4 = class extends p {
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q), X = $.data;
        if ($.parsedType === I.undefined) X = this._def.defaultValue();
        return this._def.innerType._parse({ data: X, path: $.path, parent: $ });
      }
      removeDefault() {
        return this._def.innerType;
      }
    };
    H4.create = (Q, $) => {
      return new H4({ innerType: Q, typeName: j.ZodDefault, defaultValue: typeof $.default === "function" ? $.default : () => $.default, ...m($) });
    };
    B4 = class extends p {
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q), X = { ...$, common: { ...$.common, issues: [] } }, Y = this._def.innerType._parse({ data: X.data, path: X.path, parent: { ...X } });
        if (t6(Y)) return Y.then((J) => {
          return { status: "valid", value: J.status === "valid" ? J.value : this._def.catchValue({ get error() {
            return new x0(X.common.issues);
          }, input: X.data }) };
        });
        else return { status: "valid", value: Y.status === "valid" ? Y.value : this._def.catchValue({ get error() {
          return new x0(X.common.issues);
        }, input: X.data }) };
      }
      removeCatch() {
        return this._def.innerType;
      }
    };
    B4.create = (Q, $) => {
      return new B4({ innerType: Q, typeName: j.ZodCatch, catchValue: typeof $.catch === "function" ? $.catch : () => $.catch, ...m($) });
    };
    n4 = class extends p {
      _parse(Q) {
        if (this._getType(Q) !== I.nan) {
          let X = this._getOrReturnCtx(Q);
          return E(X, { code: A.invalid_type, expected: I.nan, received: X.parsedType }), x;
        }
        return { status: "valid", value: Q.data };
      }
    };
    n4.create = (Q) => {
      return new n4({ typeName: j.ZodNaN, ...m(Q) });
    };
    tL = Symbol("zod_brand");
    W8 = class extends p {
      _parse(Q) {
        let { ctx: $ } = this._processInputParams(Q), X = $.data;
        return this._def.type._parse({ data: X, path: $.path, parent: $ });
      }
      unwrap() {
        return this._def.type;
      }
    };
    o4 = class _o4 extends p {
      _parse(Q) {
        let { status: $, ctx: X } = this._processInputParams(Q);
        if (X.common.async) return (async () => {
          let J = await this._def.in._parseAsync({ data: X.data, path: X.path, parent: X });
          if (J.status === "aborted") return x;
          if (J.status === "dirty") return $.dirty(), F6(J.value);
          else return this._def.out._parseAsync({ data: J.value, path: X.path, parent: X });
        })();
        else {
          let Y = this._def.in._parseSync({ data: X.data, path: X.path, parent: X });
          if (Y.status === "aborted") return x;
          if (Y.status === "dirty") return $.dirty(), { status: "dirty", value: Y.value };
          else return this._def.out._parseSync({ data: Y.value, path: X.path, parent: X });
        }
      }
      static create(Q, $) {
        return new _o4({ in: Q, out: $, typeName: j.ZodPipeline });
      }
    };
    z4 = class extends p {
      _parse(Q) {
        let $ = this._def.innerType._parse(Q), X = (Y) => {
          if (m1(Y)) Y.value = Object.freeze(Y.value);
          return Y;
        };
        return t6($) ? $.then((Y) => X(Y)) : X($);
      }
      unwrap() {
        return this._def.innerType;
      }
    };
    z4.create = (Q, $) => {
      return new z4({ innerType: Q, typeName: j.ZodReadonly, ...m($) });
    };
    aL = { object: U0.lazycreate };
    (function(Q) {
      Q.ZodString = "ZodString", Q.ZodNumber = "ZodNumber", Q.ZodNaN = "ZodNaN", Q.ZodBigInt = "ZodBigInt", Q.ZodBoolean = "ZodBoolean", Q.ZodDate = "ZodDate", Q.ZodSymbol = "ZodSymbol", Q.ZodUndefined = "ZodUndefined", Q.ZodNull = "ZodNull", Q.ZodAny = "ZodAny", Q.ZodUnknown = "ZodUnknown", Q.ZodNever = "ZodNever", Q.ZodVoid = "ZodVoid", Q.ZodArray = "ZodArray", Q.ZodObject = "ZodObject", Q.ZodUnion = "ZodUnion", Q.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", Q.ZodIntersection = "ZodIntersection", Q.ZodTuple = "ZodTuple", Q.ZodRecord = "ZodRecord", Q.ZodMap = "ZodMap", Q.ZodSet = "ZodSet", Q.ZodFunction = "ZodFunction", Q.ZodLazy = "ZodLazy", Q.ZodLiteral = "ZodLiteral", Q.ZodEnum = "ZodEnum", Q.ZodEffects = "ZodEffects", Q.ZodNativeEnum = "ZodNativeEnum", Q.ZodOptional = "ZodOptional", Q.ZodNullable = "ZodNullable", Q.ZodDefault = "ZodDefault", Q.ZodCatch = "ZodCatch", Q.ZodPromise = "ZodPromise", Q.ZodBranded = "ZodBranded", Q.ZodPipeline = "ZodPipeline", Q.ZodReadonly = "ZodReadonly";
    })(j || (j = {}));
    sL = (Q, $ = { message: `Input not instance of ${Q.name}` }) => IJ((X) => X instanceof Q, $);
    EJ = X1.create;
    PJ = c1.create;
    eL = n4.create;
    QF = p1.create;
    bJ = e6.create;
    $F = N6.create;
    XF = c4.create;
    YF = Q4.create;
    JF = $4.create;
    GF = O6.create;
    WF = l1.create;
    HF = M1.create;
    BF = p4.create;
    zF = Y1.create;
    z$ = U0.create;
    KF = U0.strictCreate;
    VF = X4.create;
    qF = G8.create;
    UF = Y4.create;
    LF = A1.create;
    FF = d4.create;
    NF = i4.create;
    OF = D6.create;
    DF = s6.create;
    wF = J4.create;
    MF = G4.create;
    AF = d1.create;
    jF = W4.create;
    RF = w6.create;
    IF = G1.create;
    EF = m0.create;
    PF = S1.create;
    bF = G1.createWithPreprocess;
    ZF = o4.create;
    CF = () => EJ().optional();
    SF = () => PJ().optional();
    _F = () => bJ().optional();
    kF = { string: (Q) => X1.create({ ...Q, coerce: true }), number: (Q) => c1.create({ ...Q, coerce: true }), boolean: (Q) => e6.create({ ...Q, coerce: true }), bigint: (Q) => p1.create({ ...Q, coerce: true }), date: (Q) => N6.create({ ...Q, coerce: true }) };
    vF = x;
    TF = Object.freeze({ status: "aborted" });
    xF = Symbol("zod_brand");
    n1 = class extends Error {
      constructor() {
        super("Encountered Promise during synchronous parse. Use .parseAsync() instead.");
      }
    };
    H8 = {};
    i = {};
    uQ(i, { unwrapMessage: () => r4, stringifyPrimitive: () => K8, required: () => sF, randomString: () => cF, propertyKeyTypes: () => F$, promiseAllObject: () => lF, primitiveTypes: () => ZJ, prefixIssues: () => j1, pick: () => nF, partial: () => aF, optionalKeys: () => N$, omit: () => oF, numKeys: () => pF, nullish: () => s4, normalizeParams: () => y, merge: () => tF, jsonStringifyReplacer: () => V$, joinValues: () => B8, issue: () => D$, isPlainObject: () => V4, isObject: () => K4, getSizableOrigin: () => SJ, getParsedType: () => dF, getLengthableOrigin: () => Q9, getEnumValues: () => t4, getElementAtPath: () => mF, floatSafeRemainder: () => q$, finalizeIssue: () => W1, extend: () => rF, escapeRegex: () => o1, esc: () => M6, defineLazy: () => Y0, createTransparentProxy: () => iF, clone: () => c0, cleanRegex: () => e4, cleanEnum: () => eF, captureStackTrace: () => z8, cached: () => a4, assignProp: () => U$, assertNotEqual: () => gF, assertNever: () => fF, assertIs: () => hF, assertEqual: () => yF, assert: () => uF, allowsEval: () => L$, aborted: () => A6, NUMBER_FORMAT_RANGES: () => O$, Class: () => _J, BIGINT_FORMAT_RANGES: () => CJ });
    z8 = Error.captureStackTrace ? Error.captureStackTrace : (...Q) => {
    };
    L$ = a4(() => {
      if (typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")) return false;
      try {
        return new Function(""), true;
      } catch (Q) {
        return false;
      }
    });
    dF = (Q) => {
      let $ = typeof Q;
      switch ($) {
        case "undefined":
          return "undefined";
        case "string":
          return "string";
        case "number":
          return Number.isNaN(Q) ? "nan" : "number";
        case "boolean":
          return "boolean";
        case "function":
          return "function";
        case "bigint":
          return "bigint";
        case "symbol":
          return "symbol";
        case "object":
          if (Array.isArray(Q)) return "array";
          if (Q === null) return "null";
          if (Q.then && typeof Q.then === "function" && Q.catch && typeof Q.catch === "function") return "promise";
          if (typeof Map < "u" && Q instanceof Map) return "map";
          if (typeof Set < "u" && Q instanceof Set) return "set";
          if (typeof Date < "u" && Q instanceof Date) return "date";
          if (typeof File < "u" && Q instanceof File) return "file";
          return "object";
        default:
          throw Error(`Unknown data type: ${$}`);
      }
    };
    F$ = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
    ZJ = /* @__PURE__ */ new Set(["string", "number", "bigint", "boolean", "symbol", "undefined"]);
    O$ = { safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], int32: [-2147483648, 2147483647], uint32: [0, 4294967295], float32: [-34028234663852886e22, 34028234663852886e22], float64: [-Number.MAX_VALUE, Number.MAX_VALUE] };
    CJ = { int64: [BigInt("-9223372036854775808"), BigInt("9223372036854775807")], uint64: [BigInt(0), BigInt("18446744073709551615")] };
    _J = class {
      constructor(...Q) {
      }
    };
    kJ = (Q, $) => {
      Q.name = "$ZodError", Object.defineProperty(Q, "_zod", { value: Q._zod, enumerable: false }), Object.defineProperty(Q, "issues", { value: $, enumerable: false }), Object.defineProperty(Q, "message", { get() {
        return JSON.stringify($, V$, 2);
      }, enumerable: true });
    };
    V8 = O("$ZodError", kJ);
    $9 = O("$ZodError", kJ, { Parent: Error });
    A$ = (Q) => ($, X, Y, J) => {
      let G = Y ? Object.assign(Y, { async: false }) : { async: false }, W = $._zod.run({ value: X, issues: [] }, G);
      if (W instanceof Promise) throw new n1();
      if (W.issues.length) {
        let H = new (J?.Err ?? Q)(W.issues.map((B) => W1(B, G, l0())));
        throw z8(H, J?.callee), H;
      }
      return W.value;
    };
    j$ = A$($9);
    R$ = (Q) => async ($, X, Y, J) => {
      let G = Y ? Object.assign(Y, { async: true }) : { async: true }, W = $._zod.run({ value: X, issues: [] }, G);
      if (W instanceof Promise) W = await W;
      if (W.issues.length) {
        let H = new (J?.Err ?? Q)(W.issues.map((B) => W1(B, G, l0())));
        throw z8(H, J?.callee), H;
      }
      return W.value;
    };
    I$ = R$($9);
    E$ = (Q) => ($, X, Y) => {
      let J = Y ? { ...Y, async: false } : { async: false }, G = $._zod.run({ value: X, issues: [] }, J);
      if (G instanceof Promise) throw new n1();
      return G.issues.length ? { success: false, error: new (Q ?? V8)(G.issues.map((W) => W1(W, J, l0()))) } : { success: true, data: G.value };
    };
    j6 = E$($9);
    P$ = (Q) => async ($, X, Y) => {
      let J = Y ? Object.assign(Y, { async: true }) : { async: true }, G = $._zod.run({ value: X, issues: [] }, J);
      if (G instanceof Promise) G = await G;
      return G.issues.length ? { success: false, error: new Q(G.issues.map((W) => W1(W, J, l0()))) } : { success: true, data: G.value };
    };
    R6 = P$($9);
    vJ = /^[cC][^\s-]{8,}$/;
    TJ = /^[0-9a-z]+$/;
    xJ = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
    yJ = /^[0-9a-vA-V]{20}$/;
    gJ = /^[A-Za-z0-9]{27}$/;
    hJ = /^[a-zA-Z0-9_-]{21}$/;
    fJ = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
    uJ = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
    b$ = (Q) => {
      if (!Q) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$/;
      return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${Q}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
    };
    mJ = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
    cJ = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
    pJ = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$/;
    dJ = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
    iJ = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
    nJ = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
    Z$ = /^[A-Za-z0-9_-]*$/;
    oJ = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
    rJ = /^\+(?:[0-9]){6,14}[0-9]$/;
    tJ = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
    aJ = new RegExp(`^${tJ}$`);
    $G = (Q) => {
      let $ = Q ? `[\\s\\S]{${Q?.minimum ?? 0},${Q?.maximum ?? ""}}` : "[\\s\\S]*";
      return new RegExp(`^${$}$`);
    };
    XG = /^\d+$/;
    YG = /^-?\d+(?:\.\d+)?/i;
    JG = /true|false/i;
    GG = /null/i;
    WG = /^[^A-Z]*$/;
    HG = /^[^a-z]*$/;
    j0 = O("$ZodCheck", (Q, $) => {
      var X;
      Q._zod ?? (Q._zod = {}), Q._zod.def = $, (X = Q._zod).onattach ?? (X.onattach = []);
    });
    BG = { number: "number", bigint: "bigint", object: "date" };
    C$ = O("$ZodCheckLessThan", (Q, $) => {
      j0.init(Q, $);
      let X = BG[typeof $.value];
      Q._zod.onattach.push((Y) => {
        let J = Y._zod.bag, G = ($.inclusive ? J.maximum : J.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
        if ($.value < G) if ($.inclusive) J.maximum = $.value;
        else J.exclusiveMaximum = $.value;
      }), Q._zod.check = (Y) => {
        if ($.inclusive ? Y.value <= $.value : Y.value < $.value) return;
        Y.issues.push({ origin: X, code: "too_big", maximum: $.value, input: Y.value, inclusive: $.inclusive, inst: Q, continue: !$.abort });
      };
    });
    S$ = O("$ZodCheckGreaterThan", (Q, $) => {
      j0.init(Q, $);
      let X = BG[typeof $.value];
      Q._zod.onattach.push((Y) => {
        let J = Y._zod.bag, G = ($.inclusive ? J.minimum : J.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
        if ($.value > G) if ($.inclusive) J.minimum = $.value;
        else J.exclusiveMinimum = $.value;
      }), Q._zod.check = (Y) => {
        if ($.inclusive ? Y.value >= $.value : Y.value > $.value) return;
        Y.issues.push({ origin: X, code: "too_small", minimum: $.value, input: Y.value, inclusive: $.inclusive, inst: Q, continue: !$.abort });
      };
    });
    zG = O("$ZodCheckMultipleOf", (Q, $) => {
      j0.init(Q, $), Q._zod.onattach.push((X) => {
        var Y;
        (Y = X._zod.bag).multipleOf ?? (Y.multipleOf = $.value);
      }), Q._zod.check = (X) => {
        if (typeof X.value !== typeof $.value) throw Error("Cannot mix number and bigint in multiple_of check.");
        if (typeof X.value === "bigint" ? X.value % $.value === BigInt(0) : q$(X.value, $.value) === 0) return;
        X.issues.push({ origin: typeof X.value, code: "not_multiple_of", divisor: $.value, input: X.value, inst: Q, continue: !$.abort });
      };
    });
    KG = O("$ZodCheckNumberFormat", (Q, $) => {
      j0.init(Q, $), $.format = $.format || "float64";
      let X = $.format?.includes("int"), Y = X ? "int" : "number", [J, G] = O$[$.format];
      Q._zod.onattach.push((W) => {
        let H = W._zod.bag;
        if (H.format = $.format, H.minimum = J, H.maximum = G, X) H.pattern = XG;
      }), Q._zod.check = (W) => {
        let H = W.value;
        if (X) {
          if (!Number.isInteger(H)) {
            W.issues.push({ expected: Y, format: $.format, code: "invalid_type", input: H, inst: Q });
            return;
          }
          if (!Number.isSafeInteger(H)) {
            if (H > 0) W.issues.push({ input: H, code: "too_big", maximum: Number.MAX_SAFE_INTEGER, note: "Integers must be within the safe integer range.", inst: Q, origin: Y, continue: !$.abort });
            else W.issues.push({ input: H, code: "too_small", minimum: Number.MIN_SAFE_INTEGER, note: "Integers must be within the safe integer range.", inst: Q, origin: Y, continue: !$.abort });
            return;
          }
        }
        if (H < J) W.issues.push({ origin: "number", input: H, code: "too_small", minimum: J, inclusive: true, inst: Q, continue: !$.abort });
        if (H > G) W.issues.push({ origin: "number", input: H, code: "too_big", maximum: G, inst: Q });
      };
    });
    VG = O("$ZodCheckMaxLength", (Q, $) => {
      j0.init(Q, $), Q._zod.when = (X) => {
        let Y = X.value;
        return !s4(Y) && Y.length !== void 0;
      }, Q._zod.onattach.push((X) => {
        let Y = X._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
        if ($.maximum < Y) X._zod.bag.maximum = $.maximum;
      }), Q._zod.check = (X) => {
        let Y = X.value;
        if (Y.length <= $.maximum) return;
        let G = Q9(Y);
        X.issues.push({ origin: G, code: "too_big", maximum: $.maximum, inclusive: true, input: Y, inst: Q, continue: !$.abort });
      };
    });
    qG = O("$ZodCheckMinLength", (Q, $) => {
      j0.init(Q, $), Q._zod.when = (X) => {
        let Y = X.value;
        return !s4(Y) && Y.length !== void 0;
      }, Q._zod.onattach.push((X) => {
        let Y = X._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
        if ($.minimum > Y) X._zod.bag.minimum = $.minimum;
      }), Q._zod.check = (X) => {
        let Y = X.value;
        if (Y.length >= $.minimum) return;
        let G = Q9(Y);
        X.issues.push({ origin: G, code: "too_small", minimum: $.minimum, inclusive: true, input: Y, inst: Q, continue: !$.abort });
      };
    });
    UG = O("$ZodCheckLengthEquals", (Q, $) => {
      j0.init(Q, $), Q._zod.when = (X) => {
        let Y = X.value;
        return !s4(Y) && Y.length !== void 0;
      }, Q._zod.onattach.push((X) => {
        let Y = X._zod.bag;
        Y.minimum = $.length, Y.maximum = $.length, Y.length = $.length;
      }), Q._zod.check = (X) => {
        let Y = X.value, J = Y.length;
        if (J === $.length) return;
        let G = Q9(Y), W = J > $.length;
        X.issues.push({ origin: G, ...W ? { code: "too_big", maximum: $.length } : { code: "too_small", minimum: $.length }, inclusive: true, exact: true, input: X.value, inst: Q, continue: !$.abort });
      };
    });
    X9 = O("$ZodCheckStringFormat", (Q, $) => {
      var X, Y;
      if (j0.init(Q, $), Q._zod.onattach.push((J) => {
        let G = J._zod.bag;
        if (G.format = $.format, $.pattern) G.patterns ?? (G.patterns = /* @__PURE__ */ new Set()), G.patterns.add($.pattern);
      }), $.pattern) (X = Q._zod).check ?? (X.check = (J) => {
        if ($.pattern.lastIndex = 0, $.pattern.test(J.value)) return;
        J.issues.push({ origin: "string", code: "invalid_format", format: $.format, input: J.value, ...$.pattern ? { pattern: $.pattern.toString() } : {}, inst: Q, continue: !$.abort });
      });
      else (Y = Q._zod).check ?? (Y.check = () => {
      });
    });
    LG = O("$ZodCheckRegex", (Q, $) => {
      X9.init(Q, $), Q._zod.check = (X) => {
        if ($.pattern.lastIndex = 0, $.pattern.test(X.value)) return;
        X.issues.push({ origin: "string", code: "invalid_format", format: "regex", input: X.value, pattern: $.pattern.toString(), inst: Q, continue: !$.abort });
      };
    });
    FG = O("$ZodCheckLowerCase", (Q, $) => {
      $.pattern ?? ($.pattern = WG), X9.init(Q, $);
    });
    NG = O("$ZodCheckUpperCase", (Q, $) => {
      $.pattern ?? ($.pattern = HG), X9.init(Q, $);
    });
    OG = O("$ZodCheckIncludes", (Q, $) => {
      j0.init(Q, $);
      let X = o1($.includes), Y = new RegExp(typeof $.position === "number" ? `^.{${$.position}}${X}` : X);
      $.pattern = Y, Q._zod.onattach.push((J) => {
        let G = J._zod.bag;
        G.patterns ?? (G.patterns = /* @__PURE__ */ new Set()), G.patterns.add(Y);
      }), Q._zod.check = (J) => {
        if (J.value.includes($.includes, $.position)) return;
        J.issues.push({ origin: "string", code: "invalid_format", format: "includes", includes: $.includes, input: J.value, inst: Q, continue: !$.abort });
      };
    });
    DG = O("$ZodCheckStartsWith", (Q, $) => {
      j0.init(Q, $);
      let X = new RegExp(`^${o1($.prefix)}.*`);
      $.pattern ?? ($.pattern = X), Q._zod.onattach.push((Y) => {
        let J = Y._zod.bag;
        J.patterns ?? (J.patterns = /* @__PURE__ */ new Set()), J.patterns.add(X);
      }), Q._zod.check = (Y) => {
        if (Y.value.startsWith($.prefix)) return;
        Y.issues.push({ origin: "string", code: "invalid_format", format: "starts_with", prefix: $.prefix, input: Y.value, inst: Q, continue: !$.abort });
      };
    });
    wG = O("$ZodCheckEndsWith", (Q, $) => {
      j0.init(Q, $);
      let X = new RegExp(`.*${o1($.suffix)}$`);
      $.pattern ?? ($.pattern = X), Q._zod.onattach.push((Y) => {
        let J = Y._zod.bag;
        J.patterns ?? (J.patterns = /* @__PURE__ */ new Set()), J.patterns.add(X);
      }), Q._zod.check = (Y) => {
        if (Y.value.endsWith($.suffix)) return;
        Y.issues.push({ origin: "string", code: "invalid_format", format: "ends_with", suffix: $.suffix, input: Y.value, inst: Q, continue: !$.abort });
      };
    });
    MG = O("$ZodCheckOverwrite", (Q, $) => {
      j0.init(Q, $), Q._zod.check = (X) => {
        X.value = $.tx(X.value);
      };
    });
    _$ = class {
      constructor(Q = []) {
        if (this.content = [], this.indent = 0, this) this.args = Q;
      }
      indented(Q) {
        this.indent += 1, Q(this), this.indent -= 1;
      }
      write(Q) {
        if (typeof Q === "function") {
          Q(this, { execution: "sync" }), Q(this, { execution: "async" });
          return;
        }
        let X = Q.split(`
`).filter((G) => G), Y = Math.min(...X.map((G) => G.length - G.trimStart().length)), J = X.map((G) => G.slice(Y)).map((G) => " ".repeat(this.indent * 2) + G);
        for (let G of J) this.content.push(G);
      }
      compile() {
        let Q = Function, $ = this?.args, Y = [...(this?.content ?? [""]).map((J) => `  ${J}`)];
        return new Q(...$, Y.join(`
`));
      }
    };
    jG = { major: 4, minor: 0, patch: 0 };
    e = O("$ZodType", (Q, $) => {
      var X;
      Q ?? (Q = {}), Q._zod.def = $, Q._zod.bag = Q._zod.bag || {}, Q._zod.version = jG;
      let Y = [...Q._zod.def.checks ?? []];
      if (Q._zod.traits.has("$ZodCheck")) Y.unshift(Q);
      for (let J of Y) for (let G of J._zod.onattach) G(Q);
      if (Y.length === 0) (X = Q._zod).deferred ?? (X.deferred = []), Q._zod.deferred?.push(() => {
        Q._zod.run = Q._zod.parse;
      });
      else {
        let J = (G, W, H) => {
          let B = A6(G), z;
          for (let K of W) {
            if (K._zod.when) {
              if (!K._zod.when(G)) continue;
            } else if (B) continue;
            let U = G.issues.length, q = K._zod.check(G);
            if (q instanceof Promise && H?.async === false) throw new n1();
            if (z || q instanceof Promise) z = (z ?? Promise.resolve()).then(async () => {
              if (await q, G.issues.length === U) return;
              if (!B) B = A6(G, U);
            });
            else {
              if (G.issues.length === U) continue;
              if (!B) B = A6(G, U);
            }
          }
          if (z) return z.then(() => {
            return G;
          });
          return G;
        };
        Q._zod.run = (G, W) => {
          let H = Q._zod.parse(G, W);
          if (H instanceof Promise) {
            if (W.async === false) throw new n1();
            return H.then((B) => J(B, Y, W));
          }
          return J(H, Y, W);
        };
      }
      Q["~standard"] = { validate: (J) => {
        try {
          let G = j6(Q, J);
          return G.success ? { value: G.data } : { issues: G.error?.issues };
        } catch (G) {
          return R6(Q, J).then((W) => W.success ? { value: W.data } : { issues: W.error?.issues });
        }
      }, vendor: "zod", version: 1 };
    });
    Y9 = O("$ZodString", (Q, $) => {
      e.init(Q, $), Q._zod.pattern = [...Q?._zod.bag?.patterns ?? []].pop() ?? $G(Q._zod.bag), Q._zod.parse = (X, Y) => {
        if ($.coerce) try {
          X.value = String(X.value);
        } catch (J) {
        }
        if (typeof X.value === "string") return X;
        return X.issues.push({ expected: "string", code: "invalid_type", input: X.value, inst: Q }), X;
      };
    });
    J0 = O("$ZodStringFormat", (Q, $) => {
      X9.init(Q, $), Y9.init(Q, $);
    });
    v$ = O("$ZodGUID", (Q, $) => {
      $.pattern ?? ($.pattern = uJ), J0.init(Q, $);
    });
    T$ = O("$ZodUUID", (Q, $) => {
      if ($.version) {
        let Y = { v1: 1, v2: 2, v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, v8: 8 }[$.version];
        if (Y === void 0) throw Error(`Invalid UUID version: "${$.version}"`);
        $.pattern ?? ($.pattern = b$(Y));
      } else $.pattern ?? ($.pattern = b$());
      J0.init(Q, $);
    });
    x$ = O("$ZodEmail", (Q, $) => {
      $.pattern ?? ($.pattern = mJ), J0.init(Q, $);
    });
    y$ = O("$ZodURL", (Q, $) => {
      J0.init(Q, $), Q._zod.check = (X) => {
        try {
          let Y = X.value, J = new URL(Y), G = J.href;
          if ($.hostname) {
            if ($.hostname.lastIndex = 0, !$.hostname.test(J.hostname)) X.issues.push({ code: "invalid_format", format: "url", note: "Invalid hostname", pattern: oJ.source, input: X.value, inst: Q, continue: !$.abort });
          }
          if ($.protocol) {
            if ($.protocol.lastIndex = 0, !$.protocol.test(J.protocol.endsWith(":") ? J.protocol.slice(0, -1) : J.protocol)) X.issues.push({ code: "invalid_format", format: "url", note: "Invalid protocol", pattern: $.protocol.source, input: X.value, inst: Q, continue: !$.abort });
          }
          if (!Y.endsWith("/") && G.endsWith("/")) X.value = G.slice(0, -1);
          else X.value = G;
          return;
        } catch (Y) {
          X.issues.push({ code: "invalid_format", format: "url", input: X.value, inst: Q, continue: !$.abort });
        }
      };
    });
    g$ = O("$ZodEmoji", (Q, $) => {
      $.pattern ?? ($.pattern = lJ()), J0.init(Q, $);
    });
    h$ = O("$ZodNanoID", (Q, $) => {
      $.pattern ?? ($.pattern = hJ), J0.init(Q, $);
    });
    f$ = O("$ZodCUID", (Q, $) => {
      $.pattern ?? ($.pattern = vJ), J0.init(Q, $);
    });
    u$ = O("$ZodCUID2", (Q, $) => {
      $.pattern ?? ($.pattern = TJ), J0.init(Q, $);
    });
    m$ = O("$ZodULID", (Q, $) => {
      $.pattern ?? ($.pattern = xJ), J0.init(Q, $);
    });
    l$ = O("$ZodXID", (Q, $) => {
      $.pattern ?? ($.pattern = yJ), J0.init(Q, $);
    });
    c$ = O("$ZodKSUID", (Q, $) => {
      $.pattern ?? ($.pattern = gJ), J0.init(Q, $);
    });
    kG = O("$ZodISODateTime", (Q, $) => {
      $.pattern ?? ($.pattern = QG($)), J0.init(Q, $);
    });
    vG = O("$ZodISODate", (Q, $) => {
      $.pattern ?? ($.pattern = aJ), J0.init(Q, $);
    });
    TG = O("$ZodISOTime", (Q, $) => {
      $.pattern ?? ($.pattern = eJ($)), J0.init(Q, $);
    });
    xG = O("$ZodISODuration", (Q, $) => {
      $.pattern ?? ($.pattern = fJ), J0.init(Q, $);
    });
    p$ = O("$ZodIPv4", (Q, $) => {
      $.pattern ?? ($.pattern = cJ), J0.init(Q, $), Q._zod.onattach.push((X) => {
        let Y = X._zod.bag;
        Y.format = "ipv4";
      });
    });
    d$ = O("$ZodIPv6", (Q, $) => {
      $.pattern ?? ($.pattern = pJ), J0.init(Q, $), Q._zod.onattach.push((X) => {
        let Y = X._zod.bag;
        Y.format = "ipv6";
      }), Q._zod.check = (X) => {
        try {
          new URL(`http://[${X.value}]`);
        } catch {
          X.issues.push({ code: "invalid_format", format: "ipv6", input: X.value, inst: Q, continue: !$.abort });
        }
      };
    });
    i$ = O("$ZodCIDRv4", (Q, $) => {
      $.pattern ?? ($.pattern = dJ), J0.init(Q, $);
    });
    n$ = O("$ZodCIDRv6", (Q, $) => {
      $.pattern ?? ($.pattern = iJ), J0.init(Q, $), Q._zod.check = (X) => {
        let [Y, J] = X.value.split("/");
        try {
          if (!J) throw Error();
          let G = Number(J);
          if (`${G}` !== J) throw Error();
          if (G < 0 || G > 128) throw Error();
          new URL(`http://[${Y}]`);
        } catch {
          X.issues.push({ code: "invalid_format", format: "cidrv6", input: X.value, inst: Q, continue: !$.abort });
        }
      };
    });
    o$ = O("$ZodBase64", (Q, $) => {
      $.pattern ?? ($.pattern = nJ), J0.init(Q, $), Q._zod.onattach.push((X) => {
        X._zod.bag.contentEncoding = "base64";
      }), Q._zod.check = (X) => {
        if (yG(X.value)) return;
        X.issues.push({ code: "invalid_format", format: "base64", input: X.value, inst: Q, continue: !$.abort });
      };
    });
    r$ = O("$ZodBase64URL", (Q, $) => {
      $.pattern ?? ($.pattern = Z$), J0.init(Q, $), Q._zod.onattach.push((X) => {
        X._zod.bag.contentEncoding = "base64url";
      }), Q._zod.check = (X) => {
        if ($N(X.value)) return;
        X.issues.push({ code: "invalid_format", format: "base64url", input: X.value, inst: Q, continue: !$.abort });
      };
    });
    t$ = O("$ZodE164", (Q, $) => {
      $.pattern ?? ($.pattern = rJ), J0.init(Q, $);
    });
    a$ = O("$ZodJWT", (Q, $) => {
      J0.init(Q, $), Q._zod.check = (X) => {
        if (XN(X.value, $.alg)) return;
        X.issues.push({ code: "invalid_format", format: "jwt", input: X.value, inst: Q, continue: !$.abort });
      };
    });
    L8 = O("$ZodNumber", (Q, $) => {
      e.init(Q, $), Q._zod.pattern = Q._zod.bag.pattern ?? YG, Q._zod.parse = (X, Y) => {
        if ($.coerce) try {
          X.value = Number(X.value);
        } catch (W) {
        }
        let J = X.value;
        if (typeof J === "number" && !Number.isNaN(J) && Number.isFinite(J)) return X;
        let G = typeof J === "number" ? Number.isNaN(J) ? "NaN" : !Number.isFinite(J) ? "Infinity" : void 0 : void 0;
        return X.issues.push({ expected: "number", code: "invalid_type", input: J, inst: Q, ...G ? { received: G } : {} }), X;
      };
    });
    s$ = O("$ZodNumber", (Q, $) => {
      KG.init(Q, $), L8.init(Q, $);
    });
    e$ = O("$ZodBoolean", (Q, $) => {
      e.init(Q, $), Q._zod.pattern = JG, Q._zod.parse = (X, Y) => {
        if ($.coerce) try {
          X.value = Boolean(X.value);
        } catch (G) {
        }
        let J = X.value;
        if (typeof J === "boolean") return X;
        return X.issues.push({ expected: "boolean", code: "invalid_type", input: J, inst: Q }), X;
      };
    });
    QX = O("$ZodNull", (Q, $) => {
      e.init(Q, $), Q._zod.pattern = GG, Q._zod.values = /* @__PURE__ */ new Set([null]), Q._zod.parse = (X, Y) => {
        let J = X.value;
        if (J === null) return X;
        return X.issues.push({ expected: "null", code: "invalid_type", input: J, inst: Q }), X;
      };
    });
    $X = O("$ZodUnknown", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X) => X;
    });
    XX = O("$ZodNever", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X, Y) => {
        return X.issues.push({ expected: "never", code: "invalid_type", input: X.value, inst: Q }), X;
      };
    });
    YX = O("$ZodArray", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X, Y) => {
        let J = X.value;
        if (!Array.isArray(J)) return X.issues.push({ expected: "array", code: "invalid_type", input: J, inst: Q }), X;
        X.value = Array(J.length);
        let G = [];
        for (let W = 0; W < J.length; W++) {
          let H = J[W], B = $.element._zod.run({ value: H, issues: [] }, Y);
          if (B instanceof Promise) G.push(B.then((z) => RG(z, X, W)));
          else RG(B, X, W);
        }
        if (G.length) return Promise.all(G).then(() => X);
        return X;
      };
    });
    F8 = O("$ZodObject", (Q, $) => {
      e.init(Q, $);
      let X = a4(() => {
        let U = Object.keys($.shape);
        for (let V of U) if (!($.shape[V] instanceof e)) throw Error(`Invalid element at key "${V}": expected a Zod schema`);
        let q = N$($.shape);
        return { shape: $.shape, keys: U, keySet: new Set(U), numKeys: U.length, optionalKeys: new Set(q) };
      });
      Y0(Q._zod, "propValues", () => {
        let U = $.shape, q = {};
        for (let V in U) {
          let L = U[V]._zod;
          if (L.values) {
            q[V] ?? (q[V] = /* @__PURE__ */ new Set());
            for (let F of L.values) q[V].add(F);
          }
        }
        return q;
      });
      let Y = (U) => {
        let q = new _$(["shape", "payload", "ctx"]), V = X.value, L = (M) => {
          let R = M6(M);
          return `shape[${R}]._zod.run({ value: input[${R}], issues: [] }, ctx)`;
        };
        q.write("const input = payload.value;");
        let F = /* @__PURE__ */ Object.create(null), w = 0;
        for (let M of V.keys) F[M] = `key_${w++}`;
        q.write("const newResult = {}");
        for (let M of V.keys) if (V.optionalKeys.has(M)) {
          let R = F[M];
          q.write(`const ${R} = ${L(M)};`);
          let Z = M6(M);
          q.write(`
        if (${R}.issues.length) {
          if (input[${Z}] === undefined) {
            if (${Z} in input) {
              newResult[${Z}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${R}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${Z}, ...iss.path] : [${Z}],
              }))
            );
          }
        } else if (${R}.value === undefined) {
          if (${Z} in input) newResult[${Z}] = undefined;
        } else {
          newResult[${Z}] = ${R}.value;
        }
        `);
        } else {
          let R = F[M];
          q.write(`const ${R} = ${L(M)};`), q.write(`
          if (${R}.issues.length) payload.issues = payload.issues.concat(${R}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${M6(M)}, ...iss.path] : [${M6(M)}]
          })));`), q.write(`newResult[${M6(M)}] = ${R}.value`);
        }
        q.write("payload.value = newResult;"), q.write("return payload;");
        let D = q.compile();
        return (M, R) => D(U, M, R);
      }, J, G = K4, W = !H8.jitless, B = W && L$.value, z = $.catchall, K;
      Q._zod.parse = (U, q) => {
        K ?? (K = X.value);
        let V = U.value;
        if (!G(V)) return U.issues.push({ expected: "object", code: "invalid_type", input: V, inst: Q }), U;
        let L = [];
        if (W && B && q?.async === false && q.jitless !== true) {
          if (!J) J = Y($.shape);
          U = J(U, q);
        } else {
          U.value = {};
          let R = K.shape;
          for (let Z of K.keys) {
            let v = R[Z], O0 = v._zod.run({ value: V[Z], issues: [] }, q), D0 = v._zod.optin === "optional" && v._zod.optout === "optional";
            if (O0 instanceof Promise) L.push(O0.then((d0) => D0 ? IG(d0, U, Z, V) : U8(d0, U, Z)));
            else if (D0) IG(O0, U, Z, V);
            else U8(O0, U, Z);
          }
        }
        if (!z) return L.length ? Promise.all(L).then(() => U) : U;
        let F = [], w = K.keySet, D = z._zod, M = D.def.type;
        for (let R of Object.keys(V)) {
          if (w.has(R)) continue;
          if (M === "never") {
            F.push(R);
            continue;
          }
          let Z = D.run({ value: V[R], issues: [] }, q);
          if (Z instanceof Promise) L.push(Z.then((v) => U8(v, U, R)));
          else U8(Z, U, R);
        }
        if (F.length) U.issues.push({ code: "unrecognized_keys", keys: F, input: V, inst: Q });
        if (!L.length) return U;
        return Promise.all(L).then(() => {
          return U;
        });
      };
    });
    N8 = O("$ZodUnion", (Q, $) => {
      e.init(Q, $), Y0(Q._zod, "optin", () => $.options.some((X) => X._zod.optin === "optional") ? "optional" : void 0), Y0(Q._zod, "optout", () => $.options.some((X) => X._zod.optout === "optional") ? "optional" : void 0), Y0(Q._zod, "values", () => {
        if ($.options.every((X) => X._zod.values)) return new Set($.options.flatMap((X) => Array.from(X._zod.values)));
        return;
      }), Y0(Q._zod, "pattern", () => {
        if ($.options.every((X) => X._zod.pattern)) {
          let X = $.options.map((Y) => Y._zod.pattern);
          return new RegExp(`^(${X.map((Y) => e4(Y.source)).join("|")})$`);
        }
        return;
      }), Q._zod.parse = (X, Y) => {
        let J = false, G = [];
        for (let W of $.options) {
          let H = W._zod.run({ value: X.value, issues: [] }, Y);
          if (H instanceof Promise) G.push(H), J = true;
          else {
            if (H.issues.length === 0) return H;
            G.push(H);
          }
        }
        if (!J) return EG(G, X, Q, Y);
        return Promise.all(G).then((W) => {
          return EG(W, X, Q, Y);
        });
      };
    });
    JX = O("$ZodDiscriminatedUnion", (Q, $) => {
      N8.init(Q, $);
      let X = Q._zod.parse;
      Y0(Q._zod, "propValues", () => {
        let J = {};
        for (let G of $.options) {
          let W = G._zod.propValues;
          if (!W || Object.keys(W).length === 0) throw Error(`Invalid discriminated union option at index "${$.options.indexOf(G)}"`);
          for (let [H, B] of Object.entries(W)) {
            if (!J[H]) J[H] = /* @__PURE__ */ new Set();
            for (let z of B) J[H].add(z);
          }
        }
        return J;
      });
      let Y = a4(() => {
        let J = $.options, G = /* @__PURE__ */ new Map();
        for (let W of J) {
          let H = W._zod.propValues[$.discriminator];
          if (!H || H.size === 0) throw Error(`Invalid discriminated union option at index "${$.options.indexOf(W)}"`);
          for (let B of H) {
            if (G.has(B)) throw Error(`Duplicate discriminator value "${String(B)}"`);
            G.set(B, W);
          }
        }
        return G;
      });
      Q._zod.parse = (J, G) => {
        let W = J.value;
        if (!K4(W)) return J.issues.push({ code: "invalid_type", expected: "object", input: W, inst: Q }), J;
        let H = Y.value.get(W?.[$.discriminator]);
        if (H) return H._zod.run(J, G);
        if ($.unionFallback) return X(J, G);
        return J.issues.push({ code: "invalid_union", errors: [], note: "No matching discriminator", input: W, path: [$.discriminator], inst: Q }), J;
      };
    });
    GX = O("$ZodIntersection", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X, Y) => {
        let J = X.value, G = $.left._zod.run({ value: J, issues: [] }, Y), W = $.right._zod.run({ value: J, issues: [] }, Y);
        if (G instanceof Promise || W instanceof Promise) return Promise.all([G, W]).then(([B, z]) => {
          return PG(X, B, z);
        });
        return PG(X, G, W);
      };
    });
    WX = O("$ZodRecord", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X, Y) => {
        let J = X.value;
        if (!V4(J)) return X.issues.push({ expected: "record", code: "invalid_type", input: J, inst: Q }), X;
        let G = [];
        if ($.keyType._zod.values) {
          let W = $.keyType._zod.values;
          X.value = {};
          for (let B of W) if (typeof B === "string" || typeof B === "number" || typeof B === "symbol") {
            let z = $.valueType._zod.run({ value: J[B], issues: [] }, Y);
            if (z instanceof Promise) G.push(z.then((K) => {
              if (K.issues.length) X.issues.push(...j1(B, K.issues));
              X.value[B] = K.value;
            }));
            else {
              if (z.issues.length) X.issues.push(...j1(B, z.issues));
              X.value[B] = z.value;
            }
          }
          let H;
          for (let B in J) if (!W.has(B)) H = H ?? [], H.push(B);
          if (H && H.length > 0) X.issues.push({ code: "unrecognized_keys", input: J, inst: Q, keys: H });
        } else {
          X.value = {};
          for (let W of Reflect.ownKeys(J)) {
            if (W === "__proto__") continue;
            let H = $.keyType._zod.run({ value: W, issues: [] }, Y);
            if (H instanceof Promise) throw Error("Async schemas not supported in object keys currently");
            if (H.issues.length) {
              X.issues.push({ origin: "record", code: "invalid_key", issues: H.issues.map((z) => W1(z, Y, l0())), input: W, path: [W], inst: Q }), X.value[H.value] = H.value;
              continue;
            }
            let B = $.valueType._zod.run({ value: J[W], issues: [] }, Y);
            if (B instanceof Promise) G.push(B.then((z) => {
              if (z.issues.length) X.issues.push(...j1(W, z.issues));
              X.value[H.value] = z.value;
            }));
            else {
              if (B.issues.length) X.issues.push(...j1(W, B.issues));
              X.value[H.value] = B.value;
            }
          }
        }
        if (G.length) return Promise.all(G).then(() => X);
        return X;
      };
    });
    HX = O("$ZodEnum", (Q, $) => {
      e.init(Q, $);
      let X = t4($.entries);
      Q._zod.values = new Set(X), Q._zod.pattern = new RegExp(`^(${X.filter((Y) => F$.has(typeof Y)).map((Y) => typeof Y === "string" ? o1(Y) : Y.toString()).join("|")})$`), Q._zod.parse = (Y, J) => {
        let G = Y.value;
        if (Q._zod.values.has(G)) return Y;
        return Y.issues.push({ code: "invalid_value", values: X, input: G, inst: Q }), Y;
      };
    });
    BX = O("$ZodLiteral", (Q, $) => {
      e.init(Q, $), Q._zod.values = new Set($.values), Q._zod.pattern = new RegExp(`^(${$.values.map((X) => typeof X === "string" ? o1(X) : X ? X.toString() : String(X)).join("|")})$`), Q._zod.parse = (X, Y) => {
        let J = X.value;
        if (Q._zod.values.has(J)) return X;
        return X.issues.push({ code: "invalid_value", values: $.values, input: J, inst: Q }), X;
      };
    });
    zX = O("$ZodTransform", (Q, $) => {
      e.init(Q, $), Q._zod.parse = (X, Y) => {
        let J = $.transform(X.value, X);
        if (Y.async) return (J instanceof Promise ? J : Promise.resolve(J)).then((W) => {
          return X.value = W, X;
        });
        if (J instanceof Promise) throw new n1();
        return X.value = J, X;
      };
    });
    KX = O("$ZodOptional", (Q, $) => {
      e.init(Q, $), Q._zod.optin = "optional", Q._zod.optout = "optional", Y0(Q._zod, "values", () => {
        return $.innerType._zod.values ? /* @__PURE__ */ new Set([...$.innerType._zod.values, void 0]) : void 0;
      }), Y0(Q._zod, "pattern", () => {
        let X = $.innerType._zod.pattern;
        return X ? new RegExp(`^(${e4(X.source)})?$`) : void 0;
      }), Q._zod.parse = (X, Y) => {
        if ($.innerType._zod.optin === "optional") return $.innerType._zod.run(X, Y);
        if (X.value === void 0) return X;
        return $.innerType._zod.run(X, Y);
      };
    });
    VX = O("$ZodNullable", (Q, $) => {
      e.init(Q, $), Y0(Q._zod, "optin", () => $.innerType._zod.optin), Y0(Q._zod, "optout", () => $.innerType._zod.optout), Y0(Q._zod, "pattern", () => {
        let X = $.innerType._zod.pattern;
        return X ? new RegExp(`^(${e4(X.source)}|null)$`) : void 0;
      }), Y0(Q._zod, "values", () => {
        return $.innerType._zod.values ? /* @__PURE__ */ new Set([...$.innerType._zod.values, null]) : void 0;
      }), Q._zod.parse = (X, Y) => {
        if (X.value === null) return X;
        return $.innerType._zod.run(X, Y);
      };
    });
    qX = O("$ZodDefault", (Q, $) => {
      e.init(Q, $), Q._zod.optin = "optional", Y0(Q._zod, "values", () => $.innerType._zod.values), Q._zod.parse = (X, Y) => {
        if (X.value === void 0) return X.value = $.defaultValue, X;
        let J = $.innerType._zod.run(X, Y);
        if (J instanceof Promise) return J.then((G) => bG(G, $));
        return bG(J, $);
      };
    });
    UX = O("$ZodPrefault", (Q, $) => {
      e.init(Q, $), Q._zod.optin = "optional", Y0(Q._zod, "values", () => $.innerType._zod.values), Q._zod.parse = (X, Y) => {
        if (X.value === void 0) X.value = $.defaultValue;
        return $.innerType._zod.run(X, Y);
      };
    });
    LX = O("$ZodNonOptional", (Q, $) => {
      e.init(Q, $), Y0(Q._zod, "values", () => {
        let X = $.innerType._zod.values;
        return X ? new Set([...X].filter((Y) => Y !== void 0)) : void 0;
      }), Q._zod.parse = (X, Y) => {
        let J = $.innerType._zod.run(X, Y);
        if (J instanceof Promise) return J.then((G) => ZG(G, Q));
        return ZG(J, Q);
      };
    });
    FX = O("$ZodCatch", (Q, $) => {
      e.init(Q, $), Q._zod.optin = "optional", Y0(Q._zod, "optout", () => $.innerType._zod.optout), Y0(Q._zod, "values", () => $.innerType._zod.values), Q._zod.parse = (X, Y) => {
        let J = $.innerType._zod.run(X, Y);
        if (J instanceof Promise) return J.then((G) => {
          if (X.value = G.value, G.issues.length) X.value = $.catchValue({ ...X, error: { issues: G.issues.map((W) => W1(W, Y, l0())) }, input: X.value }), X.issues = [];
          return X;
        });
        if (X.value = J.value, J.issues.length) X.value = $.catchValue({ ...X, error: { issues: J.issues.map((G) => W1(G, Y, l0())) }, input: X.value }), X.issues = [];
        return X;
      };
    });
    NX = O("$ZodPipe", (Q, $) => {
      e.init(Q, $), Y0(Q._zod, "values", () => $.in._zod.values), Y0(Q._zod, "optin", () => $.in._zod.optin), Y0(Q._zod, "optout", () => $.out._zod.optout), Q._zod.parse = (X, Y) => {
        let J = $.in._zod.run(X, Y);
        if (J instanceof Promise) return J.then((G) => CG(G, $, Y));
        return CG(J, $, Y);
      };
    });
    OX = O("$ZodReadonly", (Q, $) => {
      e.init(Q, $), Y0(Q._zod, "propValues", () => $.innerType._zod.propValues), Y0(Q._zod, "values", () => $.innerType._zod.values), Y0(Q._zod, "optin", () => $.innerType._zod.optin), Y0(Q._zod, "optout", () => $.innerType._zod.optout), Q._zod.parse = (X, Y) => {
        let J = $.innerType._zod.run(X, Y);
        if (J instanceof Promise) return J.then(SG);
        return SG(J);
      };
    });
    DX = O("$ZodCustom", (Q, $) => {
      j0.init(Q, $), e.init(Q, $), Q._zod.parse = (X, Y) => {
        return X;
      }, Q._zod.check = (X) => {
        let Y = X.value, J = $.fn(Y);
        if (J instanceof Promise) return J.then((G) => _G(G, X, Y, Q));
        _G(J, X, Y, Q);
        return;
      };
    });
    YN = (Q) => {
      let $ = typeof Q;
      switch ($) {
        case "number":
          return Number.isNaN(Q) ? "NaN" : "number";
        case "object": {
          if (Array.isArray(Q)) return "array";
          if (Q === null) return "null";
          if (Object.getPrototypeOf(Q) !== Object.prototype && Q.constructor) return Q.constructor.name;
        }
      }
      return $;
    };
    JN = () => {
      let Q = { string: { unit: "characters", verb: "to have" }, file: { unit: "bytes", verb: "to have" }, array: { unit: "items", verb: "to have" }, set: { unit: "items", verb: "to have" } };
      function $(Y) {
        return Q[Y] ?? null;
      }
      let X = { regex: "input", email: "email address", url: "URL", emoji: "emoji", uuid: "UUID", uuidv4: "UUIDv4", uuidv6: "UUIDv6", nanoid: "nanoid", guid: "GUID", cuid: "cuid", cuid2: "cuid2", ulid: "ULID", xid: "XID", ksuid: "KSUID", datetime: "ISO datetime", date: "ISO date", time: "ISO time", duration: "ISO duration", ipv4: "IPv4 address", ipv6: "IPv6 address", cidrv4: "IPv4 range", cidrv6: "IPv6 range", base64: "base64-encoded string", base64url: "base64url-encoded string", json_string: "JSON string", e164: "E.164 number", jwt: "JWT", template_literal: "input" };
      return (Y) => {
        switch (Y.code) {
          case "invalid_type":
            return `Invalid input: expected ${Y.expected}, received ${YN(Y.input)}`;
          case "invalid_value":
            if (Y.values.length === 1) return `Invalid input: expected ${K8(Y.values[0])}`;
            return `Invalid option: expected one of ${B8(Y.values, "|")}`;
          case "too_big": {
            let J = Y.inclusive ? "<=" : "<", G = $(Y.origin);
            if (G) return `Too big: expected ${Y.origin ?? "value"} to have ${J}${Y.maximum.toString()} ${G.unit ?? "elements"}`;
            return `Too big: expected ${Y.origin ?? "value"} to be ${J}${Y.maximum.toString()}`;
          }
          case "too_small": {
            let J = Y.inclusive ? ">=" : ">", G = $(Y.origin);
            if (G) return `Too small: expected ${Y.origin} to have ${J}${Y.minimum.toString()} ${G.unit}`;
            return `Too small: expected ${Y.origin} to be ${J}${Y.minimum.toString()}`;
          }
          case "invalid_format": {
            let J = Y;
            if (J.format === "starts_with") return `Invalid string: must start with "${J.prefix}"`;
            if (J.format === "ends_with") return `Invalid string: must end with "${J.suffix}"`;
            if (J.format === "includes") return `Invalid string: must include "${J.includes}"`;
            if (J.format === "regex") return `Invalid string: must match pattern ${J.pattern}`;
            return `Invalid ${X[J.format] ?? Y.format}`;
          }
          case "not_multiple_of":
            return `Invalid number: must be a multiple of ${Y.divisor}`;
          case "unrecognized_keys":
            return `Unrecognized key${Y.keys.length > 1 ? "s" : ""}: ${B8(Y.keys, ", ")}`;
          case "invalid_key":
            return `Invalid key in ${Y.origin}`;
          case "invalid_union":
            return "Invalid input";
          case "invalid_element":
            return `Invalid value in ${Y.origin}`;
          default:
            return "Invalid input";
        }
      };
    };
    GN = Symbol("ZodOutput");
    WN = Symbol("ZodInput");
    O8 = class {
      constructor() {
        this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map();
      }
      add(Q, ...$) {
        let X = $[0];
        if (this._map.set(Q, X), X && typeof X === "object" && "id" in X) {
          if (this._idmap.has(X.id)) throw Error(`ID ${X.id} already exists in the registry`);
          this._idmap.set(X.id, Q);
        }
        return this;
      }
      remove(Q) {
        return this._map.delete(Q), this;
      }
      get(Q) {
        let $ = Q._zod.parent;
        if ($) {
          let X = { ...this.get($) ?? {} };
          return delete X.id, { ...X, ...this._map.get(Q) };
        }
        return this._map.get(Q);
      }
      has(Q) {
        return this._map.has(Q);
      }
    };
    r1 = gG();
    WY = class {
      constructor(Q) {
        this.counter = 0, this.metadataRegistry = Q?.metadata ?? r1, this.target = Q?.target ?? "draft-2020-12", this.unrepresentable = Q?.unrepresentable ?? "throw", this.override = Q?.override ?? (() => {
        }), this.io = Q?.io ?? "output", this.seen = /* @__PURE__ */ new Map();
      }
      process(Q, $ = { path: [], schemaPath: [] }) {
        var X;
        let Y = Q._zod.def, J = { guid: "uuid", url: "uri", datetime: "date-time", json_string: "json-string", regex: "" }, G = this.seen.get(Q);
        if (G) {
          if (G.count++, $.schemaPath.includes(Q)) G.cycle = $.path;
          return G.schema;
        }
        let W = { schema: {}, count: 1, cycle: void 0, path: $.path };
        this.seen.set(Q, W);
        let H = Q._zod.toJSONSchema?.();
        if (H) W.schema = H;
        else {
          let K = { ...$, schemaPath: [...$.schemaPath, Q], path: $.path }, U = Q._zod.parent;
          if (U) W.ref = U, this.process(U, K), this.seen.get(U).isParent = true;
          else {
            let q = W.schema;
            switch (Y.type) {
              case "string": {
                let V = q;
                V.type = "string";
                let { minimum: L, maximum: F, format: w, patterns: D, contentEncoding: M } = Q._zod.bag;
                if (typeof L === "number") V.minLength = L;
                if (typeof F === "number") V.maxLength = F;
                if (w) {
                  if (V.format = J[w] ?? w, V.format === "") delete V.format;
                }
                if (M) V.contentEncoding = M;
                if (D && D.size > 0) {
                  let R = [...D];
                  if (R.length === 1) V.pattern = R[0].source;
                  else if (R.length > 1) W.schema.allOf = [...R.map((Z) => ({ ...this.target === "draft-7" ? { type: "string" } : {}, pattern: Z.source }))];
                }
                break;
              }
              case "number": {
                let V = q, { minimum: L, maximum: F, format: w, multipleOf: D, exclusiveMaximum: M, exclusiveMinimum: R } = Q._zod.bag;
                if (typeof w === "string" && w.includes("int")) V.type = "integer";
                else V.type = "number";
                if (typeof R === "number") V.exclusiveMinimum = R;
                if (typeof L === "number") {
                  if (V.minimum = L, typeof R === "number") if (R >= L) delete V.minimum;
                  else delete V.exclusiveMinimum;
                }
                if (typeof M === "number") V.exclusiveMaximum = M;
                if (typeof F === "number") {
                  if (V.maximum = F, typeof M === "number") if (M <= F) delete V.maximum;
                  else delete V.exclusiveMaximum;
                }
                if (typeof D === "number") V.multipleOf = D;
                break;
              }
              case "boolean": {
                let V = q;
                V.type = "boolean";
                break;
              }
              case "bigint": {
                if (this.unrepresentable === "throw") throw Error("BigInt cannot be represented in JSON Schema");
                break;
              }
              case "symbol": {
                if (this.unrepresentable === "throw") throw Error("Symbols cannot be represented in JSON Schema");
                break;
              }
              case "null": {
                q.type = "null";
                break;
              }
              case "any":
                break;
              case "unknown":
                break;
              case "undefined":
              case "never": {
                q.not = {};
                break;
              }
              case "void": {
                if (this.unrepresentable === "throw") throw Error("Void cannot be represented in JSON Schema");
                break;
              }
              case "date": {
                if (this.unrepresentable === "throw") throw Error("Date cannot be represented in JSON Schema");
                break;
              }
              case "array": {
                let V = q, { minimum: L, maximum: F } = Q._zod.bag;
                if (typeof L === "number") V.minItems = L;
                if (typeof F === "number") V.maxItems = F;
                V.type = "array", V.items = this.process(Y.element, { ...K, path: [...K.path, "items"] });
                break;
              }
              case "object": {
                let V = q;
                V.type = "object", V.properties = {};
                let L = Y.shape;
                for (let D in L) V.properties[D] = this.process(L[D], { ...K, path: [...K.path, "properties", D] });
                let F = new Set(Object.keys(L)), w = new Set([...F].filter((D) => {
                  let M = Y.shape[D]._zod;
                  if (this.io === "input") return M.optin === void 0;
                  else return M.optout === void 0;
                }));
                if (w.size > 0) V.required = Array.from(w);
                if (Y.catchall?._zod.def.type === "never") V.additionalProperties = false;
                else if (!Y.catchall) {
                  if (this.io === "output") V.additionalProperties = false;
                } else if (Y.catchall) V.additionalProperties = this.process(Y.catchall, { ...K, path: [...K.path, "additionalProperties"] });
                break;
              }
              case "union": {
                let V = q;
                V.anyOf = Y.options.map((L, F) => this.process(L, { ...K, path: [...K.path, "anyOf", F] }));
                break;
              }
              case "intersection": {
                let V = q, L = this.process(Y.left, { ...K, path: [...K.path, "allOf", 0] }), F = this.process(Y.right, { ...K, path: [...K.path, "allOf", 1] }), w = (M) => "allOf" in M && Object.keys(M).length === 1, D = [...w(L) ? L.allOf : [L], ...w(F) ? F.allOf : [F]];
                V.allOf = D;
                break;
              }
              case "tuple": {
                let V = q;
                V.type = "array";
                let L = Y.items.map((D, M) => this.process(D, { ...K, path: [...K.path, "prefixItems", M] }));
                if (this.target === "draft-2020-12") V.prefixItems = L;
                else V.items = L;
                if (Y.rest) {
                  let D = this.process(Y.rest, { ...K, path: [...K.path, "items"] });
                  if (this.target === "draft-2020-12") V.items = D;
                  else V.additionalItems = D;
                }
                if (Y.rest) V.items = this.process(Y.rest, { ...K, path: [...K.path, "items"] });
                let { minimum: F, maximum: w } = Q._zod.bag;
                if (typeof F === "number") V.minItems = F;
                if (typeof w === "number") V.maxItems = w;
                break;
              }
              case "record": {
                let V = q;
                V.type = "object", V.propertyNames = this.process(Y.keyType, { ...K, path: [...K.path, "propertyNames"] }), V.additionalProperties = this.process(Y.valueType, { ...K, path: [...K.path, "additionalProperties"] });
                break;
              }
              case "map": {
                if (this.unrepresentable === "throw") throw Error("Map cannot be represented in JSON Schema");
                break;
              }
              case "set": {
                if (this.unrepresentable === "throw") throw Error("Set cannot be represented in JSON Schema");
                break;
              }
              case "enum": {
                let V = q, L = t4(Y.entries);
                if (L.every((F) => typeof F === "number")) V.type = "number";
                if (L.every((F) => typeof F === "string")) V.type = "string";
                V.enum = L;
                break;
              }
              case "literal": {
                let V = q, L = [];
                for (let F of Y.values) if (F === void 0) {
                  if (this.unrepresentable === "throw") throw Error("Literal `undefined` cannot be represented in JSON Schema");
                } else if (typeof F === "bigint") if (this.unrepresentable === "throw") throw Error("BigInt literals cannot be represented in JSON Schema");
                else L.push(Number(F));
                else L.push(F);
                if (L.length === 0) ;
                else if (L.length === 1) {
                  let F = L[0];
                  V.type = F === null ? "null" : typeof F, V.const = F;
                } else {
                  if (L.every((F) => typeof F === "number")) V.type = "number";
                  if (L.every((F) => typeof F === "string")) V.type = "string";
                  if (L.every((F) => typeof F === "boolean")) V.type = "string";
                  if (L.every((F) => F === null)) V.type = "null";
                  V.enum = L;
                }
                break;
              }
              case "file": {
                let V = q, L = { type: "string", format: "binary", contentEncoding: "binary" }, { minimum: F, maximum: w, mime: D } = Q._zod.bag;
                if (F !== void 0) L.minLength = F;
                if (w !== void 0) L.maxLength = w;
                if (D) if (D.length === 1) L.contentMediaType = D[0], Object.assign(V, L);
                else V.anyOf = D.map((M) => {
                  return { ...L, contentMediaType: M };
                });
                else Object.assign(V, L);
                break;
              }
              case "transform": {
                if (this.unrepresentable === "throw") throw Error("Transforms cannot be represented in JSON Schema");
                break;
              }
              case "nullable": {
                let V = this.process(Y.innerType, K);
                q.anyOf = [V, { type: "null" }];
                break;
              }
              case "nonoptional": {
                this.process(Y.innerType, K), W.ref = Y.innerType;
                break;
              }
              case "success": {
                let V = q;
                V.type = "boolean";
                break;
              }
              case "default": {
                this.process(Y.innerType, K), W.ref = Y.innerType, q.default = JSON.parse(JSON.stringify(Y.defaultValue));
                break;
              }
              case "prefault": {
                if (this.process(Y.innerType, K), W.ref = Y.innerType, this.io === "input") q._prefault = JSON.parse(JSON.stringify(Y.defaultValue));
                break;
              }
              case "catch": {
                this.process(Y.innerType, K), W.ref = Y.innerType;
                let V;
                try {
                  V = Y.catchValue(void 0);
                } catch {
                  throw Error("Dynamic catch values are not supported in JSON Schema");
                }
                q.default = V;
                break;
              }
              case "nan": {
                if (this.unrepresentable === "throw") throw Error("NaN cannot be represented in JSON Schema");
                break;
              }
              case "template_literal": {
                let V = q, L = Q._zod.pattern;
                if (!L) throw Error("Pattern not found in template literal");
                V.type = "string", V.pattern = L.source;
                break;
              }
              case "pipe": {
                let V = this.io === "input" ? Y.in._zod.def.type === "transform" ? Y.out : Y.in : Y.out;
                this.process(V, K), W.ref = V;
                break;
              }
              case "readonly": {
                this.process(Y.innerType, K), W.ref = Y.innerType, q.readOnly = true;
                break;
              }
              case "promise": {
                this.process(Y.innerType, K), W.ref = Y.innerType;
                break;
              }
              case "optional": {
                this.process(Y.innerType, K), W.ref = Y.innerType;
                break;
              }
              case "lazy": {
                let V = Q._zod.innerType;
                this.process(V, K), W.ref = V;
                break;
              }
              case "custom": {
                if (this.unrepresentable === "throw") throw Error("Custom types cannot be represented in JSON Schema");
                break;
              }
              default:
            }
          }
        }
        let B = this.metadataRegistry.get(Q);
        if (B) Object.assign(W.schema, B);
        if (this.io === "input" && w0(Q)) delete W.schema.examples, delete W.schema.default;
        if (this.io === "input" && W.schema._prefault) (X = W.schema).default ?? (X.default = W.schema._prefault);
        return delete W.schema._prefault, this.seen.get(Q).schema;
      }
      emit(Q, $) {
        let X = { cycles: $?.cycles ?? "ref", reused: $?.reused ?? "inline", external: $?.external ?? void 0 }, Y = this.seen.get(Q);
        if (!Y) throw Error("Unprocessed schema. This is a bug in Zod.");
        let J = (z) => {
          let K = this.target === "draft-2020-12" ? "$defs" : "definitions";
          if (X.external) {
            let L = X.external.registry.get(z[0])?.id;
            if (L) return { ref: X.external.uri(L) };
            let F = z[1].defId ?? z[1].schema.id ?? `schema${this.counter++}`;
            return z[1].defId = F, { defId: F, ref: `${X.external.uri("__shared")}#/${K}/${F}` };
          }
          if (z[1] === Y) return { ref: "#" };
          let q = `${"#"}/${K}/`, V = z[1].schema.id ?? `__schema${this.counter++}`;
          return { defId: V, ref: q + V };
        }, G = (z) => {
          if (z[1].schema.$ref) return;
          let K = z[1], { ref: U, defId: q } = J(z);
          if (K.def = { ...K.schema }, q) K.defId = q;
          let V = K.schema;
          for (let L in V) delete V[L];
          V.$ref = U;
        };
        for (let z of this.seen.entries()) {
          let K = z[1];
          if (Q === z[0]) {
            G(z);
            continue;
          }
          if (X.external) {
            let q = X.external.registry.get(z[0])?.id;
            if (Q !== z[0] && q) {
              G(z);
              continue;
            }
          }
          if (this.metadataRegistry.get(z[0])?.id) {
            G(z);
            continue;
          }
          if (K.cycle) {
            if (X.cycles === "throw") throw Error(`Cycle detected: #/${K.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
            else if (X.cycles === "ref") G(z);
            continue;
          }
          if (K.count > 1) {
            if (X.reused === "ref") {
              G(z);
              continue;
            }
          }
        }
        let W = (z, K) => {
          let U = this.seen.get(z), q = U.def ?? U.schema, V = { ...q };
          if (U.ref === null) return;
          let L = U.ref;
          if (U.ref = null, L) {
            W(L, K);
            let F = this.seen.get(L).schema;
            if (F.$ref && K.target === "draft-7") q.allOf = q.allOf ?? [], q.allOf.push(F);
            else Object.assign(q, F), Object.assign(q, V);
          }
          if (!U.isParent) this.override({ zodSchema: z, jsonSchema: q, path: U.path ?? [] });
        };
        for (let z of [...this.seen.entries()].reverse()) W(z[0], { target: this.target });
        let H = {};
        if (this.target === "draft-2020-12") H.$schema = "https://json-schema.org/draft/2020-12/schema";
        else if (this.target === "draft-7") H.$schema = "http://json-schema.org/draft-07/schema#";
        else console.warn(`Invalid target: ${this.target}`);
        Object.assign(H, Y.def);
        let B = X.external?.defs ?? {};
        for (let z of this.seen.entries()) {
          let K = z[1];
          if (K.def && K.defId) B[K.defId] = K.def;
        }
        if (!X.external && Object.keys(B).length > 0) if (this.target === "draft-2020-12") H.$defs = B;
        else H.definitions = B;
        try {
          return JSON.parse(JSON.stringify(H));
        } catch (z) {
          throw Error("Error converting schema to JSON.");
        }
      }
    };
    mN = O("ZodMiniType", (Q, $) => {
      if (!Q._zod) throw Error("Uninitialized schema in ZodMiniType.");
      e.init(Q, $), Q.def = $, Q.parse = (X, Y) => j$(Q, X, Y, { callee: Q.parse }), Q.safeParse = (X, Y) => j6(Q, X, Y), Q.parseAsync = async (X, Y) => I$(Q, X, Y, { callee: Q.parseAsync }), Q.safeParseAsync = async (X, Y) => R6(Q, X, Y), Q.check = (...X) => {
        return Q.clone({ ...$, checks: [...$.checks ?? [], ...X.map((Y) => typeof Y === "function" ? { _zod: { check: Y, def: { check: "custom" }, onattach: [] } } : Y)] });
      }, Q.clone = (X, Y) => c0(Q, X, Y), Q.brand = () => Q, Q.register = (X, Y) => {
        return X.add(Q, Y), Q;
      };
    });
    lN = O("ZodMiniObject", (Q, $) => {
      F8.init(Q, $), mN.init(Q, $), i.defineLazy(Q, "shape", () => $.shape);
    });
    W9 = {};
    uQ(W9, { time: () => VY, duration: () => qY, datetime: () => zY, date: () => KY, ZodISOTime: () => oG, ZodISODuration: () => rG, ZodISODateTime: () => iG, ZodISODate: () => nG });
    iG = O("ZodISODateTime", (Q, $) => {
      kG.init(Q, $), B0.init(Q, $);
    });
    nG = O("ZodISODate", (Q, $) => {
      vG.init(Q, $), B0.init(Q, $);
    });
    oG = O("ZodISOTime", (Q, $) => {
      TG.init(Q, $), B0.init(Q, $);
    });
    rG = O("ZodISODuration", (Q, $) => {
      xG.init(Q, $), B0.init(Q, $);
    });
    tG = (Q, $) => {
      V8.init(Q, $), Q.name = "ZodError", Object.defineProperties(Q, { format: { value: (X) => M$(Q, X) }, flatten: { value: (X) => w$(Q, X) }, addIssue: { value: (X) => Q.issues.push(X) }, addIssues: { value: (X) => Q.issues.push(...X) }, isEmpty: { get() {
        return Q.issues.length === 0;
      } } });
    };
    Fk = O("ZodError", tG);
    H9 = O("ZodError", tG, { Parent: Error });
    aG = A$(H9);
    sG = R$(H9);
    eG = E$(H9);
    QW = P$(H9);
    F0 = O("ZodType", (Q, $) => {
      return e.init(Q, $), Q.def = $, Object.defineProperty(Q, "_def", { value: $ }), Q.check = (...X) => {
        return Q.clone({ ...$, checks: [...$.checks ?? [], ...X.map((Y) => typeof Y === "function" ? { _zod: { check: Y, def: { check: "custom" }, onattach: [] } } : Y)] });
      }, Q.clone = (X, Y) => c0(Q, X, Y), Q.brand = () => Q, Q.register = (X, Y) => {
        return X.add(Q, Y), Q;
      }, Q.parse = (X, Y) => aG(Q, X, Y, { callee: Q.parse }), Q.safeParse = (X, Y) => eG(Q, X, Y), Q.parseAsync = async (X, Y) => sG(Q, X, Y, { callee: Q.parseAsync }), Q.safeParseAsync = async (X, Y) => QW(Q, X, Y), Q.spa = Q.safeParseAsync, Q.refine = (X, Y) => Q.check(fO(X, Y)), Q.superRefine = (X) => Q.check(uO(X)), Q.overwrite = (X) => Q.check(I6(X)), Q.optional = () => L0(Q), Q.nullable = () => YW(Q), Q.nullish = () => L0(YW(Q)), Q.nonoptional = (X) => kO(Q, X), Q.array = () => n(Q), Q.or = (X) => G0([Q, X]), Q.and = (X) => Z8(Q, X), Q.transform = (X) => LY(Q, BW(X)), Q.default = (X) => CO(Q, X), Q.prefault = (X) => _O(Q, X), Q.catch = (X) => TO(Q, X), Q.pipe = (X) => LY(Q, X), Q.readonly = () => gO(Q), Q.describe = (X) => {
        let Y = Q.clone();
        return r1.add(Y, { description: X }), Y;
      }, Object.defineProperty(Q, "description", { get() {
        return r1.get(Q)?.description;
      }, configurable: true }), Q.meta = (...X) => {
        if (X.length === 0) return r1.get(Q);
        let Y = Q.clone();
        return r1.add(Y, X[0]), Y;
      }, Q.isOptional = () => Q.safeParse(void 0).success, Q.isNullable = () => Q.safeParse(null).success, Q;
    });
    JW = O("_ZodString", (Q, $) => {
      Y9.init(Q, $), F0.init(Q, $);
      let X = Q._zod.bag;
      Q.format = X.format ?? null, Q.minLength = X.minimum ?? null, Q.maxLength = X.maximum ?? null, Q.regex = (...Y) => Q.check(oX(...Y)), Q.includes = (...Y) => Q.check(aX(...Y)), Q.startsWith = (...Y) => Q.check(sX(...Y)), Q.endsWith = (...Y) => Q.check(eX(...Y)), Q.min = (...Y) => Q.check(q4(...Y)), Q.max = (...Y) => Q.check(j8(...Y)), Q.length = (...Y) => Q.check(R8(...Y)), Q.nonempty = (...Y) => Q.check(q4(1, ...Y)), Q.lowercase = (Y) => Q.check(rX(Y)), Q.uppercase = (Y) => Q.check(tX(Y)), Q.trim = () => Q.check($Y()), Q.normalize = (...Y) => Q.check(QY(...Y)), Q.toLowerCase = () => Q.check(XY()), Q.toUpperCase = () => Q.check(YY());
    });
    aN = O("ZodString", (Q, $) => {
      Y9.init(Q, $), JW.init(Q, $), Q.email = (X) => Q.check(AX(sN, X)), Q.url = (X) => Q.check(PX(eN, X)), Q.jwt = (X) => Q.check(mX(LO, X)), Q.emoji = (X) => Q.check(bX(QO, X)), Q.guid = (X) => Q.check(D8($W, X)), Q.uuid = (X) => Q.check(jX(b8, X)), Q.uuidv4 = (X) => Q.check(RX(b8, X)), Q.uuidv6 = (X) => Q.check(IX(b8, X)), Q.uuidv7 = (X) => Q.check(EX(b8, X)), Q.nanoid = (X) => Q.check(ZX($O, X)), Q.guid = (X) => Q.check(D8($W, X)), Q.cuid = (X) => Q.check(CX(XO, X)), Q.cuid2 = (X) => Q.check(SX(YO, X)), Q.ulid = (X) => Q.check(_X(JO, X)), Q.base64 = (X) => Q.check(hX(VO, X)), Q.base64url = (X) => Q.check(fX(qO, X)), Q.xid = (X) => Q.check(kX(GO, X)), Q.ksuid = (X) => Q.check(vX(WO, X)), Q.ipv4 = (X) => Q.check(TX(HO, X)), Q.ipv6 = (X) => Q.check(xX(BO, X)), Q.cidrv4 = (X) => Q.check(yX(zO, X)), Q.cidrv6 = (X) => Q.check(gX(KO, X)), Q.e164 = (X) => Q.check(uX(UO, X)), Q.datetime = (X) => Q.check(zY(X)), Q.date = (X) => Q.check(KY(X)), Q.time = (X) => Q.check(VY(X)), Q.duration = (X) => Q.check(qY(X));
    });
    B0 = O("ZodStringFormat", (Q, $) => {
      J0.init(Q, $), JW.init(Q, $);
    });
    sN = O("ZodEmail", (Q, $) => {
      x$.init(Q, $), B0.init(Q, $);
    });
    $W = O("ZodGUID", (Q, $) => {
      v$.init(Q, $), B0.init(Q, $);
    });
    b8 = O("ZodUUID", (Q, $) => {
      T$.init(Q, $), B0.init(Q, $);
    });
    eN = O("ZodURL", (Q, $) => {
      y$.init(Q, $), B0.init(Q, $);
    });
    QO = O("ZodEmoji", (Q, $) => {
      g$.init(Q, $), B0.init(Q, $);
    });
    $O = O("ZodNanoID", (Q, $) => {
      h$.init(Q, $), B0.init(Q, $);
    });
    XO = O("ZodCUID", (Q, $) => {
      f$.init(Q, $), B0.init(Q, $);
    });
    YO = O("ZodCUID2", (Q, $) => {
      u$.init(Q, $), B0.init(Q, $);
    });
    JO = O("ZodULID", (Q, $) => {
      m$.init(Q, $), B0.init(Q, $);
    });
    GO = O("ZodXID", (Q, $) => {
      l$.init(Q, $), B0.init(Q, $);
    });
    WO = O("ZodKSUID", (Q, $) => {
      c$.init(Q, $), B0.init(Q, $);
    });
    HO = O("ZodIPv4", (Q, $) => {
      p$.init(Q, $), B0.init(Q, $);
    });
    BO = O("ZodIPv6", (Q, $) => {
      d$.init(Q, $), B0.init(Q, $);
    });
    zO = O("ZodCIDRv4", (Q, $) => {
      i$.init(Q, $), B0.init(Q, $);
    });
    KO = O("ZodCIDRv6", (Q, $) => {
      n$.init(Q, $), B0.init(Q, $);
    });
    VO = O("ZodBase64", (Q, $) => {
      o$.init(Q, $), B0.init(Q, $);
    });
    qO = O("ZodBase64URL", (Q, $) => {
      r$.init(Q, $), B0.init(Q, $);
    });
    UO = O("ZodE164", (Q, $) => {
      t$.init(Q, $), B0.init(Q, $);
    });
    LO = O("ZodJWT", (Q, $) => {
      a$.init(Q, $), B0.init(Q, $);
    });
    GW = O("ZodNumber", (Q, $) => {
      L8.init(Q, $), F0.init(Q, $), Q.gt = (Y, J) => Q.check(M8(Y, J)), Q.gte = (Y, J) => Q.check(G9(Y, J)), Q.min = (Y, J) => Q.check(G9(Y, J)), Q.lt = (Y, J) => Q.check(w8(Y, J)), Q.lte = (Y, J) => Q.check(J9(Y, J)), Q.max = (Y, J) => Q.check(J9(Y, J)), Q.int = (Y) => Q.check(XW(Y)), Q.safe = (Y) => Q.check(XW(Y)), Q.positive = (Y) => Q.check(M8(0, Y)), Q.nonnegative = (Y) => Q.check(G9(0, Y)), Q.negative = (Y) => Q.check(w8(0, Y)), Q.nonpositive = (Y) => Q.check(J9(0, Y)), Q.multipleOf = (Y, J) => Q.check(A8(Y, J)), Q.step = (Y, J) => Q.check(A8(Y, J)), Q.finite = () => Q;
      let X = Q._zod.bag;
      Q.minValue = Math.max(X.minimum ?? Number.NEGATIVE_INFINITY, X.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null, Q.maxValue = Math.min(X.maximum ?? Number.POSITIVE_INFINITY, X.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null, Q.isInt = (X.format ?? "").includes("int") || Number.isSafeInteger(X.multipleOf ?? 0.5), Q.isFinite = true, Q.format = X.format ?? null;
    });
    FO = O("ZodNumberFormat", (Q, $) => {
      s$.init(Q, $), GW.init(Q, $);
    });
    NO = O("ZodBoolean", (Q, $) => {
      e$.init(Q, $), F0.init(Q, $);
    });
    OO = O("ZodNull", (Q, $) => {
      QX.init(Q, $), F0.init(Q, $);
    });
    DO = O("ZodUnknown", (Q, $) => {
      $X.init(Q, $), F0.init(Q, $);
    });
    wO = O("ZodNever", (Q, $) => {
      XX.init(Q, $), F0.init(Q, $);
    });
    AO = O("ZodArray", (Q, $) => {
      YX.init(Q, $), F0.init(Q, $), Q.element = $.element, Q.min = (X, Y) => Q.check(q4(X, Y)), Q.nonempty = (X) => Q.check(q4(1, X)), Q.max = (X, Y) => Q.check(j8(X, Y)), Q.length = (X, Y) => Q.check(R8(X, Y)), Q.unwrap = () => Q.element;
    });
    WW = O("ZodObject", (Q, $) => {
      F8.init(Q, $), F0.init(Q, $), i.defineLazy(Q, "shape", () => $.shape), Q.keyof = () => y0(Object.keys(Q._zod.def.shape)), Q.catchall = (X) => Q.clone({ ...Q._zod.def, catchall: X }), Q.passthrough = () => Q.clone({ ...Q._zod.def, catchall: z0() }), Q.loose = () => Q.clone({ ...Q._zod.def, catchall: z0() }), Q.strict = () => Q.clone({ ...Q._zod.def, catchall: MO() }), Q.strip = () => Q.clone({ ...Q._zod.def, catchall: void 0 }), Q.extend = (X) => {
        return i.extend(Q, X);
      }, Q.merge = (X) => i.merge(Q, X), Q.pick = (X) => i.pick(Q, X), Q.omit = (X) => i.omit(Q, X), Q.partial = (...X) => i.partial(zW, Q, X[0]), Q.required = (...X) => i.required(KW, Q, X[0]);
    });
    HW = O("ZodUnion", (Q, $) => {
      N8.init(Q, $), F0.init(Q, $), Q.options = $.options;
    });
    jO = O("ZodDiscriminatedUnion", (Q, $) => {
      HW.init(Q, $), JX.init(Q, $);
    });
    RO = O("ZodIntersection", (Q, $) => {
      GX.init(Q, $), F0.init(Q, $);
    });
    IO = O("ZodRecord", (Q, $) => {
      WX.init(Q, $), F0.init(Q, $), Q.keyType = $.keyType, Q.valueType = $.valueType;
    });
    UY = O("ZodEnum", (Q, $) => {
      HX.init(Q, $), F0.init(Q, $), Q.enum = $.entries, Q.options = Object.values($.entries);
      let X = new Set(Object.keys($.entries));
      Q.extract = (Y, J) => {
        let G = {};
        for (let W of Y) if (X.has(W)) G[W] = $.entries[W];
        else throw Error(`Key ${W} not found in enum`);
        return new UY({ ...$, checks: [], ...i.normalizeParams(J), entries: G });
      }, Q.exclude = (Y, J) => {
        let G = { ...$.entries };
        for (let W of Y) if (X.has(W)) delete G[W];
        else throw Error(`Key ${W} not found in enum`);
        return new UY({ ...$, checks: [], ...i.normalizeParams(J), entries: G });
      };
    });
    EO = O("ZodLiteral", (Q, $) => {
      BX.init(Q, $), F0.init(Q, $), Q.values = new Set($.values), Object.defineProperty(Q, "value", { get() {
        if ($.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
        return $.values[0];
      } });
    });
    PO = O("ZodTransform", (Q, $) => {
      zX.init(Q, $), F0.init(Q, $), Q._zod.parse = (X, Y) => {
        X.addIssue = (G) => {
          if (typeof G === "string") X.issues.push(i.issue(G, X.value, $));
          else {
            let W = G;
            if (W.fatal) W.continue = false;
            W.code ?? (W.code = "custom"), W.input ?? (W.input = X.value), W.inst ?? (W.inst = Q), W.continue ?? (W.continue = true), X.issues.push(i.issue(W));
          }
        };
        let J = $.transform(X.value, X);
        if (J instanceof Promise) return J.then((G) => {
          return X.value = G, X;
        });
        return X.value = J, X;
      };
    });
    zW = O("ZodOptional", (Q, $) => {
      KX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType;
    });
    bO = O("ZodNullable", (Q, $) => {
      VX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType;
    });
    ZO = O("ZodDefault", (Q, $) => {
      qX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType, Q.removeDefault = Q.unwrap;
    });
    SO = O("ZodPrefault", (Q, $) => {
      UX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType;
    });
    KW = O("ZodNonOptional", (Q, $) => {
      LX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType;
    });
    vO = O("ZodCatch", (Q, $) => {
      FX.init(Q, $), F0.init(Q, $), Q.unwrap = () => Q._zod.def.innerType, Q.removeCatch = Q.unwrap;
    });
    xO = O("ZodPipe", (Q, $) => {
      NX.init(Q, $), F0.init(Q, $), Q.in = $.in, Q.out = $.out;
    });
    yO = O("ZodReadonly", (Q, $) => {
      OX.init(Q, $), F0.init(Q, $);
    });
    VW = O("ZodCustom", (Q, $) => {
      DX.init(Q, $), F0.init(Q, $);
    });
    l0(wX());
    DY = "2025-11-25";
    UW = [DY, "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
    s1 = "io.modelcontextprotocol/related-task";
    S8 = "2.0";
    R0 = qW((Q) => Q !== null && (typeof Q === "object" || typeof Q === "function"));
    LW = G0([N(), s().int()]);
    FW = N();
    Ck = S0({ ttl: G0([s(), FY()]).optional(), pollInterval: s().optional() });
    mO = b({ ttl: s().optional() });
    lO = b({ taskId: N() });
    wY = S0({ progressToken: LW.optional(), [s1]: lO.optional() });
    p0 = b({ _meta: wY.optional() });
    B9 = p0.extend({ task: mO.optional() });
    NW = (Q) => B9.safeParse(Q).success;
    I0 = b({ method: N(), params: p0.loose().optional() });
    a0 = b({ _meta: wY.optional() });
    s0 = b({ method: N(), params: a0.loose().optional() });
    E0 = S0({ _meta: wY.optional() });
    _8 = G0([N(), s().int()]);
    OW = b({ jsonrpc: _(S8), id: _8, ...I0.shape }).strict();
    MY = (Q) => OW.safeParse(Q).success;
    DW = b({ jsonrpc: _(S8), ...s0.shape }).strict();
    wW = (Q) => DW.safeParse(Q).success;
    AY = b({ jsonrpc: _(S8), id: _8, result: E0 }).strict();
    z9 = (Q) => AY.safeParse(Q).success;
    (function(Q) {
      Q[Q.ConnectionClosed = -32e3] = "ConnectionClosed", Q[Q.RequestTimeout = -32001] = "RequestTimeout", Q[Q.ParseError = -32700] = "ParseError", Q[Q.InvalidRequest = -32600] = "InvalidRequest", Q[Q.MethodNotFound = -32601] = "MethodNotFound", Q[Q.InvalidParams = -32602] = "InvalidParams", Q[Q.InternalError = -32603] = "InternalError", Q[Q.UrlElicitationRequired = -32042] = "UrlElicitationRequired";
    })(T || (T = {}));
    jY = b({ jsonrpc: _(S8), id: _8.optional(), error: b({ code: s().int(), message: N(), data: z0().optional() }) }).strict();
    MW = (Q) => jY.safeParse(Q).success;
    Sk = G0([OW, DW, AY, jY]);
    _k = G0([AY, jY]);
    k8 = E0.strict();
    cO = a0.extend({ requestId: _8.optional(), reason: N().optional() });
    v8 = s0.extend({ method: _("notifications/cancelled"), params: cO });
    pO = b({ src: N(), mimeType: N().optional(), sizes: n(N()).optional(), theme: y0(["light", "dark"]).optional() });
    K9 = b({ icons: n(pO).optional() });
    L4 = b({ name: N(), title: N().optional() });
    AW = L4.extend({ ...L4.shape, ...K9.shape, version: N(), websiteUrl: N().optional(), description: N().optional() });
    dO = Z8(b({ applyDefaults: M0().optional() }), K0(N(), z0()));
    iO = OY((Q) => {
      if (Q && typeof Q === "object" && !Array.isArray(Q)) {
        if (Object.keys(Q).length === 0) return { form: {} };
      }
      return Q;
    }, Z8(b({ form: dO.optional(), url: R0.optional() }), K0(N(), z0()).optional()));
    nO = S0({ list: R0.optional(), cancel: R0.optional(), requests: S0({ sampling: S0({ createMessage: R0.optional() }).optional(), elicitation: S0({ create: R0.optional() }).optional() }).optional() });
    oO = S0({ list: R0.optional(), cancel: R0.optional(), requests: S0({ tools: S0({ call: R0.optional() }).optional() }).optional() });
    rO = b({ experimental: K0(N(), R0).optional(), sampling: b({ context: R0.optional(), tools: R0.optional() }).optional(), elicitation: iO.optional(), roots: b({ listChanged: M0().optional() }).optional(), tasks: nO.optional() });
    tO = p0.extend({ protocolVersion: N(), capabilities: rO, clientInfo: AW });
    RY = I0.extend({ method: _("initialize"), params: tO });
    aO = b({ experimental: K0(N(), R0).optional(), logging: R0.optional(), completions: R0.optional(), prompts: b({ listChanged: M0().optional() }).optional(), resources: b({ subscribe: M0().optional(), listChanged: M0().optional() }).optional(), tools: b({ listChanged: M0().optional() }).optional(), tasks: oO.optional() });
    sO = E0.extend({ protocolVersion: N(), capabilities: aO, serverInfo: AW, instructions: N().optional() });
    IY = s0.extend({ method: _("notifications/initialized"), params: a0.optional() });
    T8 = I0.extend({ method: _("ping"), params: p0.optional() });
    eO = b({ progress: s(), total: L0(s()), message: L0(N()) });
    QD = b({ ...a0.shape, ...eO.shape, progressToken: LW });
    x8 = s0.extend({ method: _("notifications/progress"), params: QD });
    $D = p0.extend({ cursor: FW.optional() });
    V9 = I0.extend({ params: $D.optional() });
    q9 = E0.extend({ nextCursor: FW.optional() });
    XD = y0(["working", "input_required", "completed", "failed", "cancelled"]);
    U9 = b({ taskId: N(), status: XD, ttl: G0([s(), FY()]), createdAt: N(), lastUpdatedAt: N(), pollInterval: L0(s()), statusMessage: L0(N()) });
    F4 = E0.extend({ task: U9 });
    YD = a0.merge(U9);
    L9 = s0.extend({ method: _("notifications/tasks/status"), params: YD });
    y8 = I0.extend({ method: _("tasks/get"), params: p0.extend({ taskId: N() }) });
    g8 = E0.merge(U9);
    h8 = I0.extend({ method: _("tasks/result"), params: p0.extend({ taskId: N() }) });
    kk = E0.loose();
    f8 = V9.extend({ method: _("tasks/list") });
    u8 = q9.extend({ tasks: n(U9) });
    m8 = I0.extend({ method: _("tasks/cancel"), params: p0.extend({ taskId: N() }) });
    jW = E0.merge(U9);
    RW = b({ uri: N(), mimeType: L0(N()), _meta: K0(N(), z0()).optional() });
    IW = RW.extend({ text: N() });
    EY = N().refine((Q) => {
      try {
        return atob(Q), true;
      } catch {
        return false;
      }
    }, { message: "Invalid Base64 string" });
    EW = RW.extend({ blob: EY });
    F9 = y0(["user", "assistant"]);
    N4 = b({ audience: n(F9).optional(), priority: s().min(0).max(1).optional(), lastModified: W9.datetime({ offset: true }).optional() });
    PW = b({ ...L4.shape, ...K9.shape, uri: N(), description: L0(N()), mimeType: L0(N()), annotations: N4.optional(), _meta: L0(S0({})) });
    JD = b({ ...L4.shape, ...K9.shape, uriTemplate: N(), description: L0(N()), mimeType: L0(N()), annotations: N4.optional(), _meta: L0(S0({})) });
    l8 = V9.extend({ method: _("resources/list") });
    GD = q9.extend({ resources: n(PW) });
    c8 = V9.extend({ method: _("resources/templates/list") });
    WD = q9.extend({ resourceTemplates: n(JD) });
    PY = p0.extend({ uri: N() });
    HD = PY;
    p8 = I0.extend({ method: _("resources/read"), params: HD });
    BD = E0.extend({ contents: n(G0([IW, EW])) });
    zD = s0.extend({ method: _("notifications/resources/list_changed"), params: a0.optional() });
    KD = PY;
    VD = I0.extend({ method: _("resources/subscribe"), params: KD });
    qD = PY;
    UD = I0.extend({ method: _("resources/unsubscribe"), params: qD });
    LD = a0.extend({ uri: N() });
    FD = s0.extend({ method: _("notifications/resources/updated"), params: LD });
    ND = b({ name: N(), description: L0(N()), required: L0(M0()) });
    OD = b({ ...L4.shape, ...K9.shape, description: L0(N()), arguments: L0(n(ND)), _meta: L0(S0({})) });
    d8 = V9.extend({ method: _("prompts/list") });
    DD = q9.extend({ prompts: n(OD) });
    wD = p0.extend({ name: N(), arguments: K0(N(), N()).optional() });
    i8 = I0.extend({ method: _("prompts/get"), params: wD });
    bY = b({ type: _("text"), text: N(), annotations: N4.optional(), _meta: K0(N(), z0()).optional() });
    ZY = b({ type: _("image"), data: EY, mimeType: N(), annotations: N4.optional(), _meta: K0(N(), z0()).optional() });
    CY = b({ type: _("audio"), data: EY, mimeType: N(), annotations: N4.optional(), _meta: K0(N(), z0()).optional() });
    MD = b({ type: _("tool_use"), name: N(), id: N(), input: K0(N(), z0()), _meta: K0(N(), z0()).optional() });
    AD = b({ type: _("resource"), resource: G0([IW, EW]), annotations: N4.optional(), _meta: K0(N(), z0()).optional() });
    jD = PW.extend({ type: _("resource_link") });
    SY = G0([bY, ZY, CY, jD, AD]);
    RD = b({ role: F9, content: SY });
    ID = E0.extend({ description: N().optional(), messages: n(RD) });
    ED = s0.extend({ method: _("notifications/prompts/list_changed"), params: a0.optional() });
    PD = b({ title: N().optional(), readOnlyHint: M0().optional(), destructiveHint: M0().optional(), idempotentHint: M0().optional(), openWorldHint: M0().optional() });
    bD = b({ taskSupport: y0(["required", "optional", "forbidden"]).optional() });
    bW = b({ ...L4.shape, ...K9.shape, description: N().optional(), inputSchema: b({ type: _("object"), properties: K0(N(), R0).optional(), required: n(N()).optional() }).catchall(z0()), outputSchema: b({ type: _("object"), properties: K0(N(), R0).optional(), required: n(N()).optional() }).catchall(z0()).optional(), annotations: PD.optional(), execution: bD.optional(), _meta: K0(N(), z0()).optional() });
    n8 = V9.extend({ method: _("tools/list") });
    ZD = q9.extend({ tools: n(bW) });
    o8 = E0.extend({ content: n(SY).default([]), structuredContent: K0(N(), z0()).optional(), isError: M0().optional() });
    vk = o8.or(E0.extend({ toolResult: z0() }));
    CD = B9.extend({ name: N(), arguments: K0(N(), z0()).optional() });
    O4 = I0.extend({ method: _("tools/call"), params: CD });
    SD = s0.extend({ method: _("notifications/tools/list_changed"), params: a0.optional() });
    Tk = b({ autoRefresh: M0().default(true), debounceMs: s().int().nonnegative().default(300) });
    N9 = y0(["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]);
    _D = p0.extend({ level: N9 });
    _Y = I0.extend({ method: _("logging/setLevel"), params: _D });
    kD = a0.extend({ level: N9, logger: N().optional(), data: z0() });
    vD = s0.extend({ method: _("notifications/message"), params: kD });
    TD = b({ name: N().optional() });
    xD = b({ hints: n(TD).optional(), costPriority: s().min(0).max(1).optional(), speedPriority: s().min(0).max(1).optional(), intelligencePriority: s().min(0).max(1).optional() });
    yD = b({ mode: y0(["auto", "required", "none"]).optional() });
    gD = b({ type: _("tool_result"), toolUseId: N().describe("The unique identifier for the corresponding tool call."), content: n(SY).default([]), structuredContent: b({}).loose().optional(), isError: M0().optional(), _meta: K0(N(), z0()).optional() });
    hD = NY("type", [bY, ZY, CY]);
    C8 = NY("type", [bY, ZY, CY, MD, gD]);
    fD = b({ role: F9, content: G0([C8, n(C8)]), _meta: K0(N(), z0()).optional() });
    uD = B9.extend({ messages: n(fD), modelPreferences: xD.optional(), systemPrompt: N().optional(), includeContext: y0(["none", "thisServer", "allServers"]).optional(), temperature: s().optional(), maxTokens: s().int(), stopSequences: n(N()).optional(), metadata: R0.optional(), tools: n(bW).optional(), toolChoice: yD.optional() });
    mD = I0.extend({ method: _("sampling/createMessage"), params: uD });
    O9 = E0.extend({ model: N(), stopReason: L0(y0(["endTurn", "stopSequence", "maxTokens"]).or(N())), role: F9, content: hD });
    kY = E0.extend({ model: N(), stopReason: L0(y0(["endTurn", "stopSequence", "maxTokens", "toolUse"]).or(N())), role: F9, content: G0([C8, n(C8)]) });
    lD = b({ type: _("boolean"), title: N().optional(), description: N().optional(), default: M0().optional() });
    cD = b({ type: _("string"), title: N().optional(), description: N().optional(), minLength: s().optional(), maxLength: s().optional(), format: y0(["email", "uri", "date", "date-time"]).optional(), default: N().optional() });
    pD = b({ type: y0(["number", "integer"]), title: N().optional(), description: N().optional(), minimum: s().optional(), maximum: s().optional(), default: s().optional() });
    dD = b({ type: _("string"), title: N().optional(), description: N().optional(), enum: n(N()), default: N().optional() });
    iD = b({ type: _("string"), title: N().optional(), description: N().optional(), oneOf: n(b({ const: N(), title: N() })), default: N().optional() });
    nD = b({ type: _("string"), title: N().optional(), description: N().optional(), enum: n(N()), enumNames: n(N()).optional(), default: N().optional() });
    oD = G0([dD, iD]);
    rD = b({ type: _("array"), title: N().optional(), description: N().optional(), minItems: s().optional(), maxItems: s().optional(), items: b({ type: _("string"), enum: n(N()) }), default: n(N()).optional() });
    tD = b({ type: _("array"), title: N().optional(), description: N().optional(), minItems: s().optional(), maxItems: s().optional(), items: b({ anyOf: n(b({ const: N(), title: N() })) }), default: n(N()).optional() });
    aD = G0([rD, tD]);
    sD = G0([nD, oD, aD]);
    eD = G0([sD, lD, cD, pD]);
    Qw = B9.extend({ mode: _("form").optional(), message: N(), requestedSchema: b({ type: _("object"), properties: K0(N(), eD), required: n(N()).optional() }) });
    $w = B9.extend({ mode: _("url"), message: N(), elicitationId: N(), url: N().url() });
    Xw = G0([Qw, $w]);
    Yw = I0.extend({ method: _("elicitation/create"), params: Xw });
    Jw = a0.extend({ elicitationId: N() });
    Gw = s0.extend({ method: _("notifications/elicitation/complete"), params: Jw });
    D4 = E0.extend({ action: y0(["accept", "decline", "cancel"]), content: OY((Q) => Q === null ? void 0 : Q, K0(N(), G0([N(), s(), M0(), n(N())])).optional()) });
    Ww = b({ type: _("ref/resource"), uri: N() });
    Hw = b({ type: _("ref/prompt"), name: N() });
    Bw = p0.extend({ ref: G0([Hw, Ww]), argument: b({ name: N(), value: N() }), context: b({ arguments: K0(N(), N()).optional() }).optional() });
    r8 = I0.extend({ method: _("completion/complete"), params: Bw });
    zw = E0.extend({ completion: S0({ values: n(N()).max(100), total: L0(s().int()), hasMore: L0(M0()) }) });
    Kw = b({ uri: N().startsWith("file://"), name: N().optional(), _meta: K0(N(), z0()).optional() });
    Vw = I0.extend({ method: _("roots/list"), params: p0.optional() });
    vY = E0.extend({ roots: n(Kw) });
    qw = s0.extend({ method: _("notifications/roots/list_changed"), params: a0.optional() });
    xk = G0([T8, RY, r8, _Y, i8, d8, l8, c8, p8, VD, UD, O4, n8, y8, h8, f8, m8]);
    yk = G0([v8, x8, IY, qw, L9]);
    gk = G0([k8, O9, kY, D4, vY, g8, u8, F4]);
    hk = G0([T8, mD, Yw, Vw, y8, h8, f8, m8]);
    fk = G0([v8, x8, vD, FD, zD, SD, ED, L9, Gw]);
    uk = G0([k8, sO, zw, ID, DD, GD, WD, BD, o8, ZD, g8, u8, F4]);
    S = class _S extends Error {
      constructor(Q, $, X) {
        super(`MCP error ${Q}: ${$}`);
        this.code = Q, this.data = X, this.name = "McpError";
      }
      static fromError(Q, $, X) {
        if (Q === T.UrlElicitationRequired && X) {
          let Y = X;
          if (Y.elicitations) return new SW(Y.elicitations, $);
        }
        return new _S(Q, $, X);
      }
    };
    SW = class extends S {
      constructor(Q, $ = `URL elicitation${Q.length > 1 ? "s" : ""} required`) {
        super(T.UrlElicitationRequired, $, { elicitations: Q });
      }
      get elicitations() {
        return this.data?.elicitations ?? [];
      }
    };
    kW = Symbol("Let zodToJsonSchema decide on which parser to use");
    _W = { name: void 0, $refStrategy: "root", basePath: ["#"], effectStrategy: "input", pipeStrategy: "all", dateStrategy: "format:date-time", mapStrategy: "entries", removeAdditionalStrategy: "passthrough", allowedAdditionalProperties: true, rejectedAdditionalProperties: false, definitionPath: "definitions", target: "jsonSchema7", strictUnions: false, definitions: {}, errorMessages: false, markdownDescription: false, patternStrategy: "escape", applyRegexFlags: false, emailStrategy: "format:email", base64Strategy: "contentEncoding:base64", nameStrategy: "ref", openAiAnyTypeName: "OpenAiAnyType" };
    vW = (Q) => typeof Q === "string" ? { ..._W, name: Q } : { ..._W, ...Q };
    TW = (Q) => {
      let $ = vW(Q), X = $.name !== void 0 ? [...$.basePath, $.definitionPath, $.name] : $.basePath;
      return { ...$, flags: { hasReferencedOpenAiAnyType: false }, currentPath: X, propertyPath: void 0, seen: new Map(Object.entries($.definitions).map(([Y, J]) => [J._def, { def: J._def, path: [...$.basePath, $.definitionPath, Y], jsonSchema: void 0 }])) };
    };
    t8 = (Q, $) => {
      let X = 0;
      for (; X < Q.length && X < $.length; X++) if (Q[X] !== $[X]) break;
      return [(Q.length - X).toString(), ...$.slice(X)].join("/");
    };
    hW = (Q, $) => {
      return g(Q.innerType._def, $);
    };
    Uw = (Q, $) => {
      let X = { type: "integer", format: "unix-time" };
      if ($.target === "openApi3") return X;
      for (let Y of Q.checks) switch (Y.kind) {
        case "min":
          o(X, "minimum", Y.value, Y.message, $);
          break;
        case "max":
          o(X, "maximum", Y.value, Y.message, $);
          break;
      }
      return X;
    };
    Lw = (Q) => {
      if ("type" in Q && Q.type === "string") return false;
      return "allOf" in Q;
    };
    yY = void 0;
    H1 = { cuid: /^[cC][^\s-]{8,}$/, cuid2: /^[0-9a-z]+$/, ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/, email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/, emoji: () => {
      if (yY === void 0) yY = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
      return yY;
    }, uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/, ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/, ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/, ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/, nanoid: /^[a-zA-Z0-9_-]{21}$/, jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/ };
    Fw = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
    D9 = { ZodString: "string", ZodNumber: "number", ZodBigInt: "integer", ZodBoolean: "boolean", ZodNull: "null" };
    rW = (Q, $) => {
      let X = (Q.options instanceof Map ? Array.from(Q.options.values()) : Q.options).map((Y, J) => g(Y._def, { ...$, currentPath: [...$.currentPath, "anyOf", `${J}`] })).filter((Y) => !!Y && (!$.strictUnions || typeof Y === "object" && Object.keys(Y).length > 0));
      return X.length ? { anyOf: X } : void 0;
    };
    Q3 = (Q, $) => {
      if ($.currentPath.toString() === $.propertyPath?.toString()) return g(Q.innerType._def, $);
      let X = g(Q.innerType._def, { ...$, currentPath: [...$.currentPath, "anyOf", "1"] });
      return X ? { anyOf: [{ not: V0($) }, X] } : V0($);
    };
    $3 = (Q, $) => {
      if ($.pipeStrategy === "input") return g(Q.in._def, $);
      else if ($.pipeStrategy === "output") return g(Q.out._def, $);
      let X = g(Q.in._def, { ...$, currentPath: [...$.currentPath, "allOf", "0"] }), Y = g(Q.out._def, { ...$, currentPath: [...$.currentPath, "allOf", X ? "1" : "0"] });
      return { allOf: [X, Y].filter((J) => J !== void 0) };
    };
    H3 = (Q, $) => {
      return g(Q.innerType._def, $);
    };
    B3 = (Q, $, X) => {
      switch ($) {
        case j.ZodString:
          return s8(Q, X);
        case j.ZodNumber:
          return sW(Q, X);
        case j.ZodObject:
          return eW(Q, X);
        case j.ZodBigInt:
          return yW(Q, X);
        case j.ZodBoolean:
          return gW();
        case j.ZodDate:
          return xY(Q, X);
        case j.ZodUndefined:
          return G3(X);
        case j.ZodNull:
          return oW(X);
        case j.ZodArray:
          return xW(Q, X);
        case j.ZodUnion:
        case j.ZodDiscriminatedUnion:
          return tW(Q, X);
        case j.ZodIntersection:
          return lW(Q, X);
        case j.ZodTuple:
          return J3(Q, X);
        case j.ZodRecord:
          return e8(Q, X);
        case j.ZodLiteral:
          return cW(Q, X);
        case j.ZodEnum:
          return mW(Q);
        case j.ZodNativeEnum:
          return iW(Q);
        case j.ZodNullable:
          return aW(Q, X);
        case j.ZodOptional:
          return Q3(Q, X);
        case j.ZodMap:
          return dW(Q, X);
        case j.ZodSet:
          return Y3(Q, X);
        case j.ZodLazy:
          return () => Q.getter()._def;
        case j.ZodPromise:
          return X3(Q, X);
        case j.ZodNaN:
        case j.ZodNever:
          return nW(X);
        case j.ZodEffects:
          return uW(Q, X);
        case j.ZodAny:
          return V0(X);
        case j.ZodUnknown:
          return W3(X);
        case j.ZodDefault:
          return fW(Q, X);
        case j.ZodBranded:
          return a8(Q, X);
        case j.ZodReadonly:
          return H3(Q, X);
        case j.ZodCatch:
          return hW(Q, X);
        case j.ZodPipeline:
          return $3(Q, X);
        case j.ZodFunction:
        case j.ZodVoid:
        case j.ZodSymbol:
          return;
        default:
          return /* @__PURE__ */ ((Y) => {
            return;
          })($);
      }
    };
    ww = (Q, $) => {
      switch ($.$refStrategy) {
        case "root":
          return { $ref: Q.path.join("/") };
        case "relative":
          return { $ref: t8($.currentPath, Q.path) };
        case "none":
        case "seen": {
          if (Q.path.length < $.currentPath.length && Q.path.every((X, Y) => $.currentPath[Y] === X)) return console.warn(`Recursive reference detected at ${$.currentPath.join("/")}! Defaulting to any`), V0($);
          return $.$refStrategy === "seen" ? V0($) : void 0;
        }
      }
    };
    Mw = (Q, $, X) => {
      if (Q.description) {
        if (X.description = Q.description, $.markdownDescription) X.markdownDescription = Q.description;
      }
      return X;
    };
    hY = (Q, $) => {
      let X = TW($), Y = typeof $ === "object" && $.definitions ? Object.entries($.definitions).reduce((B, [z, K]) => ({ ...B, [z]: g(K._def, { ...X, currentPath: [...X.basePath, X.definitionPath, z] }, true) ?? V0(X) }), {}) : void 0, J = typeof $ === "string" ? $ : $?.nameStrategy === "title" ? void 0 : $?.name, G = g(Q._def, J === void 0 ? X : { ...X, currentPath: [...X.basePath, X.definitionPath, J] }, false) ?? V0(X), W = typeof $ === "object" && $.name !== void 0 && $.nameStrategy === "title" ? $.name : void 0;
      if (W !== void 0) G.title = W;
      if (X.flags.hasReferencedOpenAiAnyType) {
        if (!Y) Y = {};
        if (!Y[X.openAiAnyTypeName]) Y[X.openAiAnyTypeName] = { type: ["string", "number", "integer", "boolean", "array", "null"], items: { $ref: X.$refStrategy === "relative" ? "1" : [...X.basePath, X.definitionPath, X.openAiAnyTypeName].join("/") } };
      }
      let H = J === void 0 ? Y ? { ...G, [X.definitionPath]: Y } : G : { $ref: [...X.$refStrategy === "relative" ? [] : X.basePath, X.definitionPath, J].join("/"), [X.definitionPath]: { ...Y, [J]: G } };
      if (X.target === "jsonSchema7") H.$schema = "http://json-schema.org/draft-07/schema#";
      else if (X.target === "jsonSchema2019-09" || X.target === "openAi") H.$schema = "https://json-schema.org/draft/2019-09/schema#";
      if (X.target === "openAi" && ("anyOf" in H || "oneOf" in H || "allOf" in H || "type" in H && Array.isArray(H.type))) console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
      return H;
    };
    jw = 6e4;
    lY = class {
      constructor(Q) {
        if (this._options = Q, this._requestMessageId = 0, this._requestHandlers = /* @__PURE__ */ new Map(), this._requestHandlerAbortControllers = /* @__PURE__ */ new Map(), this._notificationHandlers = /* @__PURE__ */ new Map(), this._responseHandlers = /* @__PURE__ */ new Map(), this._progressHandlers = /* @__PURE__ */ new Map(), this._timeoutInfo = /* @__PURE__ */ new Map(), this._pendingDebouncedNotifications = /* @__PURE__ */ new Set(), this._taskProgressTokens = /* @__PURE__ */ new Map(), this._requestResolvers = /* @__PURE__ */ new Map(), this.setNotificationHandler(v8, ($) => {
          this._oncancel($);
        }), this.setNotificationHandler(x8, ($) => {
          this._onprogress($);
        }), this.setRequestHandler(T8, ($) => ({})), this._taskStore = Q?.taskStore, this._taskMessageQueue = Q?.taskMessageQueue, this._taskStore) this.setRequestHandler(y8, async ($, X) => {
          let Y = await this._taskStore.getTask($.params.taskId, X.sessionId);
          if (!Y) throw new S(T.InvalidParams, "Failed to retrieve task: Task not found");
          return { ...Y };
        }), this.setRequestHandler(h8, async ($, X) => {
          let Y = async () => {
            let J = $.params.taskId;
            if (this._taskMessageQueue) {
              let W;
              while (W = await this._taskMessageQueue.dequeue(J, X.sessionId)) {
                if (W.type === "response" || W.type === "error") {
                  let H = W.message, B = H.id, z = this._requestResolvers.get(B);
                  if (z) if (this._requestResolvers.delete(B), W.type === "response") z(H);
                  else {
                    let K = H, U = new S(K.error.code, K.error.message, K.error.data);
                    z(U);
                  }
                  else {
                    let K = W.type === "response" ? "Response" : "Error";
                    this._onerror(Error(`${K} handler missing for request ${B}`));
                  }
                  continue;
                }
                await this._transport?.send(W.message, { relatedRequestId: X.requestId });
              }
            }
            let G = await this._taskStore.getTask(J, X.sessionId);
            if (!G) throw new S(T.InvalidParams, `Task not found: ${J}`);
            if (!e1(G.status)) return await this._waitForTaskUpdate(J, X.signal), await Y();
            if (e1(G.status)) {
              let W = await this._taskStore.getTaskResult(J, X.sessionId);
              return this._clearTaskQueue(J), { ...W, _meta: { ...W._meta, [s1]: { taskId: J } } };
            }
            return await Y();
          };
          return await Y();
        }), this.setRequestHandler(f8, async ($, X) => {
          try {
            let { tasks: Y, nextCursor: J } = await this._taskStore.listTasks($.params?.cursor, X.sessionId);
            return { tasks: Y, nextCursor: J, _meta: {} };
          } catch (Y) {
            throw new S(T.InvalidParams, `Failed to list tasks: ${Y instanceof Error ? Y.message : String(Y)}`);
          }
        }), this.setRequestHandler(m8, async ($, X) => {
          try {
            let Y = await this._taskStore.getTask($.params.taskId, X.sessionId);
            if (!Y) throw new S(T.InvalidParams, `Task not found: ${$.params.taskId}`);
            if (e1(Y.status)) throw new S(T.InvalidParams, `Cannot cancel task in terminal status: ${Y.status}`);
            await this._taskStore.updateTaskStatus($.params.taskId, "cancelled", "Client cancelled task execution.", X.sessionId), this._clearTaskQueue($.params.taskId);
            let J = await this._taskStore.getTask($.params.taskId, X.sessionId);
            if (!J) throw new S(T.InvalidParams, `Task not found after cancellation: ${$.params.taskId}`);
            return { _meta: {}, ...J };
          } catch (Y) {
            if (Y instanceof S) throw Y;
            throw new S(T.InvalidRequest, `Failed to cancel task: ${Y instanceof Error ? Y.message : String(Y)}`);
          }
        });
      }
      async _oncancel(Q) {
        if (!Q.params.requestId) return;
        this._requestHandlerAbortControllers.get(Q.params.requestId)?.abort(Q.params.reason);
      }
      _setupTimeout(Q, $, X, Y, J = false) {
        this._timeoutInfo.set(Q, { timeoutId: setTimeout(Y, $), startTime: Date.now(), timeout: $, maxTotalTimeout: X, resetTimeoutOnProgress: J, onTimeout: Y });
      }
      _resetTimeout(Q) {
        let $ = this._timeoutInfo.get(Q);
        if (!$) return false;
        let X = Date.now() - $.startTime;
        if ($.maxTotalTimeout && X >= $.maxTotalTimeout) throw this._timeoutInfo.delete(Q), S.fromError(T.RequestTimeout, "Maximum total timeout exceeded", { maxTotalTimeout: $.maxTotalTimeout, totalElapsed: X });
        return clearTimeout($.timeoutId), $.timeoutId = setTimeout($.onTimeout, $.timeout), true;
      }
      _cleanupTimeout(Q) {
        let $ = this._timeoutInfo.get(Q);
        if ($) clearTimeout($.timeoutId), this._timeoutInfo.delete(Q);
      }
      async connect(Q) {
        if (this._transport) throw Error("Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.");
        this._transport = Q;
        let $ = this.transport?.onclose;
        this._transport.onclose = () => {
          $?.(), this._onclose();
        };
        let X = this.transport?.onerror;
        this._transport.onerror = (J) => {
          X?.(J), this._onerror(J);
        };
        let Y = this._transport?.onmessage;
        this._transport.onmessage = (J, G) => {
          if (Y?.(J, G), z9(J) || MW(J)) this._onresponse(J);
          else if (MY(J)) this._onrequest(J, G);
          else if (wW(J)) this._onnotification(J);
          else this._onerror(Error(`Unknown message type: ${JSON.stringify(J)}`));
        }, await this._transport.start();
      }
      _onclose() {
        let Q = this._responseHandlers;
        this._responseHandlers = /* @__PURE__ */ new Map(), this._progressHandlers.clear(), this._taskProgressTokens.clear(), this._pendingDebouncedNotifications.clear();
        for (let X of this._requestHandlerAbortControllers.values()) X.abort();
        this._requestHandlerAbortControllers.clear();
        let $ = S.fromError(T.ConnectionClosed, "Connection closed");
        this._transport = void 0, this.onclose?.();
        for (let X of Q.values()) X($);
      }
      _onerror(Q) {
        this.onerror?.(Q);
      }
      _onnotification(Q) {
        let $ = this._notificationHandlers.get(Q.method) ?? this.fallbackNotificationHandler;
        if ($ === void 0) return;
        Promise.resolve().then(() => $(Q)).catch((X) => this._onerror(Error(`Uncaught error in notification handler: ${X}`)));
      }
      _onrequest(Q, $) {
        let X = this._requestHandlers.get(Q.method) ?? this.fallbackRequestHandler, Y = this._transport, J = Q.params?._meta?.[s1]?.taskId;
        if (X === void 0) {
          let z = { jsonrpc: "2.0", id: Q.id, error: { code: T.MethodNotFound, message: "Method not found" } };
          if (J && this._taskMessageQueue) this._enqueueTaskMessage(J, { type: "error", message: z, timestamp: Date.now() }, Y?.sessionId).catch((K) => this._onerror(Error(`Failed to enqueue error response: ${K}`)));
          else Y?.send(z).catch((K) => this._onerror(Error(`Failed to send an error response: ${K}`)));
          return;
        }
        let G = new AbortController();
        this._requestHandlerAbortControllers.set(Q.id, G);
        let W = NW(Q.params) ? Q.params.task : void 0, H = this._taskStore ? this.requestTaskStore(Q, Y?.sessionId) : void 0, B = { signal: G.signal, sessionId: Y?.sessionId, _meta: Q.params?._meta, sendNotification: async (z) => {
          if (G.signal.aborted) return;
          let K = { relatedRequestId: Q.id };
          if (J) K.relatedTask = { taskId: J };
          await this.notification(z, K);
        }, sendRequest: async (z, K, U) => {
          if (G.signal.aborted) throw new S(T.ConnectionClosed, "Request was cancelled");
          let q = { ...U, relatedRequestId: Q.id };
          if (J && !q.relatedTask) q.relatedTask = { taskId: J };
          let V = q.relatedTask?.taskId ?? J;
          if (V && H) await H.updateTaskStatus(V, "input_required");
          return await this.request(z, K, q);
        }, authInfo: $?.authInfo, requestId: Q.id, requestInfo: $?.requestInfo, taskId: J, taskStore: H, taskRequestedTtl: W?.ttl, closeSSEStream: $?.closeSSEStream, closeStandaloneSSEStream: $?.closeStandaloneSSEStream };
        Promise.resolve().then(() => {
          if (W) this.assertTaskHandlerCapability(Q.method);
        }).then(() => X(Q, B)).then(async (z) => {
          if (G.signal.aborted) return;
          let K = { result: z, jsonrpc: "2.0", id: Q.id };
          if (J && this._taskMessageQueue) await this._enqueueTaskMessage(J, { type: "response", message: K, timestamp: Date.now() }, Y?.sessionId);
          else await Y?.send(K);
        }, async (z) => {
          if (G.signal.aborted) return;
          let K = { jsonrpc: "2.0", id: Q.id, error: { code: Number.isSafeInteger(z.code) ? z.code : T.InternalError, message: z.message ?? "Internal error", ...z.data !== void 0 && { data: z.data } } };
          if (J && this._taskMessageQueue) await this._enqueueTaskMessage(J, { type: "error", message: K, timestamp: Date.now() }, Y?.sessionId);
          else await Y?.send(K);
        }).catch((z) => this._onerror(Error(`Failed to send response: ${z}`))).finally(() => {
          this._requestHandlerAbortControllers.delete(Q.id);
        });
      }
      _onprogress(Q) {
        let { progressToken: $, ...X } = Q.params, Y = Number($), J = this._progressHandlers.get(Y);
        if (!J) {
          this._onerror(Error(`Received a progress notification for an unknown token: ${JSON.stringify(Q)}`));
          return;
        }
        let G = this._responseHandlers.get(Y), W = this._timeoutInfo.get(Y);
        if (W && G && W.resetTimeoutOnProgress) try {
          this._resetTimeout(Y);
        } catch (H) {
          this._responseHandlers.delete(Y), this._progressHandlers.delete(Y), this._cleanupTimeout(Y), G(H);
          return;
        }
        J(X);
      }
      _onresponse(Q) {
        let $ = Number(Q.id), X = this._requestResolvers.get($);
        if (X) {
          if (this._requestResolvers.delete($), z9(Q)) X(Q);
          else {
            let G = new S(Q.error.code, Q.error.message, Q.error.data);
            X(G);
          }
          return;
        }
        let Y = this._responseHandlers.get($);
        if (Y === void 0) {
          this._onerror(Error(`Received a response for an unknown message ID: ${JSON.stringify(Q)}`));
          return;
        }
        this._responseHandlers.delete($), this._cleanupTimeout($);
        let J = false;
        if (z9(Q) && Q.result && typeof Q.result === "object") {
          let G = Q.result;
          if (G.task && typeof G.task === "object") {
            let W = G.task;
            if (typeof W.taskId === "string") J = true, this._taskProgressTokens.set(W.taskId, $);
          }
        }
        if (!J) this._progressHandlers.delete($);
        if (z9(Q)) Y(Q);
        else {
          let G = S.fromError(Q.error.code, Q.error.message, Q.error.data);
          Y(G);
        }
      }
      get transport() {
        return this._transport;
      }
      async close() {
        await this._transport?.close();
      }
      async *requestStream(Q, $, X) {
        let { task: Y } = X ?? {};
        if (!Y) {
          try {
            yield { type: "result", result: await this.request(Q, $, X) };
          } catch (G) {
            yield { type: "error", error: G instanceof S ? G : new S(T.InternalError, String(G)) };
          }
          return;
        }
        let J;
        try {
          let G = await this.request(Q, F4, X);
          if (G.task) J = G.task.taskId, yield { type: "taskCreated", task: G.task };
          else throw new S(T.InternalError, "Task creation did not return a task");
          while (true) {
            let W = await this.getTask({ taskId: J }, X);
            if (yield { type: "taskStatus", task: W }, e1(W.status)) {
              if (W.status === "completed") yield { type: "result", result: await this.getTaskResult({ taskId: J }, $, X) };
              else if (W.status === "failed") yield { type: "error", error: new S(T.InternalError, `Task ${J} failed`) };
              else if (W.status === "cancelled") yield { type: "error", error: new S(T.InternalError, `Task ${J} was cancelled`) };
              return;
            }
            if (W.status === "input_required") {
              yield { type: "result", result: await this.getTaskResult({ taskId: J }, $, X) };
              return;
            }
            let H = W.pollInterval ?? this._options?.defaultTaskPollInterval ?? 1e3;
            await new Promise((B) => setTimeout(B, H)), X?.signal?.throwIfAborted();
          }
        } catch (G) {
          yield { type: "error", error: G instanceof S ? G : new S(T.InternalError, String(G)) };
        }
      }
      request(Q, $, X) {
        let { relatedRequestId: Y, resumptionToken: J, onresumptiontoken: G, task: W, relatedTask: H } = X ?? {};
        return new Promise((B, z) => {
          let K = (D) => {
            z(D);
          };
          if (!this._transport) {
            K(Error("Not connected"));
            return;
          }
          if (this._options?.enforceStrictCapabilities === true) try {
            if (this.assertCapabilityForMethod(Q.method), W) this.assertTaskCapability(Q.method);
          } catch (D) {
            K(D);
            return;
          }
          X?.signal?.throwIfAborted();
          let U = this._requestMessageId++, q = { ...Q, jsonrpc: "2.0", id: U };
          if (X?.onprogress) this._progressHandlers.set(U, X.onprogress), q.params = { ...Q.params, _meta: { ...Q.params?._meta || {}, progressToken: U } };
          if (W) q.params = { ...q.params, task: W };
          if (H) q.params = { ...q.params, _meta: { ...q.params?._meta || {}, [s1]: H } };
          let V = (D) => {
            this._responseHandlers.delete(U), this._progressHandlers.delete(U), this._cleanupTimeout(U), this._transport?.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: U, reason: String(D) } }, { relatedRequestId: Y, resumptionToken: J, onresumptiontoken: G }).catch((R) => this._onerror(Error(`Failed to send cancellation: ${R}`)));
            let M = D instanceof S ? D : new S(T.RequestTimeout, String(D));
            z(M);
          };
          this._responseHandlers.set(U, (D) => {
            if (X?.signal?.aborted) return;
            if (D instanceof Error) return z(D);
            try {
              let M = t1($, D.result);
              if (!M.success) z(M.error);
              else B(M.data);
            } catch (M) {
              z(M);
            }
          }), X?.signal?.addEventListener("abort", () => {
            V(X?.signal?.reason);
          });
          let L = X?.timeout ?? jw, F = () => V(S.fromError(T.RequestTimeout, "Request timed out", { timeout: L }));
          this._setupTimeout(U, L, X?.maxTotalTimeout, F, X?.resetTimeoutOnProgress ?? false);
          let w = H?.taskId;
          if (w) {
            let D = (M) => {
              let R = this._responseHandlers.get(U);
              if (R) R(M);
              else this._onerror(Error(`Response handler missing for side-channeled request ${U}`));
            };
            this._requestResolvers.set(U, D), this._enqueueTaskMessage(w, { type: "request", message: q, timestamp: Date.now() }).catch((M) => {
              this._cleanupTimeout(U), z(M);
            });
          } else this._transport.send(q, { relatedRequestId: Y, resumptionToken: J, onresumptiontoken: G }).catch((D) => {
            this._cleanupTimeout(U), z(D);
          });
        });
      }
      async getTask(Q, $) {
        return this.request({ method: "tasks/get", params: Q }, g8, $);
      }
      async getTaskResult(Q, $, X) {
        return this.request({ method: "tasks/result", params: Q }, $, X);
      }
      async listTasks(Q, $) {
        return this.request({ method: "tasks/list", params: Q }, u8, $);
      }
      async cancelTask(Q, $) {
        return this.request({ method: "tasks/cancel", params: Q }, jW, $);
      }
      async notification(Q, $) {
        if (!this._transport) throw Error("Not connected");
        this.assertNotificationCapability(Q.method);
        let X = $?.relatedTask?.taskId;
        if (X) {
          let W = { ...Q, jsonrpc: "2.0", params: { ...Q.params, _meta: { ...Q.params?._meta || {}, [s1]: $.relatedTask } } };
          await this._enqueueTaskMessage(X, { type: "notification", message: W, timestamp: Date.now() });
          return;
        }
        if ((this._options?.debouncedNotificationMethods ?? []).includes(Q.method) && !Q.params && !$?.relatedRequestId && !$?.relatedTask) {
          if (this._pendingDebouncedNotifications.has(Q.method)) return;
          this._pendingDebouncedNotifications.add(Q.method), Promise.resolve().then(() => {
            if (this._pendingDebouncedNotifications.delete(Q.method), !this._transport) return;
            let W = { ...Q, jsonrpc: "2.0" };
            if ($?.relatedTask) W = { ...W, params: { ...W.params, _meta: { ...W.params?._meta || {}, [s1]: $.relatedTask } } };
            this._transport?.send(W, $).catch((H) => this._onerror(H));
          });
          return;
        }
        let G = { ...Q, jsonrpc: "2.0" };
        if ($?.relatedTask) G = { ...G, params: { ...G.params, _meta: { ...G.params?._meta || {}, [s1]: $.relatedTask } } };
        await this._transport.send(G, $);
      }
      setRequestHandler(Q, $) {
        let X = uY(Q);
        this.assertRequestHandlerCapability(X), this._requestHandlers.set(X, (Y, J) => {
          let G = mY(Q, Y);
          return Promise.resolve($(G, J));
        });
      }
      removeRequestHandler(Q) {
        this._requestHandlers.delete(Q);
      }
      assertCanSetRequestHandler(Q) {
        if (this._requestHandlers.has(Q)) throw Error(`A request handler for ${Q} already exists, which would be overridden`);
      }
      setNotificationHandler(Q, $) {
        let X = uY(Q);
        this._notificationHandlers.set(X, (Y) => {
          let J = mY(Q, Y);
          return Promise.resolve($(J));
        });
      }
      removeNotificationHandler(Q) {
        this._notificationHandlers.delete(Q);
      }
      _cleanupTaskProgressHandler(Q) {
        let $ = this._taskProgressTokens.get(Q);
        if ($ !== void 0) this._progressHandlers.delete($), this._taskProgressTokens.delete(Q);
      }
      async _enqueueTaskMessage(Q, $, X) {
        if (!this._taskStore || !this._taskMessageQueue) throw Error("Cannot enqueue task message: taskStore and taskMessageQueue are not configured");
        let Y = this._options?.maxTaskQueueSize;
        await this._taskMessageQueue.enqueue(Q, $, X, Y);
      }
      async _clearTaskQueue(Q, $) {
        if (this._taskMessageQueue) {
          let X = await this._taskMessageQueue.dequeueAll(Q, $);
          for (let Y of X) if (Y.type === "request" && MY(Y.message)) {
            let J = Y.message.id, G = this._requestResolvers.get(J);
            if (G) G(new S(T.InternalError, "Task cancelled or completed")), this._requestResolvers.delete(J);
            else this._onerror(Error(`Resolver missing for request ${J} during task ${Q} cleanup`));
          }
        }
      }
      async _waitForTaskUpdate(Q, $) {
        let X = this._options?.defaultTaskPollInterval ?? 1e3;
        try {
          let Y = await this._taskStore?.getTask(Q);
          if (Y?.pollInterval) X = Y.pollInterval;
        } catch {
        }
        return new Promise((Y, J) => {
          if ($.aborted) {
            J(new S(T.InvalidRequest, "Request cancelled"));
            return;
          }
          let G = setTimeout(Y, X);
          $.addEventListener("abort", () => {
            clearTimeout(G), J(new S(T.InvalidRequest, "Request cancelled"));
          }, { once: true });
        });
      }
      requestTaskStore(Q, $) {
        let X = this._taskStore;
        if (!X) throw Error("No task store configured");
        return { createTask: async (Y) => {
          if (!Q) throw Error("No request provided");
          return await X.createTask(Y, Q.id, { method: Q.method, params: Q.params }, $);
        }, getTask: async (Y) => {
          let J = await X.getTask(Y, $);
          if (!J) throw new S(T.InvalidParams, "Failed to retrieve task: Task not found");
          return J;
        }, storeTaskResult: async (Y, J, G) => {
          await X.storeTaskResult(Y, J, G, $);
          let W = await X.getTask(Y, $);
          if (W) {
            let H = L9.parse({ method: "notifications/tasks/status", params: W });
            if (await this.notification(H), e1(W.status)) this._cleanupTaskProgressHandler(Y);
          }
        }, getTaskResult: (Y) => {
          return X.getTaskResult(Y, $);
        }, updateTaskStatus: async (Y, J, G) => {
          let W = await X.getTask(Y, $);
          if (!W) throw new S(T.InvalidParams, `Task "${Y}" not found - it may have been cleaned up`);
          if (e1(W.status)) throw new S(T.InvalidParams, `Cannot update task "${Y}" from terminal status "${W.status}" to "${J}". Terminal states (completed, failed, cancelled) cannot transition to other states.`);
          await X.updateTaskStatus(Y, J, G, $);
          let H = await X.getTask(Y, $);
          if (H) {
            let B = L9.parse({ method: "notifications/tasks/status", params: H });
            if (await this.notification(B), e1(H.status)) this._cleanupTaskProgressHandler(Y);
          }
        }, listTasks: (Y) => {
          return X.listTasks(Y, $);
        } };
      }
    };
    nK = G5(x7(), 1);
    oK = G5(iK(), 1);
    d7 = class {
      constructor(Q) {
        this._ajv = Q ?? SP();
      }
      getValidator(Q) {
        let $ = "$id" in Q && typeof Q.$id === "string" ? this._ajv.getSchema(Q.$id) ?? this._ajv.compile(Q) : this._ajv.compile(Q);
        return (X) => {
          if ($(X)) return { valid: true, data: X, errorMessage: void 0 };
          else return { valid: false, data: void 0, errorMessage: this._ajv.errorsText($.errors) };
        };
      }
    };
    i7 = class {
      constructor(Q) {
        this._server = Q;
      }
      requestStream(Q, $, X) {
        return this._server.requestStream(Q, $, X);
      }
      createMessageStream(Q, $) {
        let X = this._server.getClientCapabilities();
        if ((Q.tools || Q.toolChoice) && !X?.sampling?.tools) throw Error("Client does not support sampling tools capability.");
        if (Q.messages.length > 0) {
          let Y = Q.messages[Q.messages.length - 1], J = Array.isArray(Y.content) ? Y.content : [Y.content], G = J.some((z) => z.type === "tool_result"), W = Q.messages.length > 1 ? Q.messages[Q.messages.length - 2] : void 0, H = W ? Array.isArray(W.content) ? W.content : [W.content] : [], B = H.some((z) => z.type === "tool_use");
          if (G) {
            if (J.some((z) => z.type !== "tool_result")) throw Error("The last message must contain only tool_result content if any is present");
            if (!B) throw Error("tool_result blocks are not matching any tool_use from the previous message");
          }
          if (B) {
            let z = new Set(H.filter((U) => U.type === "tool_use").map((U) => U.id)), K = new Set(J.filter((U) => U.type === "tool_result").map((U) => U.toolUseId));
            if (z.size !== K.size || ![...z].every((U) => K.has(U))) throw Error("ids of tool_result blocks and tool_use blocks from previous message do not match");
          }
        }
        return this.requestStream({ method: "sampling/createMessage", params: Q }, O9, $);
      }
      elicitInputStream(Q, $) {
        let X = this._server.getClientCapabilities(), Y = Q.mode ?? "form";
        switch (Y) {
          case "url": {
            if (!X?.elicitation?.url) throw Error("Client does not support url elicitation.");
            break;
          }
          case "form": {
            if (!X?.elicitation?.form) throw Error("Client does not support form elicitation.");
            break;
          }
        }
        let J = Y === "form" && Q.mode === void 0 ? { ...Q, mode: "form" } : Q;
        return this.requestStream({ method: "elicitation/create", params: J }, D4, $);
      }
      async getTask(Q, $) {
        return this._server.getTask({ taskId: Q }, $);
      }
      async getTaskResult(Q, $, X) {
        return this._server.getTaskResult({ taskId: Q }, $, X);
      }
      async listTasks(Q, $) {
        return this._server.listTasks(Q ? { cursor: Q } : void 0, $);
      }
      async cancelTask(Q, $) {
        return this._server.cancelTask({ taskId: Q }, $);
      }
    };
    n7 = class extends lY {
      constructor(Q, $) {
        super($);
        if (this._serverInfo = Q, this._loggingLevels = /* @__PURE__ */ new Map(), this.LOG_LEVEL_SEVERITY = new Map(N9.options.map((X, Y) => [X, Y])), this.isMessageIgnored = (X, Y) => {
          let J = this._loggingLevels.get(Y);
          return J ? this.LOG_LEVEL_SEVERITY.get(X) < this.LOG_LEVEL_SEVERITY.get(J) : false;
        }, this._capabilities = $?.capabilities ?? {}, this._instructions = $?.instructions, this._jsonSchemaValidator = $?.jsonSchemaValidator ?? new d7(), this.setRequestHandler(RY, (X) => this._oninitialize(X)), this.setNotificationHandler(IY, () => this.oninitialized?.()), this._capabilities.logging) this.setRequestHandler(_Y, async (X, Y) => {
          let J = Y.sessionId || Y.requestInfo?.headers["mcp-session-id"] || void 0, { level: G } = X.params, W = N9.safeParse(G);
          if (W.success) this._loggingLevels.set(J, W.data);
          return {};
        });
      }
      get experimental() {
        if (!this._experimental) this._experimental = { tasks: new i7(this) };
        return this._experimental;
      }
      registerCapabilities(Q) {
        if (this.transport) throw Error("Cannot register capabilities after connecting to transport");
        this._capabilities = K3(this._capabilities, Q);
      }
      setRequestHandler(Q, $) {
        let Y = a1(Q)?.method;
        if (!Y) throw Error("Schema is missing a method literal");
        let J;
        if (t0(Y)) {
          let W = Y;
          J = W._zod?.def?.value ?? W.value;
        } else {
          let W = Y;
          J = W._def?.value ?? W.value;
        }
        if (typeof J !== "string") throw Error("Schema method literal must be a string");
        if (J === "tools/call") {
          let W = async (H, B) => {
            let z = t1(O4, H);
            if (!z.success) {
              let V = z.error instanceof Error ? z.error.message : String(z.error);
              throw new S(T.InvalidParams, `Invalid tools/call request: ${V}`);
            }
            let { params: K } = z.data, U = await Promise.resolve($(H, B));
            if (K.task) {
              let V = t1(F4, U);
              if (!V.success) {
                let L = V.error instanceof Error ? V.error.message : String(V.error);
                throw new S(T.InvalidParams, `Invalid task creation result: ${L}`);
              }
              return V.data;
            }
            let q = t1(o8, U);
            if (!q.success) {
              let V = q.error instanceof Error ? q.error.message : String(q.error);
              throw new S(T.InvalidParams, `Invalid tools/call result: ${V}`);
            }
            return q.data;
          };
          return super.setRequestHandler(Q, W);
        }
        return super.setRequestHandler(Q, $);
      }
      assertCapabilityForMethod(Q) {
        switch (Q) {
          case "sampling/createMessage":
            if (!this._clientCapabilities?.sampling) throw Error(`Client does not support sampling (required for ${Q})`);
            break;
          case "elicitation/create":
            if (!this._clientCapabilities?.elicitation) throw Error(`Client does not support elicitation (required for ${Q})`);
            break;
          case "roots/list":
            if (!this._clientCapabilities?.roots) throw Error(`Client does not support listing roots (required for ${Q})`);
            break;
          case "ping":
            break;
        }
      }
      assertNotificationCapability(Q) {
        switch (Q) {
          case "notifications/message":
            if (!this._capabilities.logging) throw Error(`Server does not support logging (required for ${Q})`);
            break;
          case "notifications/resources/updated":
          case "notifications/resources/list_changed":
            if (!this._capabilities.resources) throw Error(`Server does not support notifying about resources (required for ${Q})`);
            break;
          case "notifications/tools/list_changed":
            if (!this._capabilities.tools) throw Error(`Server does not support notifying of tool list changes (required for ${Q})`);
            break;
          case "notifications/prompts/list_changed":
            if (!this._capabilities.prompts) throw Error(`Server does not support notifying of prompt list changes (required for ${Q})`);
            break;
          case "notifications/elicitation/complete":
            if (!this._clientCapabilities?.elicitation?.url) throw Error(`Client does not support URL elicitation (required for ${Q})`);
            break;
          case "notifications/cancelled":
            break;
          case "notifications/progress":
            break;
        }
      }
      assertRequestHandlerCapability(Q) {
        if (!this._capabilities) return;
        switch (Q) {
          case "completion/complete":
            if (!this._capabilities.completions) throw Error(`Server does not support completions (required for ${Q})`);
            break;
          case "logging/setLevel":
            if (!this._capabilities.logging) throw Error(`Server does not support logging (required for ${Q})`);
            break;
          case "prompts/get":
          case "prompts/list":
            if (!this._capabilities.prompts) throw Error(`Server does not support prompts (required for ${Q})`);
            break;
          case "resources/list":
          case "resources/templates/list":
          case "resources/read":
            if (!this._capabilities.resources) throw Error(`Server does not support resources (required for ${Q})`);
            break;
          case "tools/call":
          case "tools/list":
            if (!this._capabilities.tools) throw Error(`Server does not support tools (required for ${Q})`);
            break;
          case "tasks/get":
          case "tasks/list":
          case "tasks/result":
          case "tasks/cancel":
            if (!this._capabilities.tasks) throw Error(`Server does not support tasks capability (required for ${Q})`);
            break;
          case "ping":
          case "initialize":
            break;
        }
      }
      assertTaskCapability(Q) {
        tK(this._clientCapabilities?.tasks?.requests, Q, "Client");
      }
      assertTaskHandlerCapability(Q) {
        if (!this._capabilities) return;
        rK(this._capabilities.tasks?.requests, Q, "Server");
      }
      async _oninitialize(Q) {
        let $ = Q.params.protocolVersion;
        return this._clientCapabilities = Q.params.capabilities, this._clientVersion = Q.params.clientInfo, { protocolVersion: UW.includes($) ? $ : DY, capabilities: this.getCapabilities(), serverInfo: this._serverInfo, ...this._instructions && { instructions: this._instructions } };
      }
      getClientCapabilities() {
        return this._clientCapabilities;
      }
      getClientVersion() {
        return this._clientVersion;
      }
      getCapabilities() {
        return this._capabilities;
      }
      async ping() {
        return this.request({ method: "ping" }, k8);
      }
      async createMessage(Q, $) {
        if (Q.tools || Q.toolChoice) {
          if (!this._clientCapabilities?.sampling?.tools) throw Error("Client does not support sampling tools capability.");
        }
        if (Q.messages.length > 0) {
          let X = Q.messages[Q.messages.length - 1], Y = Array.isArray(X.content) ? X.content : [X.content], J = Y.some((B) => B.type === "tool_result"), G = Q.messages.length > 1 ? Q.messages[Q.messages.length - 2] : void 0, W = G ? Array.isArray(G.content) ? G.content : [G.content] : [], H = W.some((B) => B.type === "tool_use");
          if (J) {
            if (Y.some((B) => B.type !== "tool_result")) throw Error("The last message must contain only tool_result content if any is present");
            if (!H) throw Error("tool_result blocks are not matching any tool_use from the previous message");
          }
          if (H) {
            let B = new Set(W.filter((K) => K.type === "tool_use").map((K) => K.id)), z = new Set(Y.filter((K) => K.type === "tool_result").map((K) => K.toolUseId));
            if (B.size !== z.size || ![...B].every((K) => z.has(K))) throw Error("ids of tool_result blocks and tool_use blocks from previous message do not match");
          }
        }
        if (Q.tools) return this.request({ method: "sampling/createMessage", params: Q }, kY, $);
        return this.request({ method: "sampling/createMessage", params: Q }, O9, $);
      }
      async elicitInput(Q, $) {
        switch (Q.mode ?? "form") {
          case "url": {
            if (!this._clientCapabilities?.elicitation?.url) throw Error("Client does not support url elicitation.");
            let Y = Q;
            return this.request({ method: "elicitation/create", params: Y }, D4, $);
          }
          case "form": {
            if (!this._clientCapabilities?.elicitation?.form) throw Error("Client does not support form elicitation.");
            let Y = Q.mode === "form" ? Q : { ...Q, mode: "form" }, J = await this.request({ method: "elicitation/create", params: Y }, D4, $);
            if (J.action === "accept" && J.content && Y.requestedSchema) try {
              let W = this._jsonSchemaValidator.getValidator(Y.requestedSchema)(J.content);
              if (!W.valid) throw new S(T.InvalidParams, `Elicitation response content does not match requested schema: ${W.errorMessage}`);
            } catch (G) {
              if (G instanceof S) throw G;
              throw new S(T.InternalError, `Error validating elicitation response: ${G instanceof Error ? G.message : String(G)}`);
            }
            return J;
          }
        }
      }
      createElicitationCompletionNotifier(Q, $) {
        if (!this._clientCapabilities?.elicitation?.url) throw Error("Client does not support URL elicitation (required for notifications/elicitation/complete)");
        return () => this.notification({ method: "notifications/elicitation/complete", params: { elicitationId: Q } }, $);
      }
      async listRoots(Q, $) {
        return this.request({ method: "roots/list", params: Q }, vY, $);
      }
      async sendLoggingMessage(Q, $) {
        if (this._capabilities.logging) {
          if (!this.isMessageIgnored(Q.level, $)) return this.notification({ method: "notifications/message", params: Q });
        }
      }
      async sendResourceUpdated(Q) {
        return this.notification({ method: "notifications/resources/updated", params: Q });
      }
      async sendResourceListChanged() {
        return this.notification({ method: "notifications/resources/list_changed" });
      }
      async sendToolListChanged() {
        return this.notification({ method: "notifications/tools/list_changed" });
      }
      async sendPromptListChanged() {
        return this.notification({ method: "notifications/prompts/list_changed" });
      }
    };
    sK = Symbol.for("mcp.completable");
    (function(Q) {
      Q.Completable = "McpCompletable";
    })(aK || (aK = {}));
    _P = /^[A-Za-z0-9._-]{1,128}$/;
    t7 = class {
      constructor(Q) {
        this._mcpServer = Q;
      }
      registerToolTask(Q, $, X) {
        let Y = { taskSupport: "required", ...$.execution };
        if (Y.taskSupport === "forbidden") throw Error(`Cannot register task-based tool '${Q}' with taskSupport 'forbidden'. Use registerTool() instead.`);
        return this._mcpServer._createRegisteredTool(Q, $.title, $.description, $.inputSchema, $.outputSchema, $.annotations, Y, $._meta, X);
      }
    };
    s7 = class {
      constructor(Q, $) {
        this._registeredResources = {}, this._registeredResourceTemplates = {}, this._registeredTools = {}, this._registeredPrompts = {}, this._toolHandlersInitialized = false, this._completionHandlerInitialized = false, this._resourceHandlersInitialized = false, this._promptHandlersInitialized = false, this.server = new n7(Q, $);
      }
      get experimental() {
        if (!this._experimental) this._experimental = { tasks: new t7(this) };
        return this._experimental;
      }
      async connect(Q) {
        return await this.server.connect(Q);
      }
      async close() {
        await this.server.close();
      }
      setToolRequestHandlers() {
        if (this._toolHandlersInitialized) return;
        this.server.assertCanSetRequestHandler(H6(n8)), this.server.assertCanSetRequestHandler(H6(O4)), this.server.registerCapabilities({ tools: { listChanged: true } }), this.server.setRequestHandler(n8, () => ({ tools: Object.entries(this._registeredTools).filter(([, Q]) => Q.enabled).map(([Q, $]) => {
          let X = { name: Q, title: $.title, description: $.description, inputSchema: (() => {
            let Y = U4($.inputSchema);
            return Y ? fY(Y, { strictUnions: true, pipeStrategy: "input" }) : TP;
          })(), annotations: $.annotations, execution: $.execution, _meta: $._meta };
          if ($.outputSchema) {
            let Y = U4($.outputSchema);
            if (Y) X.outputSchema = fY(Y, { strictUnions: true, pipeStrategy: "output" });
          }
          return X;
        }) })), this.server.setRequestHandler(O4, async (Q, $) => {
          try {
            let X = this._registeredTools[Q.params.name];
            if (!X) throw new S(T.InvalidParams, `Tool ${Q.params.name} not found`);
            if (!X.enabled) throw new S(T.InvalidParams, `Tool ${Q.params.name} disabled`);
            let Y = !!Q.params.task, J = X.execution?.taskSupport, G = "createTask" in X.handler;
            if ((J === "required" || J === "optional") && !G) throw new S(T.InternalError, `Tool ${Q.params.name} has taskSupport '${J}' but was not registered with registerToolTask`);
            if (J === "required" && !Y) throw new S(T.MethodNotFound, `Tool ${Q.params.name} requires task augmentation (taskSupport: 'required')`);
            if (J === "optional" && !Y && G) return await this.handleAutomaticTaskPolling(X, Q, $);
            let W = await this.validateToolInput(X, Q.params.arguments, Q.params.name), H = await this.executeToolHandler(X, W, $);
            if (Y) return H;
            return await this.validateToolOutput(X, H, Q.params.name), H;
          } catch (X) {
            if (X instanceof S) {
              if (X.code === T.UrlElicitationRequired) throw X;
            }
            return this.createToolError(X instanceof Error ? X.message : String(X));
          }
        }), this._toolHandlersInitialized = true;
      }
      createToolError(Q) {
        return { content: [{ type: "text", text: Q }], isError: true };
      }
      async validateToolInput(Q, $, X) {
        if (!Q.inputSchema) return;
        let J = U4(Q.inputSchema) ?? Q.inputSchema, G = await I8(J, $);
        if (!G.success) {
          let W = "error" in G ? G.error : "Unknown error", H = E8(W);
          throw new S(T.InvalidParams, `Input validation error: Invalid arguments for tool ${X}: ${H}`);
        }
        return G.data;
      }
      async validateToolOutput(Q, $, X) {
        if (!Q.outputSchema) return;
        if (!("content" in $)) return;
        if ($.isError) return;
        if (!$.structuredContent) throw new S(T.InvalidParams, `Output validation error: Tool ${X} has an output schema but no structured content was provided`);
        let Y = U4(Q.outputSchema), J = await I8(Y, $.structuredContent);
        if (!J.success) {
          let G = "error" in J ? J.error : "Unknown error", W = E8(G);
          throw new S(T.InvalidParams, `Output validation error: Invalid structured content for tool ${X}: ${W}`);
        }
      }
      async executeToolHandler(Q, $, X) {
        let Y = Q.handler;
        if ("createTask" in Y) {
          if (!X.taskStore) throw Error("No task store provided.");
          let G = { ...X, taskStore: X.taskStore };
          if (Q.inputSchema) return await Promise.resolve(Y.createTask($, G));
          else return await Promise.resolve(Y.createTask(G));
        }
        if (Q.inputSchema) return await Promise.resolve(Y($, X));
        else return await Promise.resolve(Y(X));
      }
      async handleAutomaticTaskPolling(Q, $, X) {
        if (!X.taskStore) throw Error("No task store provided for task-capable tool.");
        let Y = await this.validateToolInput(Q, $.params.arguments, $.params.name), J = Q.handler, G = { ...X, taskStore: X.taskStore }, W = Y ? await Promise.resolve(J.createTask(Y, G)) : await Promise.resolve(J.createTask(G)), H = W.task.taskId, B = W.task, z = B.pollInterval ?? 5e3;
        while (B.status !== "completed" && B.status !== "failed" && B.status !== "cancelled") {
          await new Promise((U) => setTimeout(U, z));
          let K = await X.taskStore.getTask(H);
          if (!K) throw new S(T.InternalError, `Task ${H} not found during polling`);
          B = K;
        }
        return await X.taskStore.getTaskResult(H);
      }
      setCompletionRequestHandler() {
        if (this._completionHandlerInitialized) return;
        this.server.assertCanSetRequestHandler(H6(r8)), this.server.registerCapabilities({ completions: {} }), this.server.setRequestHandler(r8, async (Q) => {
          switch (Q.params.ref.type) {
            case "ref/prompt":
              return ZW(Q), this.handlePromptCompletion(Q, Q.params.ref);
            case "ref/resource":
              return CW(Q), this.handleResourceCompletion(Q, Q.params.ref);
            default:
              throw new S(T.InvalidParams, `Invalid completion reference: ${Q.params.ref}`);
          }
        }), this._completionHandlerInitialized = true;
      }
      async handlePromptCompletion(Q, $) {
        let X = this._registeredPrompts[$.name];
        if (!X) throw new S(T.InvalidParams, `Prompt ${$.name} not found`);
        if (!X.enabled) throw new S(T.InvalidParams, `Prompt ${$.name} disabled`);
        if (!X.argsSchema) return l9;
        let J = a1(X.argsSchema)?.[Q.params.argument.name];
        if (!o7(J)) return l9;
        let G = eK(J);
        if (!G) return l9;
        let W = await G(Q.params.argument.value, Q.params.context);
        return $V(W);
      }
      async handleResourceCompletion(Q, $) {
        let X = Object.values(this._registeredResourceTemplates).find((G) => G.resourceTemplate.uriTemplate.toString() === $.uri);
        if (!X) {
          if (this._registeredResources[$.uri]) return l9;
          throw new S(T.InvalidParams, `Resource template ${Q.params.ref.uri} not found`);
        }
        let Y = X.resourceTemplate.completeCallback(Q.params.argument.name);
        if (!Y) return l9;
        let J = await Y(Q.params.argument.value, Q.params.context);
        return $V(J);
      }
      setResourceRequestHandlers() {
        if (this._resourceHandlersInitialized) return;
        this.server.assertCanSetRequestHandler(H6(l8)), this.server.assertCanSetRequestHandler(H6(c8)), this.server.assertCanSetRequestHandler(H6(p8)), this.server.registerCapabilities({ resources: { listChanged: true } }), this.server.setRequestHandler(l8, async (Q, $) => {
          let X = Object.entries(this._registeredResources).filter(([J, G]) => G.enabled).map(([J, G]) => ({ uri: J, name: G.name, ...G.metadata })), Y = [];
          for (let J of Object.values(this._registeredResourceTemplates)) {
            if (!J.resourceTemplate.listCallback) continue;
            let G = await J.resourceTemplate.listCallback($);
            for (let W of G.resources) Y.push({ ...J.metadata, ...W });
          }
          return { resources: [...X, ...Y] };
        }), this.server.setRequestHandler(c8, async () => {
          return { resourceTemplates: Object.entries(this._registeredResourceTemplates).map(([$, X]) => ({ name: $, uriTemplate: X.resourceTemplate.uriTemplate.toString(), ...X.metadata })) };
        }), this.server.setRequestHandler(p8, async (Q, $) => {
          let X = new URL(Q.params.uri), Y = this._registeredResources[X.toString()];
          if (Y) {
            if (!Y.enabled) throw new S(T.InvalidParams, `Resource ${X} disabled`);
            return Y.readCallback(X, $);
          }
          for (let J of Object.values(this._registeredResourceTemplates)) {
            let G = J.resourceTemplate.uriTemplate.match(X.toString());
            if (G) return J.readCallback(X, G, $);
          }
          throw new S(T.InvalidParams, `Resource ${X} not found`);
        }), this._resourceHandlersInitialized = true;
      }
      setPromptRequestHandlers() {
        if (this._promptHandlersInitialized) return;
        this.server.assertCanSetRequestHandler(H6(d8)), this.server.assertCanSetRequestHandler(H6(i8)), this.server.registerCapabilities({ prompts: { listChanged: true } }), this.server.setRequestHandler(d8, () => ({ prompts: Object.entries(this._registeredPrompts).filter(([, Q]) => Q.enabled).map(([Q, $]) => {
          return { name: Q, title: $.title, description: $.description, arguments: $.argsSchema ? yP($.argsSchema) : void 0 };
        }) })), this.server.setRequestHandler(i8, async (Q, $) => {
          let X = this._registeredPrompts[Q.params.name];
          if (!X) throw new S(T.InvalidParams, `Prompt ${Q.params.name} not found`);
          if (!X.enabled) throw new S(T.InvalidParams, `Prompt ${Q.params.name} disabled`);
          if (X.argsSchema) {
            let Y = U4(X.argsSchema), J = await I8(Y, Q.params.arguments);
            if (!J.success) {
              let H = "error" in J ? J.error : "Unknown error", B = E8(H);
              throw new S(T.InvalidParams, `Invalid arguments for prompt ${Q.params.name}: ${B}`);
            }
            let G = J.data, W = X.callback;
            return await Promise.resolve(W(G, $));
          } else {
            let Y = X.callback;
            return await Promise.resolve(Y($));
          }
        }), this._promptHandlersInitialized = true;
      }
      resource(Q, $, ...X) {
        let Y;
        if (typeof X[0] === "object") Y = X.shift();
        let J = X[0];
        if (typeof $ === "string") {
          if (this._registeredResources[$]) throw Error(`Resource ${$} is already registered`);
          let G = this._createRegisteredResource(Q, void 0, $, Y, J);
          return this.setResourceRequestHandlers(), this.sendResourceListChanged(), G;
        } else {
          if (this._registeredResourceTemplates[Q]) throw Error(`Resource template ${Q} is already registered`);
          let G = this._createRegisteredResourceTemplate(Q, void 0, $, Y, J);
          return this.setResourceRequestHandlers(), this.sendResourceListChanged(), G;
        }
      }
      registerResource(Q, $, X, Y) {
        if (typeof $ === "string") {
          if (this._registeredResources[$]) throw Error(`Resource ${$} is already registered`);
          let J = this._createRegisteredResource(Q, X.title, $, X, Y);
          return this.setResourceRequestHandlers(), this.sendResourceListChanged(), J;
        } else {
          if (this._registeredResourceTemplates[Q]) throw Error(`Resource template ${Q} is already registered`);
          let J = this._createRegisteredResourceTemplate(Q, X.title, $, X, Y);
          return this.setResourceRequestHandlers(), this.sendResourceListChanged(), J;
        }
      }
      _createRegisteredResource(Q, $, X, Y, J) {
        let G = { name: Q, title: $, metadata: Y, readCallback: J, enabled: true, disable: () => G.update({ enabled: false }), enable: () => G.update({ enabled: true }), remove: () => G.update({ uri: null }), update: (W) => {
          if (typeof W.uri < "u" && W.uri !== X) {
            if (delete this._registeredResources[X], W.uri) this._registeredResources[W.uri] = G;
          }
          if (typeof W.name < "u") G.name = W.name;
          if (typeof W.title < "u") G.title = W.title;
          if (typeof W.metadata < "u") G.metadata = W.metadata;
          if (typeof W.callback < "u") G.readCallback = W.callback;
          if (typeof W.enabled < "u") G.enabled = W.enabled;
          this.sendResourceListChanged();
        } };
        return this._registeredResources[X] = G, G;
      }
      _createRegisteredResourceTemplate(Q, $, X, Y, J) {
        let G = { resourceTemplate: X, title: $, metadata: Y, readCallback: J, enabled: true, disable: () => G.update({ enabled: false }), enable: () => G.update({ enabled: true }), remove: () => G.update({ name: null }), update: (B) => {
          if (typeof B.name < "u" && B.name !== Q) {
            if (delete this._registeredResourceTemplates[Q], B.name) this._registeredResourceTemplates[B.name] = G;
          }
          if (typeof B.title < "u") G.title = B.title;
          if (typeof B.template < "u") G.resourceTemplate = B.template;
          if (typeof B.metadata < "u") G.metadata = B.metadata;
          if (typeof B.callback < "u") G.readCallback = B.callback;
          if (typeof B.enabled < "u") G.enabled = B.enabled;
          this.sendResourceListChanged();
        } };
        this._registeredResourceTemplates[Q] = G;
        let W = X.uriTemplate.variableNames;
        if (Array.isArray(W) && W.some((B) => !!X.completeCallback(B))) this.setCompletionRequestHandler();
        return G;
      }
      _createRegisteredPrompt(Q, $, X, Y, J) {
        let G = { title: $, description: X, argsSchema: Y === void 0 ? void 0 : P6(Y), callback: J, enabled: true, disable: () => G.update({ enabled: false }), enable: () => G.update({ enabled: true }), remove: () => G.update({ name: null }), update: (W) => {
          if (typeof W.name < "u" && W.name !== Q) {
            if (delete this._registeredPrompts[Q], W.name) this._registeredPrompts[W.name] = G;
          }
          if (typeof W.title < "u") G.title = W.title;
          if (typeof W.description < "u") G.description = W.description;
          if (typeof W.argsSchema < "u") G.argsSchema = P6(W.argsSchema);
          if (typeof W.callback < "u") G.callback = W.callback;
          if (typeof W.enabled < "u") G.enabled = W.enabled;
          this.sendPromptListChanged();
        } };
        if (this._registeredPrompts[Q] = G, Y) {
          if (Object.values(Y).some((H) => {
            let B = H instanceof m0 ? H._def?.innerType : H;
            return o7(B);
          })) this.setCompletionRequestHandler();
        }
        return G;
      }
      _createRegisteredTool(Q, $, X, Y, J, G, W, H, B) {
        r7(Q);
        let z = { title: $, description: X, inputSchema: QV(Y), outputSchema: QV(J), annotations: G, execution: W, _meta: H, handler: B, enabled: true, disable: () => z.update({ enabled: false }), enable: () => z.update({ enabled: true }), remove: () => z.update({ name: null }), update: (K) => {
          if (typeof K.name < "u" && K.name !== Q) {
            if (typeof K.name === "string") r7(K.name);
            if (delete this._registeredTools[Q], K.name) this._registeredTools[K.name] = z;
          }
          if (typeof K.title < "u") z.title = K.title;
          if (typeof K.description < "u") z.description = K.description;
          if (typeof K.paramsSchema < "u") z.inputSchema = P6(K.paramsSchema);
          if (typeof K.outputSchema < "u") z.outputSchema = P6(K.outputSchema);
          if (typeof K.callback < "u") z.handler = K.callback;
          if (typeof K.annotations < "u") z.annotations = K.annotations;
          if (typeof K._meta < "u") z._meta = K._meta;
          if (typeof K.enabled < "u") z.enabled = K.enabled;
          this.sendToolListChanged();
        } };
        return this._registeredTools[Q] = z, this.setToolRequestHandlers(), this.sendToolListChanged(), z;
      }
      tool(Q, ...$) {
        if (this._registeredTools[Q]) throw Error(`Tool ${Q} is already registered`);
        let X, Y, J, G;
        if (typeof $[0] === "string") X = $.shift();
        if ($.length > 1) {
          let H = $[0];
          if (a7(H)) {
            if (Y = $.shift(), $.length > 1 && typeof $[0] === "object" && $[0] !== null && !a7($[0])) G = $.shift();
          } else if (typeof H === "object" && H !== null) G = $.shift();
        }
        let W = $[0];
        return this._createRegisteredTool(Q, void 0, X, Y, J, G, { taskSupport: "forbidden" }, void 0, W);
      }
      registerTool(Q, $, X) {
        if (this._registeredTools[Q]) throw Error(`Tool ${Q} is already registered`);
        let { title: Y, description: J, inputSchema: G, outputSchema: W, annotations: H, _meta: B } = $;
        return this._createRegisteredTool(Q, Y, J, G, W, H, { taskSupport: "forbidden" }, B, X);
      }
      prompt(Q, ...$) {
        if (this._registeredPrompts[Q]) throw Error(`Prompt ${Q} is already registered`);
        let X;
        if (typeof $[0] === "string") X = $.shift();
        let Y;
        if ($.length > 1) Y = $.shift();
        let J = $[0], G = this._createRegisteredPrompt(Q, void 0, X, Y, J);
        return this.setPromptRequestHandlers(), this.sendPromptListChanged(), G;
      }
      registerPrompt(Q, $, X) {
        if (this._registeredPrompts[Q]) throw Error(`Prompt ${Q} is already registered`);
        let { title: Y, description: J, argsSchema: G } = $, W = this._createRegisteredPrompt(Q, Y, J, G, X);
        return this.setPromptRequestHandlers(), this.sendPromptListChanged(), W;
      }
      isConnected() {
        return this.server.transport !== void 0;
      }
      async sendLoggingMessage(Q, $) {
        return this.server.sendLoggingMessage(Q, $);
      }
      sendResourceListChanged() {
        if (this.isConnected()) this.server.sendResourceListChanged();
      }
      sendToolListChanged() {
        if (this.isConnected()) this.server.sendToolListChanged();
      }
      sendPromptListChanged() {
        if (this.isConnected()) this.server.sendPromptListChanged();
      }
    };
    TP = { type: "object", properties: {} };
    l9 = { completion: { values: [], hasMore: false } };
    JV = 15e3;
    fP = YV(() => i1.object({ session_id: i1.string(), ws_url: i1.string(), work_dir: i1.string().optional(), session_key: i1.string().optional() }));
    P1 = class extends Error {
      constructor(Q) {
        super(Q);
        this.name = "DirectConnectError";
      }
    };
    WV = class {
      options;
      ws;
      sessionId;
      workDir;
      abortController;
      readyState = false;
      closed = false;
      exitError;
      messageQueue = [];
      messageResolve;
      messageReject;
      readyPromise;
      readyResolve;
      readyReject;
      abortHandler;
      partialLine = "";
      constructor(Q) {
        this.options = Q;
        this.abortController = Q.abortController ?? new AbortController(), this.readyPromise = new Promise(($, X) => {
          this.readyResolve = $, this.readyReject = X;
        }), this.readyPromise.catch(() => {
        }), this.initialize();
      }
      get ready() {
        return this.readyPromise;
      }
      getSessionId() {
        return this.sessionId;
      }
      getWorkDir() {
        return this.workDir;
      }
      async initialize() {
        if (this.abortController.signal.aborted) {
          this.failInit(new T0("Connection aborted"));
          return;
        }
        this.abortHandler = () => {
          this.close(), this.exitError = new T0("Connection aborted by user");
        }, this.abortController.signal.addEventListener("abort", this.abortHandler);
        let Q;
        try {
          let J = await mP(this.options);
          this.sessionId = J.sessionId, this.workDir = J.workDir, Q = J.wsUrl;
        } catch (J) {
          this.failInit(J instanceof Error ? J : Error(String(J)));
          return;
        }
        if (this.closed) {
          if (this.options.deleteSessionOnClose && this.sessionId) GV(this.options.serverUrl, this.sessionId, this.options.authToken);
          return;
        }
        let $ = {};
        if (this.options.authToken) $.authorization = `Bearer ${this.options.authToken}`;
        let X = new WebSocket(Q, { headers: $ });
        this.ws = X;
        let Y = setTimeout((J, G) => {
          if (!J.readyState) {
            G.close();
            let W = new P1(`WebSocket connection timeout after ${JV}ms`);
            J.exitError = W, J.readyReject?.(W);
          }
        }, JV, this, X);
        X.addEventListener("open", () => {
          clearTimeout(Y), this.readyState = true, i0(`[DirectConnectTransport] Connected to ${this.options.serverUrl}, session=${this.sessionId}`), this.readyResolve?.();
        }), X.addEventListener("message", (J) => {
          let G = typeof J.data === "string" ? J.data : "", H = (this.partialLine + G).split(`
`);
          this.partialLine = H.pop() ?? "";
          for (let B of H) {
            if (!B) continue;
            let z;
            try {
              z = O1(B);
            } catch {
              continue;
            }
            this.enqueue(z);
          }
        }), X.addEventListener("error", () => {
          clearTimeout(Y);
          let J = new P1("WebSocket connection error");
          if (this.exitError = J, this.readyReject?.(J), this.messageReject) this.messageReject(J), this.messageReject = void 0, this.messageResolve = void 0;
        }), X.addEventListener("close", (J) => {
          if (this.readyState = false, this.closed = true, J.code !== 1e3 && J.code !== 1001 && !this.exitError) this.exitError = new P1(`WebSocket closed abnormally: ${J.code} ${J.reason}`);
          if (this.messageResolve) this.messageResolve({ done: true, value: void 0 }), this.messageResolve = void 0, this.messageReject = void 0;
        });
      }
      failInit(Q) {
        if (this.exitError = Q, this.closed = true, this.readyReject?.(Q), this.messageResolve) this.messageResolve({ done: true, value: void 0 }), this.messageResolve = void 0, this.messageReject = void 0;
      }
      enqueue(Q) {
        if (this.messageResolve) {
          let $ = this.messageResolve;
          this.messageResolve = void 0, this.messageReject = void 0, $({ done: false, value: Q });
        } else this.messageQueue.push(Q);
      }
      async write(Q) {
        if (this.abortController.signal.aborted) throw new T0("Operation aborted");
        if (!this.readyState) await this.readyPromise;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new P1("Transport is not ready for writing");
        this.ws.send(Q);
      }
      isReady() {
        return this.readyState && this.ws?.readyState === WebSocket.OPEN;
      }
      endInput() {
      }
      close() {
        if (this.closed) return;
        if (this.closed = true, this.readyState = false, this.abortHandler) this.abortController.signal.removeEventListener("abort", this.abortHandler), this.abortHandler = void 0;
        if (!this.abortController.signal.aborted) this.abortController.abort();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close(1e3, "Normal closure");
        if (this.messageResolve) this.messageResolve({ done: true, value: void 0 }), this.messageResolve = void 0, this.messageReject = void 0;
        if (this.options.deleteSessionOnClose && this.sessionId) GV(this.options.serverUrl, this.sessionId, this.options.authToken);
      }
      async *readMessages() {
        while (!this.closed || this.messageQueue.length > 0) {
          if (this.messageQueue.length > 0) {
            yield this.messageQueue.shift();
            continue;
          }
          if (this.closed) break;
          let Q = await new Promise(($, X) => {
            if (this.messageQueue.length > 0) {
              $({ done: false, value: this.messageQueue.shift() });
              return;
            }
            if (this.closed) {
              $({ done: true, value: void 0 });
              return;
            }
            this.messageResolve = $, this.messageReject = X;
          });
          if (Q.done) break;
          yield Q.value;
        }
        if (this.exitError) throw this.exitError;
      }
    };
  }
});

// src/lib/cli.mjs
import { resolve } from "node:path";
var DEFAULT_ROLES = ["leader", "worker:2", "inspector"];
var VALID_ENGINES = ["codex", "claude", "opencode"];
function parseGlobalArgs(argv, fatal2) {
  const args = argv.slice(2);
  const config = {
    cwd: process.cwd(),
    engine: "codex",
    approvalMode: "full-auto",
    sandboxMode: "danger-full-access",
    port: 0,
    dryRun: false,
    maxPulses: 3,
    help: false
  };
  const rest = [];
  for (let i2 = 0; i2 < args.length; i2++) {
    switch (args[i2]) {
      case "--cwd":
        config.cwd = resolve(args[++i2]);
        break;
      case "--engine":
        config.engine = args[++i2];
        break;
      case "--approval-mode":
        config.approvalMode = args[++i2];
        break;
      case "--sandbox-mode":
        config.sandboxMode = args[++i2];
        break;
      case "--port":
        config.port = parseInt(args[++i2], 10);
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--max-pulses":
        config.maxPulses = parseInt(args[++i2], 10);
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        rest.push(args[i2]);
    }
  }
  if (!VALID_ENGINES.includes(config.engine)) {
    fatal2(`Invalid engine: ${config.engine}. Valid: ${VALID_ENGINES.join(", ")}`);
  }
  return { config, rest };
}
function parseServeArgs(args, fatal2) {
  const result = {
    goal: "",
    roles: [...DEFAULT_ROLES],
    baseRef: "HEAD"
  };
  for (let i2 = 0; i2 < args.length; i2++) {
    switch (args[i2]) {
      case "--goal":
        result.goal = args[++i2];
        break;
      case "--roles":
        result.roles = args[++i2].split(",").map((s2) => s2.trim()).filter(Boolean);
        break;
      case "--base":
        result.baseRef = args[++i2];
        break;
      default:
        if (!args[i2].startsWith("--") && !result.goal) {
          result.goal = args[i2];
        }
    }
  }
  if (!result.goal) fatal2("Goal is required. Usage: team serve --goal 'your goal'");
  return result;
}
function printUsage() {
  console.log(`
Workshop \u2014 Multi-Agent SWE Team

Usage:
  team serve --goal "..." [--roles worker:2,inspector] [--base HEAD]
  team status

Global options:
  --cwd <path>          Working directory (default: cwd)
  --engine <codex|claude|opencode>  Engine (default: codex)
  --port <N>            Server port (default: auto)
  --max-pulses <N>      Max pulses per agent turn (default: 3)
  --dry-run             Simulate without running agents

Examples:
  team serve --goal "Implement login page with auth API"
  team serve --goal "..." --roles "leader,worker:3,inspector" --engine claude
`);
}

// src/lib/workshop.mjs
import { createServer } from "node:http";
import { existsSync as existsSync6 } from "node:fs";
import { mkdir as mkdir6, readFile as readFile5, writeFile as writeFile2 } from "node:fs/promises";
import { join as join5, resolve as resolve5, relative, dirname as dirname4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { execSync as execSync2, exec as execCb } from "node:child_process";

// src/lib/meeting.mjs
import { existsSync } from "node:fs";
import { readFile, appendFile, mkdir as mkdir2 } from "node:fs/promises";
import { join, dirname as dirname2 } from "node:path";

// src/lib/atomic.mjs
import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
async function ensureParentDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}
async function writeTextAtomic(path3, text) {
  await ensureParentDir(path3);
  const tmp = `${path3}.tmp`;
  await writeFile(tmp, text, "utf-8");
  await rename(tmp, path3);
}
async function writeJsonAtomic(path3, obj) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  await writeTextAtomic(path3, text);
}

// src/lib/mutex.mjs
var Mutex = class {
  #queue = [];
  #locked = false;
  async run(fn) {
    await this.#acquire();
    try {
      return await fn();
    } finally {
      this.#release();
    }
  }
  #acquire() {
    return new Promise((resolve6) => {
      if (!this.#locked) {
        this.#locked = true;
        resolve6();
      } else {
        this.#queue.push(resolve6);
      }
    });
  }
  #release() {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      next();
    } else {
      this.#locked = false;
    }
  }
};

// src/lib/meeting.mjs
function makeMessage(from, content, { channel = "meeting", to = null } = {}) {
  const mentions = parseMentions(content);
  return {
    seq: 0,
    // set by MeetingRoom.post()
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    from,
    to,
    // null = meeting (public), string = DM
    channel,
    // "meeting" | "pipe"
    mentions,
    // ["worker-1", "leader", ...]
    content
  };
}
function parseMentions(content) {
  if (!content) return [];
  const matches = content.match(/@([\w\u4e00-\u9fff\u3400-\u4dbf-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m2) => m2.slice(1)))];
}
var MeetingRoom = class {
  #dir;
  // .workshop/ directory
  #path;
  // .workshop/meeting.jsonl
  #cursors;
  // Map<agent, seq> — where each agent last read
  #seq;
  // current global sequence number
  #onMention;
  // callback: (agentName, messages) => void
  #lock;
  // Mutex for write serialization
  constructor(workshopDir) {
    this.#dir = workshopDir;
    this.#path = join(workshopDir, "meeting.jsonl");
    this.#cursors = /* @__PURE__ */ new Map();
    this.#seq = 0;
    this.#onMention = null;
    this.#lock = new Mutex();
  }
  /** Register callback for @mention events. Hub sets this. */
  set onMention(fn) {
    this.#onMention = fn;
  }
  async init() {
    await mkdir2(this.#dir, { recursive: true });
    await mkdir2(join(this.#dir, "pipes"), { recursive: true });
    if (!existsSync(this.#path)) {
      await writeTextAtomic(this.#path, "");
    }
    const all = await this.readAll();
    this.#seq = all.length;
  }
  /** Post a message to the meeting room. Returns the message with seq. */
  async post(from, content) {
    return this.#lock.run(async () => {
      const msg = makeMessage(from, content, { channel: "meeting" });
      msg.seq = this.#seq++;
      const line = JSON.stringify(msg) + "\n";
      await appendFile(this.#path, line, "utf-8");
      if (msg.mentions.length > 0 && this.#onMention) {
        const expandedMentions = msg.mentions.includes("all") ? ["__all__"] : msg.mentions;
        for (const target of expandedMentions) {
          if (target === from) continue;
          const newMsgs = await this.readAll();
          const cursor = this.#cursors.get(target) || 0;
          const unread = newMsgs.slice(cursor);
          this.#cursors.set(target, newMsgs.length);
          this.#onMention(target, unread, msg);
        }
      }
      return msg;
    });
  }
  /** Post a Hub system event (factual, not a decision). */
  async postEvent(content) {
    return this.post("hub", content);
  }
  /** Read all meeting room messages. */
  async readAll() {
    if (!existsSync(this.#path)) return [];
    const raw = await readFile(this.#path, "utf-8");
    return raw.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
  /** Read new messages since agent's cursor. Advances cursor. */
  async readNew(agent) {
    const all = await this.readAll();
    const cursor = this.#cursors.get(agent) || 0;
    const newMsgs = all.slice(cursor);
    this.#cursors.set(agent, all.length);
    return newMsgs;
  }
  /** Peek new messages without advancing cursor. */
  async peekNew(agent) {
    const all = await this.readAll();
    const cursor = this.#cursors.get(agent) || 0;
    return all.slice(cursor);
  }
  /** Mark all current messages as read for agent. */
  async markRead(agent) {
    const all = await this.readAll();
    this.#cursors.set(agent, all.length);
  }
  /** Get count of unread messages for agent. */
  async unreadCount(agent) {
    const all = await this.readAll();
    const cursor = this.#cursors.get(agent) || 0;
    return Math.max(0, all.length - cursor);
  }
  /** Get current message count. */
  async messageCount() {
    const all = await this.readAll();
    return all.length;
  }
  // ─── Private Pipes (DM) ───
  #pipePath(a2, b2) {
    const [x2, y2] = [a2, b2].sort();
    return join(this.#dir, "pipes", `${x2}__${y2}.jsonl`);
  }
  async sendDM(from, to, content) {
    const msg = makeMessage(from, content, { channel: "pipe", to });
    const path3 = this.#pipePath(from, to);
    await mkdir2(dirname2(path3), { recursive: true });
    await appendFile(path3, JSON.stringify(msg) + "\n", "utf-8");
    return msg;
  }
  async readDMs(agentA, agentB) {
    const path3 = this.#pipePath(agentA, agentB);
    if (!existsSync(path3)) return [];
    const raw = await readFile(path3, "utf-8");
    return raw.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
  async readNewDMs(agent, peer) {
    const key = `dm:${agent}:${peer}`;
    const all = await this.readDMs(agent, peer);
    const cursor = this.#cursors.get(key) || 0;
    const newMsgs = all.slice(cursor);
    this.#cursors.set(key, all.length);
    return newMsgs;
  }
  // ─── Message Formatting ───
  /** Format messages for injection into an agent's session prompt. */
  wrapMessages(messages, { label = "\u4F1A\u8BAE\u5BA4" } = {}) {
    if (!messages || messages.length === 0) return null;
    const lines = messages.map((m2) => {
      const time = m2.ts ? m2.ts.split("T")[1]?.slice(0, 8) || "" : "";
      const prefix = m2.channel === "pipe" ? "[\u79C1\u4FE1] " : "";
      const mentionTag = m2.mentions?.length > 0 ? ` [\u2192 ${m2.mentions.map((n2) => "@" + n2).join(" ")}]` : "";
      return `${prefix}${m2.from} (${time})${mentionTag}: ${m2.content}`;
    });
    return `[${label} \xB7 ${messages.length} \u6761\u65B0\u6D88\u606F]

${lines.join("\n")}`;
  }
};

// src/lib/board.mjs
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile2, mkdir as mkdir3 } from "node:fs/promises";
import { join as join2 } from "node:path";
function emptyBoard(runId, goal) {
  return {
    runId,
    goal: goal || "",
    phase: "initializing",
    // initializing → planning → executing → inspecting → completed
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    agents: {},
    // keyed by agent name → { role, status, worktreeRel, branch, threadId, ... }
    tasks: [],
    // ordered list of tasks
    merges: []
    // merge history
  };
}
function emptyTask(id, title, assignee) {
  return {
    id,
    title,
    assignee: assignee || null,
    // agent name
    status: "pending",
    // pending → active → done → merged | blocked
    progress: 0,
    // 0-100, self-reported by worker
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    notes: "",
    // free-form notes from the assignee
    summary: ""
    // compressed summary after completion (for context handoff)
  };
}
var Board = class {
  #path;
  #data;
  #lock;
  constructor(workshopDir) {
    this.#path = join2(workshopDir, "board.json");
    this.#data = null;
    this.#lock = new Mutex();
  }
  // ─── Lifecycle ───
  async init(runId, goal) {
    if (existsSync2(this.#path)) {
      this.#data = JSON.parse(await readFile2(this.#path, "utf-8"));
    } else {
      this.#data = emptyBoard(runId, goal);
      await this.#persist();
    }
    return this.#data;
  }
  async reload() {
    if (existsSync2(this.#path)) {
      this.#data = JSON.parse(await readFile2(this.#path, "utf-8"));
    }
    return this.#data;
  }
  get data() {
    return this.#data;
  }
  async #persist() {
    this.#data.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await writeJsonAtomic(this.#path, this.#data);
  }
  // ─── Agent Registry ───
  async registerAgent(name, info) {
    return this.#lock.run(async () => {
      this.#data.agents[name] = {
        role: info.role,
        // "leader" | "worker" | "inspector"
        status: "idle",
        // idle | running | done | blocked
        worktreeRel: info.worktreeRel || null,
        branch: info.branch || null,
        threadId: null,
        currentTaskId: null,
        // sequential: only one task at a time
        completedTasks: [],
        // list of {id, title, summary} for context compression
        lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
        ...info
      };
      await this.#persist();
    });
  }
  async updateAgent(name, updates) {
    return this.#lock.run(async () => {
      if (!this.#data.agents[name]) return;
      Object.assign(this.#data.agents[name], updates, {
        lastSeen: (/* @__PURE__ */ new Date()).toISOString()
      });
      await this.#persist();
    });
  }
  getAgent(name) {
    return this.#data.agents[name] || null;
  }
  getAgentsByRole(role) {
    return Object.entries(this.#data.agents).filter(([, a2]) => a2.role === role).map(([name, a2]) => ({ name, ...a2 }));
  }
  getIdleWorkers() {
    return Object.entries(this.#data.agents).filter(([, a2]) => a2.role === "worker" && a2.status === "idle").map(([name, a2]) => ({ name, ...a2 }));
  }
  // ─── Task Management ───
  async addTask(title, assignee = null) {
    return this.#lock.run(async () => {
      const maxId = this.#data.tasks.reduce((m2, t) => Math.max(m2, t.id), 0);
      const task = emptyTask(maxId + 1, title, assignee);
      this.#data.tasks.push(task);
      await this.#persist();
      return task;
    });
  }
  async updateTask(taskId, updates) {
    return this.#lock.run(async () => {
      const task = this.#data.tasks.find((t) => t.id === taskId);
      if (!task) return null;
      Object.assign(task, updates, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      await this.#persist();
      return task;
    });
  }
  getTask(taskId) {
    return this.#data.tasks.find((t) => t.id === taskId) || null;
  }
  getTasksForAgent(agentName) {
    return this.#data.tasks.filter((t) => t.assignee === agentName);
  }
  // Get the next pending task for an agent (sequential: one at a time)
  getNextPendingTask(agentName) {
    return this.#data.tasks.find(
      (t) => t.assignee === agentName && t.status === "pending"
    ) || null;
  }
  // Get the agent's current active task
  getCurrentTask(agentName) {
    const agent = this.#data.agents[agentName];
    if (!agent?.currentTaskId) return null;
    return this.getTask(agent.currentTaskId);
  }
  // Ensure a worker has exactly one active task before entering a fresh session.
  async ensureCurrentTask(agentName) {
    return this.#lock.run(async () => {
      const agent = this.#data.agents[agentName];
      if (!agent) return null;
      if (agent.currentTaskId) {
        const current = this.getTask(agent.currentTaskId);
        if (current) return current;
        agent.currentTaskId = null;
      }
      const nextTask = this.#data.tasks.find(
        (t) => t.assignee === agentName && t.status === "pending"
      );
      if (!nextTask) return null;
      agent.currentTaskId = nextTask.id;
      nextTask.status = "active";
      nextTask.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.#persist();
      return nextTask;
    });
  }
  // Complete current task and record compressed summary for context handoff
  async completeCurrentTask(agentName, expectedTaskId, summary = "") {
    return this.#lock.run(async () => {
      const agent = this.#data.agents[agentName];
      if (!agent?.currentTaskId) return null;
      if (agent.currentTaskId !== expectedTaskId) return null;
      const task = this.getTask(expectedTaskId);
      if (!task) return null;
      if (task.assignee !== agentName) return null;
      task.status = "done";
      task.progress = 100;
      task.summary = summary;
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (!agent.completedTasks) agent.completedTasks = [];
      agent.completedTasks.push({
        id: task.id,
        title: task.title,
        summary: summary.slice(0, 500)
      });
      agent.currentTaskId = null;
      agent.threadId = null;
      await this.#persist();
      return task;
    });
  }
  async startTask(agentName, taskId) {
    return this.#lock.run(async () => {
      const agent = this.#data.agents[agentName];
      const task = this.getTask(taskId);
      if (!agent || !task) return null;
      if (task.assignee !== agentName) return null;
      if (agent.currentTaskId && agent.currentTaskId !== taskId) return null;
      if (task.status === "done" || task.status === "merged") return null;
      agent.currentTaskId = taskId;
      task.status = "active";
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.#persist();
      return task;
    });
  }
  // ─── Phase ───
  async setPhase(phase) {
    return this.#lock.run(async () => {
      this.#data.phase = phase;
      await this.#persist();
    });
  }
  // ─── Merge History ───
  async recordMerge(agentName, result) {
    return this.#lock.run(async () => {
      this.#data.merges.push({
        agent: agentName,
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        success: result.success,
        conflicted: result.conflicted || false,
        message: result.message || ""
      });
      await this.#persist();
    });
  }
  // ─── Snapshot for Agent Consumption ───
  toBoardView() {
    const lines = [];
    lines.push(`# \u5DE5\u4F5C\u9762\u677F`);
    lines.push(`\u9636\u6BB5: ${this.#data.phase} | \u66F4\u65B0: ${this.#data.updatedAt}`);
    lines.push("");
    if (this.#data.goal) {
      lines.push(`## \u76EE\u6807`);
      lines.push(this.#data.goal);
      lines.push("");
    }
    lines.push(`## \u56E2\u961F`);
    for (const [name, a2] of Object.entries(this.#data.agents)) {
      const taskCount = this.#data.tasks.filter((t) => t.assignee === name).length;
      lines.push(`- ${name} [${a2.role}] ${a2.status} (${taskCount} tasks)`);
    }
    lines.push("");
    lines.push(`## \u4EFB\u52A1`);
    if (this.#data.tasks.length === 0) {
      lines.push("\uFF08\u5C1A\u65E0\u4EFB\u52A1\uFF09");
    }
    for (const t of this.#data.tasks) {
      const icon = t.status === "done" ? "\u2705" : t.status === "active" ? "\u{1F535}" : t.status === "merged" ? "\u{1F7E2}" : t.status === "blocked" ? "\u{1F534}" : "\u2B1C";
      const assignee = t.assignee || "\u672A\u5206\u914D";
      const progress = t.status === "active" ? ` ${t.progress}%` : "";
      lines.push(`${icon} #${t.id} ${t.title} \u2192 ${assignee}${progress} [${t.status}]`);
    }
    return lines.join("\n");
  }
  toJSON() {
    return this.#data;
  }
};

// src/lib/agents.mjs
import { existsSync as existsSync4 } from "node:fs";
import { readFile as readFile3, appendFile as appendFile2, mkdir as mkdir4 } from "node:fs/promises";
import { join as join3, resolve as resolve3 } from "node:path";

// src/lib/engines.mjs
import { resolve as resolve2, dirname as dirname3 } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// src/lib/logger.mjs
function log(level, msg) {
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").replace("Z", "");
  const line = `[${ts}] ${level} ${msg}`;
  if (level === "ERROR") console.error(line);
  else console.log(line);
}
function fatal(msg, code = 1) {
  log("ERROR", msg);
  process.exit(code);
}

// src/lib/engines.mjs
var __dirname = dirname3(fileURLToPath(import.meta.url));
function resolveCodexBinary() {
  const name = process.platform === "win32" ? "codex.exe" : "codex";
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    return execFileSync(cmd, [name], {
      encoding: "utf-8",
      timeout: 3e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim().split("\n")[0];
  } catch {
    return null;
  }
}
var CODEX_MODE_MAP = {
  suggest: { approvalPolicy: "on-request" },
  "auto-edit": { approvalPolicy: "on-failure" },
  "full-auto": { approvalPolicy: "never" }
};
var CLAUDE_MODE_MAP = {
  suggest: "default",
  "auto-edit": "acceptEdits",
  "full-auto": "bypassPermissions"
};
var _sdkCache = { codex: null, claude: null, opencode: null };
async function loadSdks({ needsCodex, needsClaude, needsOpencode }, dryRun) {
  const sdks = { codex: null, claude: null, opencode: null };
  if (dryRun) return sdks;
  if (needsCodex && !_sdkCache.codex) {
    try {
      const mod = await Promise.resolve().then(() => (init_dist(), dist_exports));
      const codexPathOverride = resolveCodexBinary();
      _sdkCache.codex = new mod.Codex(codexPathOverride ? { codexPathOverride } : {});
    } catch (err) {
      const pathBin = resolveCodexBinary();
      if (pathBin) {
        fatal(
          `Codex binary found at ${pathBin} but SDK failed to load: ${err.message}`
        );
      }
      fatal(
        `Cannot load @openai/codex-sdk: ${err.message}
  Install: npm install -g @openai/codex`
      );
    }
  }
  if (needsClaude && !_sdkCache.claude) {
    try {
      _sdkCache.claude = await Promise.resolve().then(() => (init_sdk(), sdk_exports));
    } catch (err) {
      fatal(
        `Cannot load @anthropic-ai/claude-agent-sdk: ${err.message}
  Run: cd ${resolve2(__dirname, "../..")} && npm install`
      );
    }
  }
  if (needsOpencode && !_sdkCache.opencode) {
    try {
      const mod = await import("@opencode-ai/sdk");
      const baseUrl = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
      const client = mod.createOpencodeClient({ baseUrl });
      await client.session.list();
      _sdkCache.opencode = client;
      log("INFO", `OpenCode client connected to ${baseUrl}`);
    } catch (err) {
      fatal(
        `Cannot connect to OpenCode: ${err.message}
  Ensure OpenCode is running (opencode) and accessible at ${process.env.OPENCODE_URL || "http://127.0.0.1:4096"}`
      );
    }
  }
  sdks.codex = _sdkCache.codex;
  sdks.claude = _sdkCache.claude;
  sdks.opencode = _sdkCache.opencode;
  return sdks;
}
async function runCodexSession(codex, prompt, { approvalMode, sandboxMode, workingDirectory, onEvent }) {
  const sdkMode = CODEX_MODE_MAP[approvalMode] || CODEX_MODE_MAP["suggest"];
  const thread = codex.startThread({
    approvalPolicy: sdkMode.approvalPolicy,
    sandboxMode: sandboxMode || "danger-full-access",
    workingDirectory
  });
  let finalResponse = "";
  let usage = null;
  const streamed = await thread.runStreamed(prompt);
  for await (const event of streamed.events) {
    const fmt = formatCodexEvent(event);
    if (fmt && onEvent) onEvent(fmt);
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text || "";
    }
    if (event.type === "turn.completed") {
      usage = event.usage || null;
    }
    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "turn.failed");
    }
  }
  return { finalResponse, usage, threadId: thread.id };
}
async function resumeCodexSession(codex, threadId, prompt, { approvalMode, sandboxMode, workingDirectory, onEvent }) {
  const sdkMode = CODEX_MODE_MAP[approvalMode] || CODEX_MODE_MAP["suggest"];
  const thread = codex.resumeThread(threadId, {
    approvalPolicy: sdkMode.approvalPolicy,
    sandboxMode: sandboxMode || "danger-full-access",
    workingDirectory
  });
  let finalResponse = "";
  let usage = null;
  const streamed = await thread.runStreamed(prompt);
  for await (const event of streamed.events) {
    const fmt = formatCodexEvent(event);
    if (fmt && onEvent) onEvent(fmt);
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text || "";
    }
    if (event.type === "turn.completed") {
      usage = event.usage || null;
    }
    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "turn.failed");
    }
  }
  return { finalResponse, usage, threadId: thread.id };
}
async function runClaudeSession(sdk, prompt, { approvalMode, workingDirectory, onEvent }) {
  const permissionMode = CLAUDE_MODE_MAP[approvalMode] || CLAUDE_MODE_MAP["full-auto"];
  let finalResponse = "";
  let accumulatedText = "";
  let usage = null;
  const opts = {
    cwd: workingDirectory,
    permissionMode,
    systemPrompt: { type: "preset", preset: "claude_code" },
    disallowedTools: ["ToolSearch"],
    settingSources: ["user", "project"],
    maxTurns: 50
  };
  if (permissionMode === "bypassPermissions") {
    opts.allowDangerouslySkipPermissions = true;
  }
  const q = sdk.query({ prompt, options: opts });
  let sessionId = null;
  for await (const msg of q) {
    if (msg.session_id && !sessionId) sessionId = msg.session_id;
    if (msg.type === "system" && msg.subtype === "init") {
      if (onEvent) onEvent({ kind: "init", text: `init model=${msg.model}` });
    }
    if (msg.type === "assistant") {
      if (msg.error) {
        if (onEvent) onEvent({ kind: "error", text: `API error: ${msg.error}` });
        if (msg.error === "authentication_failed" || msg.error === "billing_error") {
          throw new Error(`Claude API error: ${msg.error}`);
        }
      }
      const textBlocks = msg.message?.content?.filter((b2) => b2.type === "text") || [];
      const toolBlocks = msg.message?.content?.filter((b2) => b2.type === "tool_use") || [];
      if (textBlocks.length > 0) {
        const text = textBlocks.map((b2) => b2.text).join(" ");
        accumulatedText += text + "\n";
        if (onEvent) onEvent({ kind: "msg", text: text.slice(0, 200).replace(/\n/g, " ") });
      }
      for (const tb of toolBlocks) {
        const toolName = tb.name || "tool";
        const input = typeof tb.input === "string" ? tb.input.slice(0, 80) : JSON.stringify(tb.input || {}).slice(0, 80);
        if (onEvent) onEvent({ kind: "cmd", text: `${toolName}: ${input}` });
      }
    }
    if (msg.type === "result") {
      if (msg.is_error) {
        const errors = msg.errors?.join("; ") || msg.subtype || "unknown error";
        if (onEvent) onEvent({ kind: "error", text: `Session error: ${errors}` });
        if (accumulatedText.trim()) {
          finalResponse = accumulatedText.trim();
        }
        break;
      }
      const u2 = msg.usage || {};
      usage = { input_tokens: u2.input_tokens || 0, cached_input_tokens: u2.cache_read_input_tokens || 0, output_tokens: u2.output_tokens || 0 };
      if (msg.result) {
        if (typeof msg.result === "string") {
          finalResponse = msg.result;
        } else if (Array.isArray(msg.result)) {
          const textParts = msg.result.filter((b2) => b2.type === "text");
          finalResponse = textParts.map((b2) => b2.text).join("\n") || "";
        }
      }
      if (!finalResponse && accumulatedText.trim()) {
        finalResponse = accumulatedText.trim();
      }
      if (onEvent) {
        onEvent({
          kind: "usage",
          text: `tokens in=${u2.input_tokens || 0} cached=${u2.cache_read_input_tokens || 0} out=${u2.output_tokens || 0}`
        });
      }
    }
  }
  return { finalResponse, usage, threadId: sessionId };
}
async function runOpencodeSession(client, prompt, { workingDirectory, onEvent }) {
  if (onEvent) onEvent({ kind: "init", text: `init model=opencode` });
  const sessionRes = await client.session.create({ query: { directory: workingDirectory } });
  if (sessionRes.error) throw new Error("OpenCode session.create failed: " + JSON.stringify(sessionRes.error));
  const sessionId = sessionRes.data.id;
  log("INFO", `OpenCode session created: ${sessionId}`);
  return _executeOpencodePrompt(client, sessionId, prompt, workingDirectory, onEvent);
}
async function resumeOpencodeSession(client, threadId, prompt, { workingDirectory, onEvent }) {
  if (onEvent) onEvent({ kind: "init", text: `resume opencode session=${threadId.slice(0, 20)}` });
  return _executeOpencodePrompt(client, threadId, prompt, workingDirectory, onEvent);
}
var OPENCODE_POLL_INTERVAL = 3e3;
var OPENCODE_TIMEOUT = 10 * 6e4;
async function _executeOpencodePrompt(client, sessionId, prompt, workingDirectory, onEvent) {
  const res = await client.session.promptAsync({
    path: { id: sessionId },
    query: { directory: workingDirectory },
    body: { parts: [{ type: "text", text: prompt }] }
  });
  if (res.error) throw new Error("OpenCode promptAsync failed: " + JSON.stringify(res.error));
  const start = Date.now();
  let lastReportedMsgCount = 0;
  while (Date.now() - start < OPENCODE_TIMEOUT) {
    await new Promise((r) => setTimeout(r, OPENCODE_POLL_INTERVAL));
    let msgs2;
    try {
      const msgsRes2 = await client.session.messages({ path: { id: sessionId } });
      msgs2 = msgsRes2.data || [];
    } catch {
      continue;
    }
    if (onEvent && msgs2.length > lastReportedMsgCount) {
      for (const msg of msgs2.slice(lastReportedMsgCount)) {
        if (msg.info?.role !== "assistant") continue;
        for (const p2 of msg.parts || []) {
          if (p2.type === "tool" && p2.state?.status === "completed") {
            const toolName = p2.tool || "tool";
            const input = JSON.stringify(p2.state?.input || {}).slice(0, 100);
            onEvent({ kind: "cmd", text: `${toolName}: ${input}` });
          }
          if (p2.type === "text" && p2.text) {
            onEvent({ kind: "msg", text: p2.text.slice(0, 200).replace(/\n/g, " ") });
          }
        }
      }
      lastReportedMsgCount = msgs2.length;
    }
    const assistantMsgs2 = msgs2.filter((m2) => m2.info?.role === "assistant");
    if (assistantMsgs2.length === 0) continue;
    const lastAssistant = assistantMsgs2[assistantMsgs2.length - 1];
    if (lastAssistant.info?.finish === "stop") {
      let finalResponse2 = "";
      const totalUsage = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };
      for (const msg of assistantMsgs2) {
        const parts = msg.parts || [];
        const textParts = parts.filter((p2) => p2.type === "text" && p2.text);
        if (textParts.length > 0) {
          finalResponse2 += textParts.map((p2) => p2.text).join("\n") + "\n";
        } else {
          const reasoning = parts.filter((p2) => p2.type === "reasoning" && p2.text);
          if (reasoning.length > 0) {
            finalResponse2 += reasoning.map((p2) => p2.text).join("\n") + "\n";
          }
        }
        const tokens = msg.info?.tokens || {};
        totalUsage.input_tokens += tokens.input || 0;
        totalUsage.output_tokens += tokens.output || 0;
        totalUsage.cached_input_tokens += tokens.cache?.read || 0;
      }
      finalResponse2 = finalResponse2.trim();
      if (onEvent) {
        onEvent({ kind: "usage", text: `tokens in=${totalUsage.input_tokens} cached=${totalUsage.cached_input_tokens} out=${totalUsage.output_tokens}` });
      }
      log("INFO", `OpenCode session ${sessionId} completed: ${assistantMsgs2.length} steps, ${totalUsage.output_tokens} output tokens`);
      return { finalResponse: finalResponse2, usage: totalUsage, threadId: sessionId };
    }
  }
  log("WARN", `OpenCode session ${sessionId} timed out after ${OPENCODE_TIMEOUT / 1e3}s`);
  const msgsRes = await client.session.messages({ path: { id: sessionId } });
  const msgs = msgsRes.data || [];
  const assistantMsgs = msgs.filter((m2) => m2.info?.role === "assistant");
  let finalResponse = "";
  for (const msg of assistantMsgs) {
    const parts = msg.parts || [];
    const textParts = parts.filter((p2) => p2.type === "text" && p2.text);
    if (textParts.length > 0) {
      finalResponse += textParts.map((p2) => p2.text).join("\n") + "\n";
    } else {
      const reasoning = parts.filter((p2) => p2.type === "reasoning" && p2.text);
      if (reasoning.length > 0) finalResponse += reasoning.map((p2) => p2.text).join("\n") + "\n";
    }
  }
  return { finalResponse: finalResponse.trim(), usage: { input_tokens: 0, output_tokens: 0 }, threadId: sessionId };
}
function formatCodexEvent(event) {
  if (!event || !event.type) return null;
  switch (event.type) {
    case "item.started":
      if (event.item?.type === "command_execution") {
        return { kind: "cmd", text: `cmd: ${String(event.item.command || "").slice(0, 200)}` };
      }
      if (event.item?.type === "file_change") {
        const files = event.item.changes?.map((c2) => `${c2.kind} ${c2.path}`).join(", ") || "file_change";
        return { kind: "file", text: files.slice(0, 200) };
      }
      if (event.item?.type === "agent_message") {
        const preview = String(event.item.text || "").replace(/\n/g, " ").slice(0, 200);
        return { kind: "msg", text: preview };
      }
      return null;
    case "item.completed":
      if (event.item?.type === "command_execution") {
        return { kind: "cmd_result", text: `cmd exit=${event.item.exit_code ?? "?"}` };
      }
      if (event.item?.type === "file_change") {
        return { kind: "file_result", text: `file_change ${event.item.status || ""}`.trim() };
      }
      return null;
    case "turn.completed": {
      const u2 = event.usage || {};
      return {
        kind: "usage",
        text: `tokens in=${u2.input_tokens ?? 0} cached=${u2.cached_input_tokens ?? 0} out=${u2.output_tokens ?? 0}`
      };
    }
    case "turn.failed":
      return { kind: "error", text: String(event.error?.message || "turn.failed").slice(0, 200) };
    default:
      return null;
  }
}

// src/lib/agents.mjs
async function wakeAgent(ctx, agentName, prompt) {
  const { board, meeting } = ctx;
  const agent = board.getAgent(agentName);
  if (!agent) throw new Error(`Agent not found: ${agentName}`);
  const workingDirectory = getAgentWorkingDirectory(ctx, agent);
  await board.updateAgent(agentName, { status: "running" });
  const logPath = join3(ctx.cwd, ".workshop", "logs", `${agentName}.log`);
  await mkdir4(join3(ctx.cwd, ".workshop", "logs"), { recursive: true });
  const onEvent = (fmt) => {
    const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${fmt.kind} ${fmt.text}
`;
    appendFile2(logPath, line, "utf-8").catch(() => {
    });
  };
  const engineOpts = {
    approvalMode: ctx.approvalMode,
    sandboxMode: ctx.sandboxMode,
    workingDirectory,
    onEvent
  };
  let result;
  try {
    const sdk = ctx.engine === "opencode" ? ctx.sdks.opencode : ctx.engine === "claude" ? ctx.sdks.claude : ctx.sdks.codex;
    const runFn = ctx.engine === "opencode" ? runOpencodeSession : ctx.engine === "claude" ? runClaudeSession : runCodexSession;
    result = await runFn(sdk, prompt, engineOpts);
  } catch (err) {
    const msg = err.message || String(err);
    log("ERROR", `${agentName}: session failed \u2014 ${msg}`);
    await board.updateAgent(agentName, { status: "idle", lastError: msg });
    await meeting.postEvent(`${agentName} \u7684\u4F1A\u8BDD\u5F02\u5E38\u7EC8\u6B62: ${msg.slice(0, 200)}`);
    return { ok: false, error: msg };
  }
  const output = result.finalResponse || "";
  const threadId = result.threadId || null;
  await board.updateAgent(agentName, {
    status: "idle",
    threadId,
    lastOutput: output.slice(0, 2e3)
  });
  await meeting.postEvent(`${agentName} \u7684\u4F1A\u8BDD\u7ED3\u675F\uFF0C\u8FDB\u5165\u7A7A\u95F2\u72B6\u6001`);
  const reportPath = join3(ctx.cwd, ".workshop", "reports", `${agentName}-${Date.now()}.md`);
  await mkdir4(join3(ctx.cwd, ".workshop", "reports"), { recursive: true });
  await writeTextAtomic(reportPath, `# ${agentName} Report

${output}
`);
  log("INFO", `${agentName}: session ended, status=idle, threadId=${threadId ? "yes" : "none"}`);
  return { ok: true, output, threadId, usage: result.usage };
}
async function resumeAgent(ctx, agentName, prompt) {
  const { board, meeting } = ctx;
  const agent = board.getAgent(agentName);
  if (!agent) throw new Error(`Agent not found: ${agentName}`);
  const workingDirectory = getAgentWorkingDirectory(ctx, agent);
  await board.updateAgent(agentName, { status: "running" });
  const logPath = join3(ctx.cwd, ".workshop", "logs", `${agentName}.log`);
  const onEvent = (fmt) => {
    const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${fmt.kind} ${fmt.text}
`;
    appendFile2(logPath, line, "utf-8").catch(() => {
    });
  };
  const engineOpts = {
    approvalMode: ctx.approvalMode,
    sandboxMode: ctx.sandboxMode,
    workingDirectory,
    onEvent
  };
  let result;
  try {
    const sdk = ctx.engine === "opencode" ? ctx.sdks.opencode : ctx.engine === "claude" ? ctx.sdks.claude : ctx.sdks.codex;
    const threadId2 = agent.threadId;
    if (threadId2 && ctx.engine === "codex") {
      result = await resumeCodexSession(sdk, threadId2, prompt, engineOpts);
    } else if (threadId2 && ctx.engine === "opencode") {
      result = await resumeOpencodeSession(sdk, threadId2, prompt, engineOpts);
    } else {
      const runFn = ctx.engine === "opencode" ? runOpencodeSession : ctx.engine === "claude" ? runClaudeSession : runCodexSession;
      result = await runFn(sdk, prompt, engineOpts);
    }
  } catch (err) {
    const msg = err.message || String(err);
    log("ERROR", `${agentName}: resume failed \u2014 ${msg}`);
    await board.updateAgent(agentName, { status: "idle", lastError: msg });
    await meeting.postEvent(`${agentName} \u7684\u4F1A\u8BDD\u5F02\u5E38\u7EC8\u6B62: ${msg.slice(0, 200)}`);
    return { ok: false, error: msg };
  }
  const output = result.finalResponse || "";
  const threadId = result.threadId || null;
  await board.updateAgent(agentName, {
    status: "idle",
    threadId,
    lastOutput: output.slice(0, 2e3)
  });
  await meeting.postEvent(`${agentName} \u7684\u4F1A\u8BDD\u7ED3\u675F\uFF0C\u8FDB\u5165\u7A7A\u95F2\u72B6\u6001`);
  const reportPath = join3(ctx.cwd, ".workshop", "reports", `${agentName}-${Date.now()}.md`);
  await writeTextAtomic(reportPath, `# ${agentName} Report

${output}
`);
  log("INFO", `${agentName}: resume ended, status=idle`);
  return { ok: true, output, threadId, usage: result.usage };
}
function getAgentWorkingDirectory(ctx, agent) {
  if (agent.role === "inspector" && ctx.integrationWorktreePath) {
    return ctx.integrationWorktreePath;
  }
  return agent.worktreeRel ? resolve3(ctx.cwd, agent.worktreeRel) : ctx.cwd;
}

// src/lib/prompts.mjs
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
function buildLeaderPrompt({ goal, board, meetingHistory, cwd, runId, agents }) {
  const boardView = board.toBoardView();
  const recentChat = formatRecentMessages(meetingHistory, 30);
  const workerList = agents.filter((a2) => a2.role === "worker").map((a2) => `- ${a2.name} (worktree: ${a2.worktreeRel || "main"}, branch: ${a2.branch || "N/A"})`).join("\n");
  const inspectorList = agents.filter((a2) => a2.role === "inspector").map((a2) => `- ${a2.name}`).join("\n") || "\uFF08\u65E0 Inspector\uFF09";
  return `\u4F60\u662F\u6280\u672F Leader\uFF0CSWE Team \u7684\u534F\u8C03\u8005\u3002\u4F60\u7684\u804C\u8D23\uFF1A

1. **\u5206\u89E3\u76EE\u6807** \u2014 \u5C06\u76EE\u6807\u62C6\u5206\u4E3A\u53EF\u72EC\u7ACB\u6267\u884C\u7684\u5782\u76F4\u4EFB\u52A1\uFF08\u6BCF\u4E2A\u4EFB\u52A1\u662F\u5B8C\u6574\u529F\u80FD\uFF1A\u6A21\u578B\u2192\u903B\u8F91\u2192\u9875\u9762\u2192\u6D4B\u8BD5\uFF09
2. **\u5206\u914D\u4EFB\u52A1** \u2014 \u5728\u5DE5\u4F5C\u9762\u677F\u4E0A\u521B\u5EFA\u4EFB\u52A1\u5E76\u5206\u914D\u7ED9 Worker
3. **\u76D1\u7763\u8FDB\u5EA6** \u2014 \u89C2\u5BDF\u9762\u677F\u548C\u4F1A\u8BAE\u5BA4\u52A8\u6001\uFF0C\u5728\u9700\u8981\u65F6\u4ECB\u5165
4. **\u53D1\u8D77\u8D28\u68C0** \u2014 \u6240\u6709 Worker \u5B8C\u6210\u540E\uFF0C\u5524\u9192 Inspector \u505A\u6574\u4F53\u8BC4\u4F30
5. **\u6700\u7EC8\u51B3\u7B56** \u2014 \u6839\u636E Inspector \u8BC4\u4F30\u51B3\u5B9A\u6536\u5DE5\u6216\u7EE7\u7EED

## \u901A\u4FE1\u65B9\u5F0F

\u4F60\u6709\u4EE5\u4E0B\u5DE5\u5177\u4E0E\u56E2\u961F\u6C9F\u901A\uFF1A

### \u4F1A\u8BAE\u5BA4\uFF08\u53EF\u901A\u8FC7 @agent \u76F4\u63A5\u901A\u77E5\u5BF9\u65B9\uFF09
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/meeting -H 'Content-Type: application/json' -d '{"from":"leader","content":"\u4F60\u7684\u6D88\u606F"}'
\`\`\`

### \u79C1\u4FE1\uFF08\u53EA\u6709\u5BF9\u65B9\u80FD\u770B\u5230\uFF09
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/dm -H 'Content-Type: application/json' -d '{"from":"leader","to":"worker-1","content":"\u4F60\u7684\u6D88\u606F"}'
\`\`\`

### \u5DE5\u4F5C\u9762\u677F\u64CD\u4F5C
\`\`\`bash
# \u521B\u5EFA\u4EFB\u52A1
curl -sX POST http://127.0.0.1:$PORT/board/task -H 'Content-Type: application/json' -d '{"title":"\u5B9E\u73B0\u9000\u8D27\u53D1\u8D27\u529F\u80FD","assignee":"worker-1"}'

# \u67E5\u770B\u9762\u677F
curl -s http://127.0.0.1:$PORT/board

# \u6307\u793A\u5408\u5E76\u67D0\u4E2A Worker \u7684\u5DE5\u4F5C
curl -sX POST http://127.0.0.1:$PORT/merge -H 'Content-Type: application/json' -d '{"agent":"worker-1"}'

# \u5524\u9192 Inspector \u505A\u8D28\u68C0
curl -sX POST http://127.0.0.1:$PORT/wake -H 'Content-Type: application/json' -d '{"agent":"inspector"}'

# \u6536\u5DE5\uFF08\u7ED3\u675F\u6574\u4E2A\u8FD0\u884C\uFF09
curl -sX POST http://127.0.0.1:$PORT/done
\`\`\`

## \u5F53\u524D\u72B6\u6001

${boardView}

## \u56E2\u961F\u6210\u5458

### Workers
${workerList}

### Inspector
${inspectorList}

## \u4F1A\u8BAE\u5BA4\u52A8\u6001
${recentChat || "\uFF08\u5C1A\u65E0\u6D88\u606F\uFF09"}

## \u76EE\u6807
${goal}

## \u5DE5\u4F5C\u76EE\u5F55
${cwd}

\u73B0\u5728\u5F00\u59CB\u5DE5\u4F5C\u3002\u5206\u6790\u4EE3\u7801\u5E93\uFF0C\u5206\u89E3\u76EE\u6807\uFF0C\u5728\u9762\u677F\u4E0A\u521B\u5EFA\u4EFB\u52A1\u5E76\u5206\u914D\u7ED9 Workers\u3002`;
}
function buildWorkerPrompt({ agentName, board, meetingHistory, dmHistory, worktreePath, branch, goal }) {
  const boardView = board.toBoardView();
  const recentChat = formatRecentMessages(meetingHistory, 15);
  const recentDMs = formatRecentMessages(dmHistory, 10);
  const currentTask = board.getCurrentTask(agentName);
  const currentTaskView = currentTask ? `\u{1F535} #${currentTask.id} ${currentTask.title} [\u8FDB\u884C\u4E2D] ${currentTask.progress}%` : "\uFF08\u65E0\u5F53\u524D\u4EFB\u52A1\uFF09";
  const pendingTasks = board.getTasksForAgent(agentName).filter((t) => t.status === "pending");
  const pendingView = pendingTasks.length > 0 ? pendingTasks.map((t) => `\u2B1C #${t.id} ${t.title}`).join("\n") : "";
  const agent = board.getAgent(agentName);
  const completedTasks = agent?.completedTasks || [];
  const completedView = completedTasks.length > 0 ? completedTasks.map((t) => `\u2705 #${t.id} ${t.title}: ${t.summary}`).join("\n") : "";
  return `\u4F60\u662F\u5168\u6808\u5F00\u53D1\u5DE5\u5320 ${agentName}\uFF08\u4F60\u7684\u540D\u5B57\u5C31\u662F ${agentName}\uFF0C\u961F\u53CB\u548C Leader \u4F1A\u7528\u8FD9\u4E2A\u540D\u5B57 @\u4F60\uFF09\u3002\u4F60\u4E00\u6B21\u53EA\u5904\u7406\u4E00\u4E2A\u4EFB\u52A1\u3002

## \u26A0\uFE0F \u4EA4\u4ED8\u7EAA\u5F8B\uFF08\u4E0D\u53EF\u8FDD\u53CD\uFF09

1. **\u5FC5\u987B git commit** \u2014 \u4EFB\u52A1\u5B8C\u6210\u524D\uFF0C\u5FC5\u987B\u5728\u4F60\u7684\u5206\u652F\u4E0A\u6267\u884C \`git add -A && git commit -m "\u63CF\u8FF0"\`
2. **\u5148 commit\uFF0C\u540E complete** \u2014 \u53EA\u6709 commit \u6210\u529F\u540E\uFF0C\u624D\u80FD\u8C03\u7528 /complete \u7AEF\u70B9
3. **\u4E0D\u8981 merge** \u2014 \u4F60\u53EA\u5728\u81EA\u5DF1\u7684\u5206\u652F\u4E0A commit\u3002\u5408\u5E76\u7531 Leader \u901A\u8FC7 Hub \u5DE5\u5177\u5B8C\u6210
4. **\u4E0D\u8981\u5207\u6362\u5206\u652F** \u2014 \u59CB\u7EC8\u4FDD\u6301\u5728\u4F60\u88AB\u5206\u914D\u7684\u5206\u652F \`${branch}\` \u4E0A\u5DE5\u4F5C
5. **commit message \u4F7F\u7528\u82F1\u6587** \u2014 \u683C\u5F0F: \`feat/fix/refactor(scope): description\`

## \u5F53\u524D\u4EFB\u52A1
${currentTaskView}

${completedView ? `## \u5DF2\u5B8C\u6210\u4EFB\u52A1\uFF08\u4E0A\u4E0B\u6587\u538B\u7F29\uFF09
${completedView}
` : ""}
${pendingView ? `## \u6392\u961F\u4E2D\u7684\u4EFB\u52A1\uFF08\u6682\u4E0D\u5904\u7406\uFF09
${pendingView}
` : ""}

## \u901A\u4FE1\u65B9\u5F0F

### \u4F1A\u8BAE\u5BA4\uFF08@agent \u901A\u77E5\u5BF9\u65B9\uFF09
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/meeting -H 'Content-Type: application/json' -d '{"from":"${agentName}","content":"\u4F60\u7684\u6D88\u606F"}'
\`\`\`

### \u79C1\u4FE1 Leader
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/dm -H 'Content-Type: application/json' -d '{"from":"${agentName}","to":"leader","content":"\u4F60\u7684\u6D88\u606F"}'
\`\`\`

### \u66F4\u65B0\u4EFB\u52A1\u8FDB\u5EA6
\`\`\`bash
curl -sX PATCH http://127.0.0.1:$PORT/board/task/${currentTask?.id || "TASK_ID"} -H 'Content-Type: application/json' -d '{"progress":50,"notes":"\u6A21\u578B\u5C42\u5B8C\u6210"}'
\`\`\`

### \u5B8C\u6210\u5F53\u524D\u4EFB\u52A1\uFF08\u5FC5\u987B\u5148 git commit\uFF01\uFF09
\`\`\`bash
# Step 1: \u5148 commit \u4F60\u7684\u4EE3\u7801
cd ${worktreePath} && git add -A && git commit -m "feat(scope): \u5B8C\u6210 XXX"

# Step 2: \u7136\u540E\u6807\u8BB0\u4EFB\u52A1\u5B8C\u6210
curl -sX POST http://127.0.0.1:$PORT/board/task/${currentTask?.id || "TASK_ID"}/complete -H 'Content-Type: application/json' -d '{"summary":"\u7B80\u8FF0\u4F60\u5B8C\u6210\u4E86\u4EC0\u4E48\u3001\u4FEE\u6539\u4E86\u54EA\u4E9B\u6587\u4EF6\u3001\u5173\u952E\u51B3\u7B56"}'
\`\`\`

### \u67E5\u770B\u9762\u677F
\`\`\`bash
curl -s http://127.0.0.1:$PORT/board
\`\`\`

## \u5DE5\u4F5C\u73AF\u5883
- \u5DE5\u4F5C\u76EE\u5F55: ${worktreePath}
- \u5206\u652F: ${branch}
- \u6240\u6709\u4EE3\u7801\u4FEE\u6539\u5728\u4F60\u7684 worktree \u4E2D\u5B8C\u6210\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u5176\u4ED6\u4EBA
- **\u91CD\u8981**: \u4EFB\u52A1\u4EE3\u7801\u5B8C\u6210\u540E\u5FC5\u987B git commit \u5230\u6B64\u5206\u652F

## \u5DE5\u4F5C\u9762\u677F
${boardView}

## \u4F1A\u8BAE\u5BA4\u52A8\u6001
${recentChat || "\uFF08\u5C1A\u65E0\u6D88\u606F\uFF09"}

${recentDMs ? `## Leader \u79C1\u4FE1
${recentDMs}` : ""}

## \u76EE\u6807
${goal}

\u5F00\u59CB\u5904\u7406\u5F53\u524D\u4EFB\u52A1\u3002\u5DE5\u4F5C\u6D41\u7A0B: \u7F16\u7801 \u2192 git commit \u2192 /complete\u3002
\u26A0\uFE0F \u6CA1\u6709 commit \u5C31 complete = \u5DE5\u4F5C\u4E22\u5931\u3002summary \u4F1A\u88AB\u7528\u4E8E\u4E0A\u4E0B\u6587\u538B\u7F29\u3002`;
}
async function buildInspectorPrompt({
  board,
  meetingHistory,
  goal,
  cwd,
  runId,
  baseSha,
  integrationWorktreePath
}) {
  const boardView = board.toBoardView();
  const recentChat = formatRecentMessages(meetingHistory, 20);
  let diffStat = "";
  try {
    const { stdout } = await execFileAsync("git", [
      "diff",
      "--stat",
      `${baseSha}..integration/${runId}`
    ], { cwd, maxBuffer: 512 * 1024 });
    diffStat = stdout.trim();
  } catch {
    diffStat = "\uFF08\u65E0\u6CD5\u83B7\u53D6 diff\uFF09";
  }
  return `\u4F60\u662F\u8D28\u68C0\u5B98\uFF08Inspector\uFF09\u3002\u4F60\u7684\u5DE5\u4F5C\u662F\u8BC4\u4F30\u5F53\u524D\u96C6\u6210\u4EE3\u7801\u662F\u5426\u6EE1\u8DB3\u539F\u59CB\u76EE\u6807\u3002

## \u8BC4\u4F30\u65B9\u6CD5

1. \u9605\u8BFB\u76EE\u6807\u548C\u4EFB\u52A1\u5206\u89E3
2. \u68C0\u67E5 integration \u5206\u652F\u7684\u4EE3\u7801\u53D8\u66F4
3. \u8FD0\u884C\u6784\u5EFA/\u7C7B\u578B\u68C0\u67E5
4. \u5BF9\u6BCF\u4E2A\u4EFB\u52A1\u8BC4\u4F30\u662F\u5426\u6709\u5BF9\u5E94\u5B9E\u73B0
5. \u53D1\u5E03\u8BC4\u4F30\u62A5\u544A\u5230\u4F1A\u8BAE\u5BA4

## \u901A\u4FE1\u65B9\u5F0F

### \u53D1\u5E03\u8BC4\u4F30\u62A5\u544A\u5230\u4F1A\u8BAE\u5BA4
\`\`\`bash
curl -sX POST http://127.0.0.1:$PORT/meeting -H 'Content-Type: application/json' -d '{"from":"inspector","content":"\u4F60\u7684\u8BC4\u4F30\u62A5\u544A"}'
\`\`\`

## \u539F\u59CB\u76EE\u6807
${goal}

## \u5DE5\u4F5C\u9762\u677F
${boardView}

## integration \u5206\u652F\u53D8\u66F4
\`\`\`
${diffStat}
\`\`\`

## \u4F1A\u8BAE\u5BA4\u52A8\u6001
${recentChat || "\uFF08\u5C1A\u65E0\u6D88\u606F\uFF09"}

## \u5DE5\u4F5C\u76EE\u5F55
${integrationWorktreePath || cwd}
integration \u5206\u652F: integration/${runId}

\u4F60\u5F53\u524D\u5E94\u5728 integration worktree \u4E2D\u505A\u53EA\u8BFB\u9A8C\u8BC1\uFF0C\u4E0D\u8981\u5207\u6362\u5230 worker \u5206\u652F\uFF0C\u4E5F\u4E0D\u8981\u5728\u8D28\u68C0\u8FC7\u7A0B\u4E2D\u63D0\u4EA4\u4EE3\u7801\u3002

\u8BF7\u8BC4\u4F30\uFF1A
1. \u76EE\u6807\u7684\u6BCF\u4E2A\u5B50\u9879\u662F\u5426\u90FD\u6709\u5BF9\u5E94\u5B9E\u73B0\uFF1F
2. \u4EE3\u7801\u8D28\u91CF\u662F\u5426\u8FBE\u5230\u53EF\u5408\u5E76\u6807\u51C6\uFF1F
3. \u6709\u54EA\u4E9B\u9700\u8981\u4FEE\u590D\u7684\u95EE\u9898\uFF1F\uFF08\u6309\u4E25\u91CD\u7A0B\u5EA6\u6392\u5217\uFF09
4. \u603B\u4F53\u7ED3\u8BBA

\u8BC4\u4F30\u5B8C\u6BD5\u540E\u5C06\u62A5\u544A\u53D1\u5230\u4F1A\u8BAE\u5BA4\u3002Leader \u4F1A\u6839\u636E\u4F60\u7684\u8BC4\u4F30\u505A\u6700\u7EC8\u51B3\u7B56\u3002`;
}
function buildResumePrompt({ agentName, meetingMessages, dmMessages, board }) {
  const parts = [];
  if (meetingMessages.length > 0) {
    const lines = meetingMessages.map((m2) => {
      const time = m2.ts?.split("T")[1]?.slice(0, 8) || "";
      return `${m2.from} (${time}): ${m2.content}`;
    });
    parts.push(`[\u4F1A\u8BAE\u5BA4\u66F4\u65B0 \xB7 ${meetingMessages.length} \u6761\u65B0\u6D88\u606F]

${lines.join("\n")}`);
  }
  if (dmMessages.length > 0) {
    const lines = dmMessages.map((m2) => {
      const time = m2.ts?.split("T")[1]?.slice(0, 8) || "";
      return `${m2.from} (${time}): ${m2.content}`;
    });
    parts.push(`[\u79C1\u4FE1 \xB7 ${dmMessages.length} \u6761\u65B0\u6D88\u606F]

${lines.join("\n")}`);
  }
  const boardView = board.toBoardView();
  parts.push(`[\u5F53\u524D\u9762\u677F]
${boardView}`);
  parts.push("\u7EE7\u7EED\u4F60\u7684\u5DE5\u4F5C\u3002\u5982\u679C\u6709\u56DE\u590D\u6216\u8FDB\u5C55\uFF0C\u76F4\u63A5\u8BF4\u51FA\u6765\u3002");
  return `---
${parts.join("\n\n")}
---`;
}
function formatRecentMessages(messages, limit = 20) {
  if (!messages || messages.length === 0) return null;
  const recent = messages.slice(-limit);
  return recent.map((m2) => {
    const time = m2.ts?.split("T")[1]?.slice(0, 8) || "";
    const prefix = m2.channel === "pipe" ? "[\u79C1\u4FE1] " : "";
    return `${prefix}${m2.from} (${time}): ${m2.content}`;
  }).join("\n");
}

// src/lib/integration.mjs
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { resolve as pathResolve } from "node:path";
var exec = promisify2(execFile2);
var GIT = "git";
async function createIntegrationBranch(cwd, runId, baseSha) {
  const branchName = `integration/${runId}`;
  const base = baseSha || "HEAD";
  await git(cwd, ["branch", branchName, base]);
  log("INFO", `Created integration branch: ${branchName} from ${base}`);
  return branchName;
}
function integrationBranchName(runId) {
  return `integration/${runId}`;
}
async function createIntegrationWorktree(cwd, runId, worktreeRootAbs) {
  const intBranch = integrationBranchName(runId);
  const intWorktreePath = pathResolve(worktreeRootAbs, "__integration__");
  await exec(GIT, ["worktree", "add", intWorktreePath, intBranch], { cwd });
  log("INFO", `Integration worktree: ${intWorktreePath}`);
  return intWorktreePath;
}
async function mergeRoleToIntegration(integrationWorktreePath, runId, role, roleBranch) {
  const intBranch = integrationBranchName(runId);
  try {
    await git(integrationWorktreePath, [
      "merge",
      "--no-ff",
      roleBranch,
      "-m",
      `merge: ${role} ticket completed`
    ]);
    log("INFO", `Merged ${roleBranch} \u2192 ${intBranch}`);
    return { success: true, conflicted: false, message: "Merged successfully" };
  } catch (mergeErr) {
    try {
      const { stdout: status } = await git(integrationWorktreePath, ["status", "--porcelain"]);
      if (status.includes("UU") || status.includes("AA")) {
        await git(integrationWorktreePath, ["merge", "--abort"]);
        log("WARN", `Merge conflict: ${roleBranch} \u2192 ${intBranch}`);
        return { success: false, conflicted: true, message: mergeErr.message };
      }
    } catch {
    }
    try {
      await git(integrationWorktreePath, ["merge", "--abort"]);
    } catch {
    }
    throw mergeErr;
  }
}
async function rebaseWorktreeOnIntegration(worktreePath, runId) {
  const intBranch = integrationBranchName(runId);
  try {
    await git(worktreePath, ["fetch", "."]);
    await git(worktreePath, ["rebase", intBranch]);
    log("INFO", `Rebased worktree ${worktreePath} onto ${intBranch}`);
    return { success: true, message: "Rebased successfully" };
  } catch (err) {
    try {
      await git(worktreePath, ["rebase", "--abort"]);
    } catch {
    }
    log("WARN", `Rebase failed for ${worktreePath}: ${err.message}`);
    return { success: false, conflicted: true, message: err.message };
  }
}
async function propagateToAllWorktrees(cwd, runId, state, excludeRole) {
  const roles = state.roles || {};
  const results = [];
  for (const [role, roleState] of Object.entries(roles)) {
    if (role === excludeRole) continue;
    if (!roleState.worktreeRel) continue;
    if (roleState.status !== "idle") continue;
    const worktreePath = pathResolve(cwd, roleState.worktreeRel);
    const result = await rebaseWorktreeOnIntegration(worktreePath, runId);
    results.push({ role, ...result });
  }
  return results;
}
async function git(cwd, args) {
  try {
    return await exec(GIT, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
  } catch (err) {
    err.message = `git ${args.join(" ")}: ${err.stderr || err.message}`;
    throw err;
  }
}

// src/lib/git_worktree.mjs
import { appendFile as appendFile3, mkdir as mkdir5, readFile as readFile4 } from "node:fs/promises";
import { existsSync as existsSync5, readFileSync as readFileSync2 } from "node:fs";
import { join as join4, resolve as resolve4 } from "node:path";
import { execFile as execFile3 } from "node:child_process";
import { promisify as promisify3 } from "node:util";
var execFileAsync2 = promisify3(execFile3);
function gitPath(worktreeAbs) {
  const dotGit = join4(worktreeAbs, ".git");
  if (!existsSync5(dotGit)) return null;
  try {
    const content = readFileSync2(dotGit, "utf-8").trim();
    if (content.startsWith("gitdir: ")) {
      return content.slice("gitdir: ".length);
    }
  } catch {
  }
  return dotGit;
}
async function appendWorktreeExcludePattern(worktreeAbs, pattern) {
  const gp = gitPath(worktreeAbs);
  if (!gp) return;
  const excludePath = join4(gp, "info", "exclude");
  await mkdir5(join4(gp, "info"), { recursive: true });
  if (existsSync5(excludePath)) {
    const content = await readFile4(excludePath, "utf-8");
    if (content.includes(pattern)) return;
  }
  await appendFile3(excludePath, `
${pattern}
`, "utf-8");
}
async function git2(cwd, args, { allowFailure } = {}) {
  try {
    const { stdout } = await execFileAsync2("git", args, { cwd });
    return String(stdout || "").trim();
  } catch (err) {
    if (allowFailure) return null;
    const msg = err?.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`git ${args.join(" ")} failed: ${msg}`);
  }
}
async function ensureGitRepo(cwd) {
  const out = await git2(cwd, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (out !== "true") throw new Error(`${cwd} is not a git repository`);
}
async function revParse(cwd, ref) {
  const out = await git2(cwd, ["rev-parse", ref]);
  return out.split("\n")[0].trim();
}
function safeBranchName(name) {
  if (/^[\w-]+$/.test(name)) return name;
  return encodeURIComponent(name);
}
async function createRoleWorktrees({ cwd, runId, baseSha, roles, worktreeRootAbs, dryRun }) {
  await ensureGitRepo(cwd);
  await mkdir5(worktreeRootAbs, { recursive: true });
  const results = {};
  for (const role of roles) {
    const safeName = safeBranchName(role);
    const branch = `team/${runId}/${safeName}`;
    const wtPath = join4(worktreeRootAbs, safeName);
    results[role] = { branch, worktreePath: wtPath };
    if (dryRun) continue;
    if (existsSync5(wtPath)) {
      throw new Error(`worktree path already exists: ${wtPath}`);
    }
    await git2(cwd, ["worktree", "add", "-b", branch, wtPath, baseSha]);
  }
  return results;
}

// src/lib/workshop.mjs
async function serve(cwd, opts) {
  const {
    runId,
    goal,
    roles,
    // ["leader", "worker:2", "inspector"]
    baseRef = "HEAD",
    engine = "codex",
    approvalMode = "full-auto",
    sandboxMode = "danger-full-access",
    port: requestedPort = 0,
    dryRun = false,
    maxPulses = 3
  } = opts;
  await ensureGitRepo(cwd);
  const baseSha = await revParse(cwd, baseRef);
  const expanded = expandRoles(roles);
  const workshopDir = join5(cwd, ".workshop");
  const meeting = new MeetingRoom(workshopDir);
  const board = new Board(workshopDir);
  await meeting.init();
  await board.init(runId, goal);
  const engineInfo = { needsCodex: engine === "codex", needsClaude: engine === "claude", needsOpencode: engine === "opencode" };
  const sdks = await loadSdks(engineInfo, dryRun);
  const worktreeRoot = join5(cwd, ".workshop", "worktrees", runId);
  let integrationWorktreePath = null;
  if (!dryRun) {
    await createIntegrationBranch(cwd, runId, baseSha);
    log("INFO", `Integration branch: integration/${runId}`);
    integrationWorktreePath = await createIntegrationWorktree(cwd, runId, worktreeRoot);
  }
  const workerRoles = expanded.filter((r) => r.role === "worker");
  if (!dryRun && workerRoles.length > 0) {
    const wtResults = await createRoleWorktrees({
      cwd,
      runId,
      baseSha,
      roles: workerRoles.map((r) => r.name),
      worktreeRootAbs: worktreeRoot,
      dryRun: false
    });
    for (const r of workerRoles) {
      const wt = wtResults[r.name];
      await board.registerAgent(r.name, {
        role: r.role,
        worktreeRel: relative(cwd, wt.worktreePath),
        branch: wt.branch
      });
      await appendWorktreeExcludePattern(wt.worktreePath, ".workshop*");
      await appendWorktreeExcludePattern(wt.worktreePath, ".teamwork.py");
      if (existsSync6(join5(wt.worktreePath, "package.json"))) {
        try {
          execSync2("npm install --prefer-offline --no-audit 2>/dev/null", {
            cwd: wt.worktreePath,
            timeout: 6e4
          });
          log("INFO", `Deps installed for ${r.name}`);
        } catch {
          log("WARN", `Deps install failed for ${r.name} (non-fatal)`);
        }
      }
    }
  }
  const leaderRole = expanded.find((r) => r.role === "leader");
  const leaderName = leaderRole?.name || "leader";
  if (leaderRole) await board.registerAgent(leaderName, { role: "leader" });
  const inspectorRoles = expanded.filter((r) => r.role === "inspector");
  for (const inspector of inspectorRoles) {
    await board.registerAgent(inspector.name, { role: inspector.role });
  }
  if (dryRun) {
    for (const r of workerRoles) {
      await board.registerAgent(r.name, { role: r.role });
    }
  }
  await board.setPhase("running");
  const ctx = {
    cwd,
    runId,
    goal,
    baseSha,
    engine,
    approvalMode,
    sandboxMode,
    dryRun,
    maxPulses,
    sdks,
    meeting,
    board,
    integrationWorktreePath
  };
  meeting.onMention = (agentName, newMsgs, triggerMsg) => {
    if (agentName === "__all__") {
      for (const [name, a2] of Object.entries(board.data.agents)) {
        if (a2.status === "idle" && name !== triggerMsg.from) {
          wakeAgentWithMeetingContext(ctx, name, newMsgs);
        }
      }
      return;
    }
    const agent = board.getAgent(agentName);
    if (!agent || agent.status === "running") return;
    log("INFO", `@${agentName} mentioned by ${triggerMsg.from} \u2192 auto-waking`);
    wakeAgentWithMeetingContext(ctx, agentName, newMsgs);
  };
  const server = createServer(async (req, resp) => {
    const url = new URL(req.url, "http://localhost");
    const path3 = url.pathname;
    const cors = { "Access-Control-Allow-Origin": "*" };
    const noStore = { "Cache-Control": "no-store" };
    const json = { "Content-Type": "application/json; charset=utf-8" };
    if (req.method === "OPTIONS") {
      resp.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      resp.end();
      return;
    }
    try {
      if (path3 === "/meeting" && req.method === "POST") {
        const body = await readBody(req);
        const { from, content } = body;
        if (!from || !content) return respond(resp, 400, { error: "from and content required" });
        const msg = await meeting.post(from, content);
        return respond(resp, 201, msg);
      }
      if (path3 === "/meeting" && req.method === "GET") {
        const since = parseInt(url.searchParams.get("since") || "0", 10);
        const all = await meeting.readAll();
        return respond(resp, 200, all.slice(since));
      }
      if (path3 === "/dm" && req.method === "POST") {
        const body = await readBody(req);
        const { from, to, content } = body;
        if (!from || !to || !content) return respond(resp, 400, { error: "from, to, content required" });
        const msg = await meeting.sendDM(from, to, content);
        return respond(resp, 201, msg);
      }
      if (path3 === "/dm" && req.method === "GET") {
        const a2 = url.searchParams.get("a") || "";
        const b2 = url.searchParams.get("b") || "";
        if (!a2 || !b2) return respond(resp, 400, { error: "a and b required" });
        const msgs = await meeting.readDMs(a2, b2);
        return respond(resp, 200, msgs);
      }
      if (path3 === "/board" && req.method === "GET") {
        const format = url.searchParams.get("format");
        if (format === "text") {
          resp.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors, ...noStore });
          resp.end(board.toBoardView());
          return;
        }
        return respond(resp, 200, board.toJSON());
      }
      if (path3 === "/board/task" && req.method === "POST") {
        const body = await readBody(req);
        const { title, assignee } = body;
        if (!title) return respond(resp, 400, { error: "title required" });
        const task = await board.addTask(title, assignee || null);
        return respond(resp, 201, task);
      }
      if (path3.startsWith("/board/task/") && req.method === "PATCH" && !path3.endsWith("/complete") && !path3.endsWith("/start")) {
        const taskId = parseInt(path3.split("/").pop(), 10);
        if (isNaN(taskId)) return respond(resp, 400, { error: "invalid task id" });
        const body = await readBody(req);
        const updated = await board.updateTask(taskId, body);
        if (!updated) return respond(resp, 404, { error: "task not found" });
        return respond(resp, 200, updated);
      }
      if (path3.match(/^\/board\/task\/\d+\/complete$/) && req.method === "POST") {
        const taskId = parseInt(path3.split("/")[3], 10);
        const body = await readBody(req);
        const { summary = "" } = body;
        const task = board.getTask(taskId);
        if (!task) return respond(resp, 404, { error: "task not found" });
        const agentName = task.assignee;
        if (!agentName) return respond(resp, 400, { error: "task has no assignee" });
        const currentTask = board.getCurrentTask(agentName);
        if (!currentTask || currentTask.id !== taskId) {
          return respond(resp, 409, {
            error: "task not current for agent",
            currentTaskId: currentTask?.id || null
          });
        }
        const completed = await board.completeCurrentTask(agentName, taskId, summary);
        if (!completed) return respond(resp, 409, { error: "task not current for agent" });
        await meeting.post(agentName, `\u4EFB\u52A1 #${completed.id} "${completed.title}" \u5B8C\u6210\u3002\u6458\u8981: ${summary}`);
        await meeting.postEvent(`${agentName} \u5B8C\u6210\u4EFB\u52A1 #${completed.id}\uFF0C\u8FDB\u5165\u7A7A\u95F2\uFF0C\u7B49\u5F85\u4E0B\u4E00\u4E2A\u4EFB\u52A1`);
        return respond(resp, 200, { ok: true, task: completed });
      }
      if (path3.match(/^\/board\/task\/\d+\/start$/) && req.method === "POST") {
        const taskId = parseInt(path3.split("/")[3], 10);
        const task = board.getTask(taskId);
        if (!task) return respond(resp, 404, { error: "task not found" });
        if (!task.assignee) return respond(resp, 400, { error: "task has no assignee" });
        const started = await board.startTask(task.assignee, taskId);
        if (!started) return respond(resp, 400, { error: "cannot start task" });
        return respond(resp, 200, { ok: true, task: started });
      }
      if (path3 === "/wake" && req.method === "POST") {
        const body = await readBody(req);
        const { agent: agentName, prompt: customPrompt } = body;
        if (!agentName) return respond(resp, 400, { error: "agent required" });
        const agentInfo = board.getAgent(agentName);
        if (!agentInfo) return respond(resp, 404, { error: `agent ${agentName} not found` });
        if (agentInfo.status === "running") return respond(resp, 409, { error: `${agentName} already running` });
        const prompt = customPrompt ? customPrompt.replace(/\$PORT/g, ctx.portStr || "") : await buildFreshPromptForAgent(ctx, agentName);
        respond(resp, 202, { ok: true, agent: agentName, action: "waking" });
        const agentCtx = { ...ctx };
        if (agentInfo.threadId) {
          resumeAgent(agentCtx, agentName, prompt).catch((err) => {
            log("ERROR", `resume ${agentName} failed: ${err.message}`);
          });
        } else {
          wakeAgent(agentCtx, agentName, prompt).catch((err) => {
            log("ERROR", `wake ${agentName} failed: ${err.message}`);
          });
        }
        return;
      }
      if (path3 === "/send" && req.method === "POST") {
        const body = await readBody(req);
        const { agent: agentName, content } = body;
        if (!agentName || !content) return respond(resp, 400, { error: "agent and content required" });
        const agentInfo = board.getAgent(agentName);
        if (!agentInfo) return respond(resp, 404, { error: `agent ${agentName} not found` });
        if (agentInfo.status === "running") return respond(resp, 409, { error: `${agentName} is busy` });
        respond(resp, 202, { ok: true, agent: agentName, action: "sending" });
        if (agentInfo.threadId) {
          const mtNew = await meeting.peekNew(agentName);
          const dmNew = await meeting.readNewDMs(agentName, "leader");
          const prompt = buildResumePrompt({
            agentName,
            meetingMessages: mtNew,
            dmMessages: [...dmNew, { from: "direct", ts: (/* @__PURE__ */ new Date()).toISOString(), content }],
            board
          });
          resumeAgent({ ...ctx }, agentName, prompt).catch((err) => {
            log("ERROR", `send to ${agentName} failed: ${err.message}`);
          });
        } else {
          const prompt = await buildFreshPromptForAgent(ctx, agentName, { directMessage: content });
          wakeAgent({ ...ctx }, agentName, prompt).catch((err) => {
            log("ERROR", `send to ${agentName} failed: ${err.message}`);
          });
        }
        return;
      }
      if (path3 === "/merge" && req.method === "POST") {
        const body = await readBody(req);
        const { agent: agentName } = body;
        if (!agentName) return respond(resp, 400, { error: "agent required" });
        const agentInfo = board.getAgent(agentName);
        if (!agentInfo || !agentInfo.branch) return respond(resp, 404, { error: `agent ${agentName} not found or no branch` });
        if (!ctx.integrationWorktreePath) return respond(resp, 500, { error: "integration worktree not initialized" });
        const result = await mergeRoleToIntegration(ctx.integrationWorktreePath, runId, agentName, agentInfo.branch);
        await board.recordMerge(agentName, result);
        if (result.success) {
          await meeting.postEvent(`${agentName} \u7684\u5DE5\u4F5C\u5DF2\u5408\u5E76\u5230 integration/${runId}`);
          result.propagation = await propagateMergeToIdleAgents(ctx, agentName);
        } else {
          await meeting.postEvent(`${agentName} \u7684\u5408\u5E76\u5931\u8D25: ${result.conflicted ? "\u51B2\u7A81" : result.message}`);
        }
        return respond(resp, 200, result);
      }
      if (path3 === "/done" && req.method === "POST") {
        await board.setPhase("completed");
        await meeting.postEvent("\u8FD0\u884C\u5DF2\u5B8C\u6210");
        stopping = true;
        return respond(resp, 200, { ok: true, signal: "COMPLETED" });
      }
      if (path3 === "/signal" && req.method === "GET") {
        const phase = board.data.phase;
        resp.writeHead(200, { "Content-Type": "text/plain", ...cors, ...noStore });
        resp.end(phase === "completed" ? "COMPLETED" : "RUNNING");
        return;
      }
      if (path3 === "/" || path3 === "/index.html") {
        const customPath = join5(cwd, ".workshop", "dashboard.html");
        let dashContent;
        if (existsSync6(customPath)) {
          dashContent = await readFile5(customPath, "utf-8");
        } else if (true) {
          dashContent = `<!DOCTYPE html>
<html lang="zh">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Workshop</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet">
    <style>
        :root {
            --bg: #07080a;
            --text: #f7f8f8;
            --t2: #a0a2a6;
            --t3: #787a7e;
            --t4: #3a3c40;
            --purple: #a78bfa;
            --purple-d: rgba(167, 139, 250, 0.14);
            --purple-g: rgba(167, 139, 250, 0.06);
            --green: #4ade80;
            --green-d: rgba(74, 222, 128, 0.14);
            --green-g: rgba(74, 222, 128, 0.06);
            --blue: #60a5fa;
            --blue-d: rgba(96, 165, 250, 0.14);
            --orange: #f59e0b;
            --orange-d: rgba(245, 158, 11, 0.14);
            --red: #ef4444;
            --red-d: rgba(239, 68, 68, 0.14);
            --ff: 'Inter', -apple-system, system-ui, sans-serif;
            --fm: 'JetBrains Mono', monospace;
            --ease: cubic-bezier(.22, .61, .36, 1);
            --r: 20px;
            --r-sm: 12px;
        }

        *,
        *::before,
        *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0
        }

        html {
            font-size: 16px;
            -webkit-font-smoothing: antialiased
        }

        body {
            font-family: var(--ff);
            color: var(--text);
            height: 100vh;
            overflow: hidden;
            background: var(--bg);
            line-height: 1.5
        }

        /* \u2550\u2550\u2550 Ambient scene \u2550\u2550\u2550 */
        .scene {
            position: fixed;
            inset: 0;
            z-index: 0;
            pointer-events: none
        }

        .amb {
            position: absolute;
            border-radius: 50%;
            filter: blur(120px);
            animation: drift 25s ease-in-out infinite alternate
        }

        .a1 {
            width: 650px;
            height: 450px;
            background: rgba(167, 139, 250, 0.055);
            top: -8%;
            left: 0
        }

        .a2 {
            width: 550px;
            height: 500px;
            background: rgba(74, 222, 128, 0.035);
            bottom: -5%;
            right: 0;
            animation-delay: -9s
        }

        .a3 {
            width: 750px;
            height: 300px;
            background: rgba(96, 165, 250, 0.03);
            top: 35%;
            left: 25%;
            animation-delay: -16s
        }

        @keyframes drift {
            0% {
                transform: translate(0, 0) scale(1)
            }

            100% {
                transform: translate(40px, 25px) scale(1.1)
            }
        }

        /* \u2550\u2550\u2550 Glass mixin \u2550\u2550\u2550 */
        .glass {
            position: relative;
            background: linear-gradient(160deg, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.018) 100%);
            backdrop-filter: blur(60px) saturate(1.3);
            -webkit-backdrop-filter: blur(60px) saturate(1.3);
            border: 1px solid rgba(255, 255, 255, 0.07);
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .glass::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            pointer-events: none;
            opacity: .022;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
            background-size: 128px
        }

        /* Lighter glass for nested elements */
        .glass-light {
            position: relative;
            background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012));
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        /* \u2550\u2550\u2550 L1: Nav capsule (top-left, floating) \u2550\u2550\u2550 */
        .nav {
            position: fixed;
            z-index: 10;
            top: 16px;
            left: 16px;
            border-radius: var(--r);
            padding: 5px;
            display: flex;
            gap: 2px
        }

        .nav-it {
            padding: 8px 18px;
            border-radius: 15px;
            cursor: pointer;
            font-size: .8125rem;
            font-weight: 500;
            color: var(--t2);
            transition: all .15s var(--ease);
            white-space: nowrap;
            position: relative;
            z-index: 1
        }

        .nav-it:hover {
            color: var(--text)
        }

        .nav-it.on {
            color: var(--text);
            background: rgba(255, 255, 255, .10);
            box-shadow: 0 2px 8px rgba(0, 0, 0, .2)
        }

        .nav-ct {
            font-family: var(--fm);
            font-size: .625rem;
            color: var(--t3);
            margin-left: 4px
        }

        /* \u2550\u2550\u2550 L2: Status strip (top-right, floating) \u2550\u2550\u2550 */
        .ss {
            position: fixed;
            z-index: 10;
            top: 16px;
            right: 292px;
            border-radius: var(--r);
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 14px
        }

        .ss-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: .8125rem;
            color: var(--t2)
        }

        .ss-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%
        }

        .ss-dot.on {
            background: var(--green);
            box-shadow: 0 0 8px var(--green-g)
        }

        .ss-dot.off {
            background: var(--red);
            animation: blink 1s infinite
        }

        .ss-v {
            font-family: var(--fm);
            font-weight: 500;
            color: var(--text)
        }

        .ss-l {
            font-size: .6875rem;
            color: var(--t3)
        }

        /* \u2550\u2550\u2550 L0: Content layer (full viewport, scrollable) \u2550\u2550\u2550 */
        .content {
            position: relative;
            z-index: 1;
            height: 100vh;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.04) transparent;
            padding: 84px 48px 48px;
            padding-right: 308px
        }

        .content-inner {
            max-width: 700px;
            margin: 0 auto
        }

        /* \u2500\u2500\u2500 Views: CRITICAL \u2014 only active view visible \u2500\u2500\u2500 */
        #v-activity,
        #v-tasks,
        #v-meeting {
            display: none
        }

        #v-activity.active {
            display: block
        }

        #v-tasks.active {
            display: block
        }

        #v-meeting.active {
            display: block
        }

        /* \u2500\u2500\u2500 Hero Goal Card \u2500\u2500\u2500 */
        .hero {
            border-radius: var(--r);
            padding: 32px;
            margin-bottom: 32px
        }

        .hero-label {
            font-size: .6875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .1em;
            color: var(--purple);
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 6px
        }

        .hero-label::before {
            content: '';
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--purple);
            box-shadow: 0 0 6px var(--purple-g)
        }

        .hero-title {
            font-size: 1.75rem;
            font-weight: 600;
            line-height: 1.4;
            letter-spacing: -.5px;
            word-break: break-word
        }

        .hero-body {
            font-size: .9375rem;
            color: var(--t2);
            line-height: 1.65;
            margin-top: 8px;
            word-break: break-word
        }

        /* \u2500\u2500\u2500 Scoped Markdown rendering \u2500\u2500\u2500 */
        .md h1,
        .md h2,
        .md h3,
        .md h4,
        .md h5,
        .md h6 {
            font-weight: 600;
            line-height: 1.4;
            margin: .4em 0 .2em;
            color: var(--text)
        }

        .md h1 {
            font-size: 1.125em
        }

        .md h2 {
            font-size: 1.0625em
        }

        .md h3,
        .md h4,
        .md h5,
        .md h6 {
            font-size: 1em
        }

        .md p {
            margin: .25em 0
        }

        .md ul,
        .md ol {
            padding-left: 1.4em;
            margin: .25em 0
        }

        .md li {
            margin: .15em 0
        }

        .md li::marker {
            color: var(--t3)
        }

        .md code {
            font-family: var(--fm);
            font-size: .875em;
            background: rgba(255, 255, 255, .06);
            padding: 1px 5px;
            border-radius: 3px
        }

        .md pre {
            margin: .4em 0;
            padding: 10px 12px;
            background: rgba(255, 255, 255, .04);
            border-radius: var(--r-sm);
            overflow-x: auto;
            border: 1px solid rgba(255, 255, 255, .04)
        }

        .md pre code {
            background: none;
            padding: 0;
            font-size: .8125em;
            line-height: 1.5
        }

        .md blockquote {
            border-left: 3px solid var(--purple-d);
            padding-left: 12px;
            color: var(--t3);
            margin: .3em 0;
            font-style: italic
        }

        .md strong {
            color: var(--text);
            font-weight: 600
        }

        .md em {
            font-style: italic
        }

        .md a {
            color: var(--purple);
            text-decoration: none
        }

        .md a:hover {
            text-decoration: underline
        }

        /* Hero body inherits normal .md styling at correct size */
        .hero-body.md h1 { font-size: 1.125em }
        .hero-body.md h2 { font-size: 1.0625em }
        .hero-body.md h3,
        .hero-body.md h4,
        .hero-body.md h5,
        .hero-body.md h6 { font-size: 1em }

        .hero-bar {
            margin-top: 20px;
            display: flex;
            align-items: center;
            gap: 12px
        }

        .hero-track {
            flex: 1;
            height: 4px;
            background: rgba(255, 255, 255, .04);
            border-radius: 2px;
            overflow: hidden
        }

        .hero-fill {
            height: 100%;
            border-radius: 2px;
            background: linear-gradient(90deg, var(--purple), var(--green));
            transition: width .6s var(--ease)
        }

        .hero-pct {
            font-family: var(--fm);
            font-size: .875rem;
            font-weight: 500;
            color: var(--t2);
            min-width: 80px;
            text-align: right
        }

        /* \u2500\u2500\u2500 Section heading \u2500\u2500\u2500 */
        .sh {
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: -.01em;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px
        }

        .sh::before {
            content: '';
            width: 3px;
            height: 14px;
            border-radius: 2px;
            background: var(--purple)
        }

        /* \u2500\u2500\u2500 Empty state (glass card with ghost content) \u2500\u2500\u2500 */
        .empty {
            border-radius: var(--r-sm);
            padding: 40px 24px;
            text-align: center
        }

        .empty-icon {
            margin-bottom: 12px;
            opacity: .35;
            display: flex;
            justify-content: center
        }

        .empty-icon svg {
            width: 32px;
            height: 32px;
            stroke: var(--t2);
            stroke-width: 1.5;
            fill: none
        }

        .empty-text {
            font-size: .9375rem;
            color: var(--t2)
        }

        .empty-sub {
            font-size: .8125rem;
            color: var(--t3);
            margin-top: 4px
        }

        /* \u2500\u2500\u2500 Activity items \u2500\u2500\u2500 */
        .ai {
            display: flex;
            gap: 14px;
            padding: 14px 0;
            animation: fadeUp .3s var(--ease)
        }

        .ai-av {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
            margin-top: 1px
        }

        .ai-av.leader {
            background: var(--blue-d);
            color: var(--blue)
        }

        .ai-av.worker {
            background: var(--green-d);
            color: var(--green)
        }

        .ai-av.inspector {
            background: var(--purple-d);
            color: var(--purple)
        }

        .ai-av.hub {
            background: rgba(255, 255, 255, .06);
            color: var(--t3)
        }

        .ai-av.master {
            background: var(--orange-d);
            color: var(--orange)
        }

        .ai-body {
            flex: 1;
            min-width: 0
        }

        .ai-head {
            display: flex;
            align-items: baseline;
            gap: 6px;
            flex-wrap: wrap
        }

        .ai-name {
            font-size: .875rem;
            font-weight: 600
        }

        .ai-time {
            font-size: .8125rem;
            color: var(--t3)
        }

        .ai-text {
            font-size: 1rem;
            color: var(--t2);
            line-height: 1.65;
            margin-top: 3px;
            word-break: break-word
        }

        .ai-text .hl {
            color: var(--purple);
            font-weight: 500
        }

        .se {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 0;
            font-size: .8125rem;
            color: var(--t3)
        }

        .se-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--t4);
            flex-shrink: 0
        }

        .se b {
            color: var(--t2);
            font-weight: 500
        }

        .sp {
            display: inline-flex;
            padding: 1px 8px;
            border-radius: 4px;
            font-size: .75rem;
            font-weight: 500
        }

        /* \u2500\u2500\u2500 Tasks \u2500\u2500\u2500 */
        .tk {
            border-radius: var(--r-sm);
            padding: 14px 16px;
            margin-bottom: 6px;
            transition: background .12s
        }

        .tk:hover {
            background: rgba(255, 255, 255, .015)
        }

        .tk-row {
            display: flex;
            align-items: flex-start;
            gap: 12px
        }

        .tk-dot {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 2px solid;
            flex-shrink: 0;
            margin-top: 2px;
            position: relative
        }

        .tk-dot.done,
        .tk-dot.merged {
            border-color: var(--purple);
            background: var(--purple)
        }

        .tk-dot.active {
            border-color: var(--orange);
            background: transparent
        }

        .tk-dot.active::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--orange)
        }

        .tk-dot.blocked {
            border-color: var(--red);
            background: var(--red)
        }

        .tk-dot.pending {
            border-color: var(--t4);
            background: transparent
        }

        .tk-main {
            flex: 1;
            min-width: 0
        }

        .tk-title {
            font-size: 1rem;
            font-weight: 500;
            line-height: 1.5;
            word-break: break-word
        }

        .tk-meta {
            font-size: .8125rem;
            color: var(--t3);
            margin-top: 3px;
            display: flex;
            gap: 10px
        }

        .tk-meta .who {
            color: var(--t2);
            font-weight: 500
        }

        .tk-notes {
            font-size: .9375rem;
            color: var(--t2);
            margin-top: 10px;
            line-height: 1.6;
            word-break: break-word;
            padding: 12px 16px;
            border-radius: var(--r-sm);
            background: rgba(255, 255, 255, .025);
            border: 1px solid rgba(255, 255, 255, .04)
        }

        .tk-summary {
            font-size: .875rem;
            color: var(--t3);
            margin-top: 8px;
            line-height: 1.5;
            font-style: italic
        }

        .tk-prog {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px
        }

        .tpb {
            width: 140px;
            height: 3px;
            background: rgba(255, 255, 255, .04);
            border-radius: 2px;
            overflow: hidden
        }

        .tpf {
            height: 100%;
            border-radius: 2px;
            transition: width .5s var(--ease)
        }

        .tpf.active {
            background: var(--orange)
        }

        .tpf.done {
            background: var(--purple)
        }

        .tp-pct {
            font-family: var(--fm);
            font-size: .75rem;
            color: var(--t3)
        }

        /* \u2500\u2500\u2500 Messages \u2500\u2500\u2500 */
        .mg {
            display: flex;
            gap: 14px;
            padding: 14px 0;
            border-bottom: 1px solid rgba(255, 255, 255, .03);
            animation: fadeUp .3s var(--ease)
        }

        .mg:last-child {
            border-bottom: none
        }

        .mg-av {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0
        }

        .mg-av.leader {
            background: var(--blue-d);
            color: var(--blue)
        }

        .mg-av.hub {
            background: rgba(255, 255, 255, .06);
            color: var(--t3)
        }

        .mg-av.inspector {
            background: var(--purple-d);
            color: var(--purple)
        }

        .mg-av.worker {
            background: var(--green-d);
            color: var(--green)
        }

        .mg-av.master {
            background: var(--orange-d);
            color: var(--orange)
        }

        .mg-body {
            flex: 1;
            min-width: 0
        }

        .mg-hd {
            display: flex;
            align-items: baseline;
            gap: 6px;
            margin-bottom: 3px
        }

        .mg-who {
            font-size: .875rem;
            font-weight: 600
        }

        .mg-who.leader {
            color: var(--blue)
        }

        .mg-who.hub {
            color: var(--t3);
            font-weight: 400;
            font-style: italic
        }

        .mg-who.inspector {
            color: var(--purple)
        }

        .mg-who.worker,
        .mg-who.master {
            color: var(--text)
        }

        .mg-ts {
            font-size: .8125rem;
            color: var(--t3)
        }

        .mg-at {
            font-size: .75rem;
            font-weight: 500;
            color: var(--purple);
            background: var(--purple-d);
            padding: 1px 7px;
            border-radius: 4px
        }

        .mg-text {
            font-size: 1rem;
            color: var(--t2);
            line-height: 1.65;
            word-break: break-word
        }

        .mg-text .hl {
            color: var(--purple);
            font-weight: 500
        }

        /* \u2550\u2550\u2550 L3: Team panel (right side, OVERLAPPING content) \u2550\u2550\u2550 */
        .tp {
            position: fixed;
            z-index: 20;
            top: 16px;
            right: 16px;
            bottom: 16px;
            width: 260px;
            border-radius: var(--r);
            padding: 20px 14px;
            overflow-y: auto;
            scrollbar-width: none;
            display: flex;
            flex-direction: column
        }

        .tp::-webkit-scrollbar {
            display: none
        }

        .tp-label {
            font-size: .6875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: var(--t3);
            margin-bottom: 8px;
            padding: 0 6px
        }

        .tp-sep {
            height: 1px;
            background: rgba(255, 255, 255, .035);
            margin: 12px 0
        }

        .tp-phase {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 6px;
            font-size: .875rem
        }

        .phase-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%
        }

        .tp-progress {
            padding: 0 6px;
            margin-top: 10px
        }

        .tpp-bar {
            height: 3px;
            background: rgba(255, 255, 255, .04);
            border-radius: 2px;
            overflow: hidden
        }

        .tpp-fill {
            height: 100%;
            border-radius: 2px;
            background: linear-gradient(90deg, var(--purple), var(--green));
            transition: width .6s var(--ease)
        }

        .tpp-lbl {
            font-size: .6875rem;
            color: var(--t3);
            margin-top: 3px
        }

        /* Agent cards in team panel */
        .ag-list {
            display: flex;
            flex-direction: column;
            gap: 2px
        }

        .ag {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 7px 8px;
            border-radius: var(--r-sm);
            transition: background .12s
        }

        .ag:hover {
            background: rgba(255, 255, 255, .04)
        }

        .ag-d {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            flex-shrink: 0
        }

        .ag-d.idle {
            background: var(--t4)
        }

        .ag-d.running {
            background: var(--green);
            box-shadow: 0 0 8px var(--green-g);
            animation: pulse 2s ease-in-out infinite
        }

        .ag-d.done {
            background: var(--purple);
            box-shadow: 0 0 6px var(--purple-g)
        }

        .ag-info {
            flex: 1;
            min-width: 0
        }

        .ag-n {
            font-size: .8125rem;
            font-weight: 500
        }

        .ag-a {
            font-size: .75rem;
            color: var(--t3);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px
        }

        .ag-a.live {
            color: var(--green)
        }

        .ag-t {
            font-family: var(--fm);
            font-size: .625rem;
            color: var(--t4);
            flex-shrink: 0
        }

        /* Spotlight \u2014 glass-in-glass */
        .spot {
            margin-top: 12px;
            border-radius: var(--r-sm);
            overflow: hidden;
            position: relative;
            background: linear-gradient(160deg, rgba(255, 255, 255, .04), rgba(255, 255, 255, .015));
            border: 1px solid rgba(255, 255, 255, .05);
            box-shadow: 0 4px 16px rgba(0, 0, 0, .25), inset 0 1px 0 rgba(255, 255, 255, .05)
        }

        .spot-hd {
            padding: 10px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, .04);
            display: flex;
            align-items: center;
            gap: 8px
        }

        .spot-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%
        }

        .spot-name {
            font-weight: 600;
            font-size: .8125rem
        }

        .spot-body {
            padding: 12px 14px;
            font-size: .8125rem;
            color: var(--t2);
            line-height: 1.6
        }

        .spot-line {
            margin-bottom: 4px
        }

        .spot-line code {
            font-family: var(--fm);
            font-size: .75rem;
            background: rgba(255, 255, 255, .06);
            padding: 1px 6px;
            border-radius: 3px
        }

        .spot-status {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 8px;
            font-size: .8125rem;
            color: var(--t3)
        }

        .spot-spin {
            width: 14px;
            height: 14px;
            border: 2px solid var(--t4);
            border-top-color: var(--green);
            border-radius: 50%;
            animation: spin .8s linear infinite
        }

        /* Team empty state */
        .tp-empty {
            padding: 20px 0;
            text-align: center;
            font-size: .8125rem;
            color: var(--t3)
        }

        @keyframes pulse {

            0%,
            100% {
                opacity: 1;
                transform: scale(1)
            }

            50% {
                opacity: .35;
                transform: scale(.9)
            }
        }

        @keyframes blink {

            0%,
            100% {
                opacity: 1
            }

            50% {
                opacity: .3
            }
        }

        @keyframes spin {
            to {
                transform: rotate(360deg)
            }
        }

        @keyframes fadeUp {
            from {
                opacity: 0;
                transform: translateY(6px)
            }

            to {
                opacity: 1;
                transform: none
            }
        }

        @media(prefers-reduced-motion:reduce) {

            *,
            *::before,
            *::after {
                animation-duration: .01ms !important;
                transition-duration: .01ms !important
            }
        }
    </style>
</head>

<body>

    <div class="scene">
        <div class="amb a1"></div>
        <div class="amb a2"></div>
        <div class="amb a3"></div>
    </div>

    <!-- L1: Nav -->
    <nav class="nav glass" id="nav">
        <div class="nav-it on" data-v="activity">Activity</div>
        <div class="nav-it" data-v="tasks">Tasks<span class="nav-ct" id="nTasks"></span></div>
        <div class="nav-it" data-v="meeting">Meeting<span class="nav-ct" id="nMsgs"></span></div>
    </nav>

    <!-- L2: Status -->
    <div class="ss glass">
        <div class="ss-item">
            <div class="ss-dot on" id="connDot"></div><span id="connLbl">Live</span>
        </div>
        <div class="ss-item"><span class="ss-v" id="sDone">0</span><span class="ss-l">&nbsp;done</span></div>
        <div class="ss-item"><span class="ss-v" id="sAct">0</span><span class="ss-l">&nbsp;active</span></div>
        <div class="ss-item" style="font-family:var(--fm);font-size:.75rem;color:var(--t3)" id="clk"></div>
    </div>

    <!-- L0: Content -->
    <div class="content" id="scroll">
        <div class="content-inner">

            <!-- === ACTIVITY VIEW === -->
            <div id="v-activity" class="active">
                <div class="hero glass-light" id="heroCard">
                    <div class="hero-label">Goal</div>
                    <div class="hero-title" id="goalT">Waiting for goal\u2026</div>
                    <div class="hero-body md" id="goalBody" style="display:none"></div>
                    <div class="hero-bar">
                        <div class="hero-track">
                            <div class="hero-fill" id="hFill" style="width:0%"></div>
                        </div>
                        <div class="hero-pct" id="hPct">0%</div>
                    </div>
                </div>
                <div class="sh">Activity</div>
                <div id="actList">
                    <div class="empty glass-light">
                        <div class="empty-icon"><svg viewBox="0 0 24 24">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg></div>
                        <div class="empty-text">Waiting for events</div>
                        <div class="empty-sub">Agent activity and messages will appear here</div>
                    </div>
                </div>
            </div>

            <!-- === TASKS VIEW === -->
            <div id="v-tasks">
                <div class="sh">Tasks</div>
                <div id="taskList">
                    <div class="empty glass-light">
                        <div class="empty-icon"><svg viewBox="0 0 24 24">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg></div>
                        <div class="empty-text">No tasks yet</div>
                        <div class="empty-sub">Leader will decompose the goal into tasks</div>
                    </div>
                </div>
            </div>

            <!-- === MEETING VIEW === -->
            <div id="v-meeting">
                <div class="sh">Meeting Room</div>
                <div id="mvBody">
                    <div class="empty glass-light">
                        <div class="empty-icon"><svg viewBox="0 0 24 24">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg></div>
                        <div class="empty-text">No messages yet</div>
                        <div class="empty-sub">Agent communications will appear here</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- L3: Team Panel -->
    <aside class="tp glass">
        <div class="tp-label">Status</div>
        <div class="tp-phase">
            <div class="phase-dot" id="dtDot" style="background:var(--green);box-shadow:0 0 6px var(--green-g)"></div>
            <span id="dtPhase">Waiting</span>
        </div>
        <div class="tp-progress">
            <div class="tpp-bar">
                <div class="tpp-fill" id="dtFill" style="width:0%"></div>
            </div>
            <div class="tpp-lbl" id="dtPlbl">0 / 0 completed</div>
        </div>
        <div class="tp-sep"></div>
        <div class="tp-label">Team</div>
        <div class="ag-list" id="agList">
            <div class="tp-empty">No agents connected</div>
        </div>
        <div id="spotWrap"></div>
    </aside>

    <script>
        'use strict';
        let board = {}, prevBoard = null, tab = 'activity', cursor = 0, hasEvents = false;
        const MAX_ACT = 150, MAX_MSG = 300;
        const actEl = document.getElementById('actList'), mvEl = document.getElementById('mvBody');
        const ROLE_CLR = { leader: 'var(--blue)', worker: 'var(--green)', inspector: 'var(--purple)', hub: 'var(--t3)', master: 'var(--orange)' };

        // Nav \u2014 explicit ID-based toggle
        document.getElementById('nav').addEventListener('click', e => {
            const it = e.target.closest('.nav-it'); if (!it) return; const v = it.dataset.v;
            document.querySelectorAll('.nav-it').forEach(x => x.classList.remove('on'));
            it.classList.add('on');
            // Hide all views explicitly
            document.getElementById('v-activity').classList.remove('active');
            document.getElementById('v-tasks').classList.remove('active');
            document.getElementById('v-meeting').classList.remove('active');
            document.getElementById('v-' + v).classList.add('active');
            tab = v;
        });

        // SSE
        let retry = 1000;
        function connect() {
            const es = new EventSource('/events');
            es.onopen = () => { retry = 1000; const d = document.getElementById('connDot'); d.classList.add('on'); d.classList.remove('off'); document.getElementById('connLbl').textContent = 'Live' };
            es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.board) { prevBoard = structuredClone(board); board = d.board; render(); appendSys(diffBoard(prevBoard, board)) } } catch { } };
            es.onerror = () => { const d = document.getElementById('connDot'); d.classList.remove('on'); d.classList.add('off'); document.getElementById('connLbl').textContent = 'Offline'; es.close(); setTimeout(connect, Math.min(retry, 10000)); retry *= 2 }
        }
        connect();

        function diffBoard(p, c) {
            const ev = []; if (!p?.agents || !c?.agents) return ev;
            if (p.phase !== c.phase) ev.push({ h: \`Phase \u2192 <span class="sp" style="background:var(--green-d);color:var(--green)">\${c.phase}</span>\` });
            for (const [n, a] of Object.entries(c.agents)) {
                const pa = p.agents[n];
                if (!pa) { ev.push({ h: \`<b>\${esc(n)}</b> joined as \${a.role}\` }); continue }
                if (pa.status !== a.status) ev.push({ h: \`<b>\${esc(n)}</b> \u2192 <span class="sp" style="background:\${a.status === 'running' ? 'var(--green-d)' : 'var(--purple-d)'};color:\${a.status === 'running' ? 'var(--green)' : 'var(--purple)'}">\${a.status}</span>\` });
                if (pa.currentTaskId !== a.currentTaskId && a.currentTaskId) { const t = c.tasks?.find(x => x.id === a.currentTaskId); ev.push({ h: \`<b>\${esc(n)}</b> started <b>#\${a.currentTaskId}</b>\${t ? ' ' + esc(t.title) : ''}\`, ag: n }) }
            }
            const pt = new Map((p.tasks || []).map(t => [t.id, t]));
            for (const t of (c.tasks || [])) {
                const o = pt.get(t.id); if (!o) { ev.push({ h: \`New task <b>#\${t.id} \${esc(t.title)}</b>\` + (t.assignee ? \` \u2192 <b>\${esc(t.assignee)}</b>\` : '') }); continue }
                if (o.status !== t.status) ev.push({ h: \`<b>#\${t.id}</b> \u2192 <span class="sp" style="background:var(--purple-d);color:var(--purple)">\${t.status}</span>\` })
            }
            return ev
        }

        setInterval(() => { document.getElementById('clk').textContent = new Date().toLocaleTimeString('en-GB') }, 1000);

        function render() {
            const tasks = board.tasks || [], agents = Object.entries(board.agents || {});
            const done = tasks.filter(t => t.status === 'done' || t.status === 'merged').length;
            const active = tasks.filter(t => t.status === 'active').length;
            const total = tasks.length, pct = total > 0 ? Math.round(done / total * 100) : 0;

            // Hero \u2014 split goal into title (first line) + body (rest)
            const goalRaw = board.goal || 'Waiting for goal\u2026';
            const goalLines = goalRaw.split('\\n');
            // First non-empty line is the title; strip leading markdown heading markers
            let titleLine = '';
            let bodyStart = 0;
            for (let i = 0; i < goalLines.length; i++) {
                const trimmed = goalLines[i].trim();
                if (trimmed) {
                    titleLine = trimmed.replace(/^#{1,6}\\s+/, '');
                    bodyStart = i + 1;
                    break;
                }
            }
            document.getElementById('goalT').textContent = titleLine || 'Waiting for goal\u2026';
            const bodyLines = goalLines.slice(bodyStart).join('\\n').trim();
            const goalBodyEl = document.getElementById('goalBody');
            if (bodyLines) {
                goalBodyEl.innerHTML = renderMd(bodyLines);
                goalBodyEl.style.display = '';
            } else {
                goalBodyEl.innerHTML = '';
                goalBodyEl.style.display = 'none';
            }
            document.getElementById('hFill').style.width = pct + '%';
            document.getElementById('hPct').textContent = done + '/' + total + ' \xB7 ' + pct + '%';

            // Status strip
            document.getElementById('sDone').textContent = done;
            document.getElementById('sAct').textContent = active;
            document.getElementById('nTasks').textContent = total ? ' \xB7 ' + total : '';

            // Team panel
            const phase = board.phase || 'waiting';
            document.getElementById('dtPhase').textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
            const dot = document.getElementById('dtDot');
            dot.style.background = phase === 'completed' ? 'var(--purple)' : phase === 'error' ? 'var(--red)' : 'var(--green)';
            dot.style.boxShadow = \`0 0 6px \${phase === 'completed' ? 'var(--purple-g)' : phase === 'error' ? 'var(--red-d)' : 'var(--green-g)'}\`;
            document.getElementById('dtFill').style.width = pct + '%';
            document.getElementById('dtPlbl').textContent = \`\${done} / \${total} completed\`;

            // Agent list
            if (!agents.length) {
                document.getElementById('agList').innerHTML = '<div class="tp-empty">No agents connected</div>';
            } else {
                document.getElementById('agList').innerHTML = agents.map(([n, a]) => {
                    const task = a.currentTaskId ? tasks.find(t => t.id === a.currentTaskId) : null;
                    let act = 'Idle', cls = '';
                    if (a.status === 'running') { act = task ? \`#\${task.id} \${task.title}\` : a.role === 'leader' ? 'Coordinating\u2026' : 'Working\u2026'; cls = ' live' }
                    else if (a.status === 'done') act = 'Done';
                    const ago = a.lastSeen ? relTime(a.lastSeen) : '';
                    return \`<div class="ag"><div class="ag-d \${a.status || 'idle'}"></div><div class="ag-info"><div class="ag-n">\${esc(n)}</div><div class="ag-a\${cls}">\${esc(act)}</div></div><div class="ag-t">\${ago}</div></div>\`
                }).join('');
            }

            // Spotlight
            const running = agents.find(([, a]) => a.status === 'running');
            if (running) {
                const [n, a] = running; const task = a.currentTaskId ? tasks.find(t => t.id === a.currentTaskId) : null;
                document.getElementById('spotWrap').innerHTML = \`<div class="spot"><div class="spot-hd"><div class="spot-dot" style="background:\${ROLE_CLR[a.role]};box-shadow:0 0 4px \${ROLE_CLR[a.role]}"></div><span class="spot-name">\${esc(n)}</span></div><div class="spot-body">\${task ? \`<div class="spot-line">Working on <b>#\${task.id}</b></div><div class="spot-line"><code>\${esc(task.title)}</code></div>\` : \`<div class="spot-line">\${a.role === 'leader' ? 'Coordinating\u2026' : 'Processing\u2026'}</div>\`}<div class="spot-status"><div class="spot-spin"></div>Working</div></div></div>\`
            } else document.getElementById('spotWrap').innerHTML = '';

            // Tasks view
            const tEl = document.getElementById('taskList');
            if (!tasks.length) { tEl.innerHTML = '<div class="empty glass-light"><div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div><div class="empty-text">No tasks yet</div><div class="empty-sub">Leader will decompose the goal into tasks</div></div>' }
            else tEl.innerHTML = tasks.map(t => {
                const pv = Math.min(100, Math.max(0, t.progress || 0)), cls = t.status === 'done' || t.status === 'merged' ? 'done' : 'active';
                let ex = ''; if (t.notes) ex += \`<div class="tk-notes">\${esc(t.notes)}</div>\`;
                if (t.summary && (t.status === 'done' || t.status === 'merged')) ex += \`<div class="tk-summary">\${esc(t.summary)}</div>\`;
                let prog = ''; if (t.status === 'active' || pv > 0) prog = \`<div class="tk-prog"><div class="tpb"><div class="tpf \${cls}" style="width:\${pv}%"></div></div><span class="tp-pct">\${pv}%</span></div>\`;
                return \`<div class="tk glass-light"><div class="tk-row"><div class="tk-dot \${t.status || 'pending'}"></div><div class="tk-main"><div class="tk-title">\${esc(t.title || '')}</div><div class="tk-meta"><span class="who">\${esc(t.assignee || 'Unassigned')}</span><span>\${t.status}</span><span>#\${t.id}</span></div></div></div>\${ex}\${prog}</div>\`
            }).join('');
        }

        function appendSys(evs) {
            if (!evs.length) return;
            if (!hasEvents) { actEl.innerHTML = ''; hasEvents = true }
            const f = document.createDocumentFragment();
            for (const ev of evs) { const d = document.createElement('div'); d.className = 'se'; d.innerHTML = \`<div class="se-dot"></div><span>\${ev.h} \xB7 just now</span>\`; f.appendChild(d) }
            actEl.appendChild(f); while (actEl.children.length > MAX_ACT) actEl.removeChild(actEl.firstChild);
            if (tab === 'activity') document.getElementById('scroll').scrollTop = document.getElementById('scroll').scrollHeight
        }

        // Meeting
        let hasMsgs = false;
        async function poll() {
            try {
                const r = await fetch('/meeting?since=' + cursor); if (!r.ok) return; const msgs = await r.json(); if (!msgs.length) return;
                cursor += msgs.length; document.getElementById('nMsgs').textContent = ' \xB7 ' + cursor;
                if (!hasEvents) { actEl.innerHTML = ''; hasEvents = true }
                if (!hasMsgs) { mvEl.innerHTML = ''; hasMsgs = true }
                const fA = document.createDocumentFragment(), fM = document.createDocumentFragment();
                for (const m of msgs) {
                    const cls = m.from === 'leader' ? 'leader' : m.from === 'hub' ? 'hub' : m.from === 'inspector' ? 'inspector' : m.from === 'master' ? 'master' : 'worker';
                    const init = (m.from || '?')[0].toUpperCase(), ago = m.ts ? relTime(m.ts) : 'just now';
                    const ats = (m.mentions || []).map(n => \`<span class="mg-at">@\${esc(n)}</span>\`).join(' ');
                    const a = document.createElement('div'); a.className = 'ai';
                    a.innerHTML = \`<div class="ai-av \${cls}">\${init}</div><div class="ai-body"><div class="ai-head"><span class="ai-name">\${esc(m.from)}</span>\${ats}<span class="ai-time">\xB7 \${ago}</span></div><div class="ai-text md">\${hlAt(renderMd(m.content || ''))}</div></div>\`;
                    fA.appendChild(a);
                    const mv = document.createElement('div'); mv.className = 'mg';
                    mv.innerHTML = \`<div class="mg-av \${cls}">\${init}</div><div class="mg-body"><div class="mg-hd"><span class="mg-who \${cls}">\${esc(m.from)}</span>\${ats}<span class="mg-ts">\xB7 \${ago}</span></div><div class="mg-text md">\${hlAt(renderMd(m.content || ''))}</div></div>\`;
                    fM.appendChild(mv)
                }
                actEl.appendChild(fA); mvEl.appendChild(fM);
                while (actEl.children.length > MAX_ACT) actEl.removeChild(actEl.firstChild);
                while (mvEl.children.length > MAX_MSG) mvEl.removeChild(mvEl.firstChild);
                document.getElementById('scroll').scrollTop = document.getElementById('scroll').scrollHeight
            } catch { }
        }
        setInterval(poll, 2000);

        function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
        function hlAt(s) { return s.replace(/@([\\w-]+)/g, '<span class="hl">@$1</span>') }
        function relTime(iso) { const d = Date.now() - new Date(iso).getTime(); if (isNaN(d) || d < 0) return 'just now'; if (d < 60000) return Math.floor(d / 1000) + 's ago'; if (d < 3600000) return Math.floor(d / 60000) + ' min ago'; return Math.floor(d / 3600000) + 'h ago' }

        // Lightweight Markdown \u2192 HTML renderer (no deps)
        function renderMd(raw) {
            if (!raw) return '';
            const lines = raw.split('\\n');
            let html = '', inCode = false, codeLang = '', codeLines = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Fenced code block toggle
                if (/^\`\`\`/.test(line.trim())) {
                    if (!inCode) { inCode = true; codeLang = line.trim().slice(3); codeLines = []; continue }
                    else { html += \`<pre><code>\${esc(codeLines.join('\\n'))}</code></pre>\`; inCode = false; continue }
                }
                if (inCode) { codeLines.push(line); continue }
                // Blank line \u2192 paragraph break
                if (!line.trim()) { html += '<p></p>'; continue }
                // Headings
                const hm = line.match(/^(#{1,6})\\s+(.*)/);
                if (hm) { const lvl = hm[1].length; html += \`<h\${lvl}>\${inlineMd(esc(hm[2]))}</h\${lvl}>\`; continue }
                // Unordered list
                const ul = line.match(/^\\s*[-*]\\s+(.*)/);
                if (ul) { html += \`<ul><li>\${inlineMd(esc(ul[1]))}</li></ul>\`; continue }
                // Ordered list
                const ol = line.match(/^\\s*\\d+\\.\\s+(.*)/);
                if (ol) { html += \`<ul><li>\${inlineMd(esc(ol[1]))}</li></ul>\`; continue }
                // Blockquote
                if (line.trim().startsWith('>')) { html += \`<blockquote>\${inlineMd(esc(line.trim().replace(/^>\\s*/, '')))}</blockquote>\`; continue }
                // Normal paragraph line
                html += \`<p>\${inlineMd(esc(line))}</p>\`;
            }
            if (inCode && codeLines.length) html += \`<pre><code>\${esc(codeLines.join('\\n'))}</code></pre>\`;
            // Merge adjacent <ul> / <blockquote>
            html = html.replace(/<\\/ul><ul>/g, '').replace(/<\\/blockquote><blockquote>/g, '<br>');
            return html;
        }
        function inlineMd(s) {
            return s
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
                .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
        }
        render()
    </script>
</body>

</html>`;
        } else {
          const scriptDir = dirname4(fileURLToPath2(import.meta.url));
          const candidates = [
            join5(scriptDir, "dashboard.html"),
            join5(scriptDir, "..", "dashboard.html"),
            join5(scriptDir, "..", "..", "dashboard.html"),
            join5(scriptDir, "..", "..", "..", "..", "agent-swe-team", "dashboard.html"),
            join5(scriptDir, "..", "..", "..", "..", "agent-swe-team", "scripts", "dashboard.html")
          ];
          const dashPath = candidates.find((p2) => existsSync6(p2));
          if (!dashPath) {
            respond(resp, 404, "text/plain", "dashboard.html not found");
            return;
          }
          dashContent = await readFile5(dashPath, "utf-8");
        }
        resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...noStore });
        resp.end(dashContent);
        return;
      }
      if (path3 === "/events") {
        resp.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", ...cors, ...noStore });
        resp.flushHeaders();
        const snapshot = { type: "snapshot", board: board.toJSON() };
        resp.write(`data: ${JSON.stringify(snapshot)}

`);
        const hb = setInterval(() => resp.write(": ping\n\n"), 15e3);
        let lastUpdate = board.data.updatedAt;
        const poll = setInterval(async () => {
          await board.reload();
          if (board.data.updatedAt !== lastUpdate) {
            lastUpdate = board.data.updatedAt;
            resp.write(`data: ${JSON.stringify({ type: "update", board: board.toJSON() })}

`);
          }
        }, 3e3);
        req.on("close", () => {
          clearInterval(hb);
          clearInterval(poll);
        });
        return;
      }
      resp.writeHead(404, { ...noStore });
      resp.end("Not Found");
    } catch (err) {
      log("ERROR", `HTTP ${path3}: ${err.message}`);
      respond(resp, 500, { error: err.message });
    }
  });
  let stopping = false;
  const { port: actualPort } = await new Promise((res) => {
    server.listen(requestedPort, () => res({ port: server.address().port }));
  });
  const portStr = String(actualPort);
  await writeTextAtomic(join5(workshopDir, "port"), portStr);
  const dashUrl = `http://localhost:${actualPort}`;
  log("INFO", `Workshop Hub started: ${dashUrl}`);
  ctx.portStr = portStr;
  execCb(`open "${dashUrl}"`, (err) => {
    if (err) log("WARN", `Could not auto-open browser: ${err.message}`);
  });
  if (goal && !dryRun) {
    const leaderAgent = board.getAgent(leaderName);
    if (leaderAgent) {
      log("INFO", `Waking Leader (${leaderName}) with goal: "${goal.slice(0, 80)}"`);
      const prompt = await buildFreshPromptForAgent(ctx, leaderName);
      wakeAgent(ctx, leaderName, prompt).catch((err) => {
        log("ERROR", `Leader wake failed: ${err.message}`);
      });
    }
  }
  const tick = setInterval(async () => {
    if (stopping) {
      clearInterval(tick);
      log("INFO", "Shutting down...");
      server.close();
      process.exit(0);
    }
    await board.reload();
  }, 5e3);
  const shutdown = () => {
    stopping = true;
    clearInterval(tick);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2e3).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {
  });
}
async function wakeAgentWithMeetingContext(ctx, agentName, meetingMsgs) {
  const { board, meeting } = ctx;
  const agentInfo = board.getAgent(agentName);
  if (!agentInfo || agentInfo.status === "running") return;
  if (agentInfo.threadId) {
    const wrapped = meeting.wrapMessages(meetingMsgs, { label: "\u4F1A\u8BAE\u5BA4 @\u63D0\u53CA" });
    if (!wrapped) return;
    const prompt = `---
${wrapped}

\u7EE7\u7EED\u4F60\u7684\u5DE5\u4F5C\u3002\u6839\u636E\u65B0\u6D88\u606F\u51B3\u5B9A\u4E0B\u4E00\u6B65\u884C\u52A8\u3002
---`;
    const promptWithPort = prompt.replace(/\$PORT/g, ctx.portStr || "");
    resumeAgent(ctx, agentName, promptWithPort).catch((err) => {
      log("ERROR", `@mention resume ${agentName} failed: ${err.message}`);
    });
  } else {
    const prompt = await buildFreshPromptForAgent(ctx, agentName);
    wakeAgent(ctx, agentName, prompt).catch((err) => {
      log("ERROR", `@mention wake ${agentName} failed: ${err.message}`);
    });
  }
}
async function buildFreshPromptForAgent(ctx, agentName, { directMessage = "" } = {}) {
  const { board, meeting, goal, cwd, runId, baseSha, integrationWorktreePath } = ctx;
  let agentInfo = board.getAgent(agentName);
  if (!agentInfo) throw new Error(`agent ${agentName} not found`);
  if (agentInfo.role === "worker") {
    await board.ensureCurrentTask(agentName);
    agentInfo = board.getAgent(agentName);
  }
  const meetingHistory = await meeting.readAll();
  let prompt;
  if (agentInfo.role === "leader") {
    prompt = buildLeaderPrompt({
      goal,
      board,
      meetingHistory,
      cwd,
      runId,
      agents: Object.entries(board.data.agents).map(([name, info]) => ({ name, ...info }))
    });
  } else if (agentInfo.role === "inspector") {
    prompt = await buildInspectorPrompt({
      board,
      meetingHistory,
      goal,
      cwd,
      runId,
      baseSha,
      integrationWorktreePath: integrationWorktreePath || cwd
    });
  } else {
    const worktreePath = agentInfo.worktreeRel ? resolve5(cwd, agentInfo.worktreeRel) : cwd;
    const dmHistory = await meeting.readDMs("leader", agentName);
    prompt = buildWorkerPrompt({
      agentName,
      board,
      meetingHistory,
      dmHistory,
      worktreePath,
      branch: agentInfo.branch,
      goal
    });
  }
  prompt = prompt.replace(/\$PORT/g, ctx.portStr || "");
  if (directMessage) {
    prompt += `

## \u76F4\u63A5\u6D88\u606F
${directMessage}`;
  }
  return prompt;
}
async function propagateMergeToIdleAgents(ctx, mergedAgentName) {
  const { board, meeting, cwd, runId } = ctx;
  const state = collectRoleSyncState(board);
  const propagation = await propagateToAllWorktrees(cwd, runId, state, mergedAgentName);
  for (const sync of propagation) {
    const currentAgent = board.getAgent(sync.role);
    if (!currentAgent) continue;
    if (!sync.success) {
      await board.updateAgent(sync.role, {
        status: "blocked",
        lastError: sync.message
      });
      await meeting.postEvent(
        `${sync.role} \u4E0E integration/${runId} \u540C\u6B65\u5931\u8D25\uFF0C\u5DF2\u6807\u8BB0 blocked: ${String(sync.message || "").slice(0, 200)}`
      );
      continue;
    }
    if (currentAgent.status === "blocked") {
      await board.updateAgent(sync.role, { status: "idle", lastError: "" });
      await meeting.postEvent(`${sync.role} \u5DF2\u91CD\u65B0\u540C\u6B65\u5230 integration/${runId}\uFF0C\u53EF\u7EE7\u7EED\u5DE5\u4F5C`);
    }
  }
  return propagation;
}
function collectRoleSyncState(board) {
  const roles = {};
  for (const [name, agent] of Object.entries(board.data.agents)) {
    if (!agent.worktreeRel) continue;
    roles[name] = { worktreeRel: agent.worktreeRel, status: agent.status };
  }
  return { roles };
}
async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
function respond(resp, status, data) {
  resp.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  resp.end(JSON.stringify(data, null, 2));
}
var WORKER_NAMES = [
  "\u957F\u5E9A",
  "\u60CA\u86F0",
  "\u6276\u6447",
  "\u671B\u8212",
  "\u6816\u6850",
  "\u4E34\u6E0A",
  "\u7834\u6653",
  "\u77E5\u79CB",
  "\u542C\u96E8",
  "\u9010\u6D6A",
  "\u63FD\u6708",
  "\u8E0F\u96EA",
  "\u51ED\u680F",
  "\u6A2A\u6E20",
  "\u9752\u5D16",
  "\u6CA7\u6E9F",
  "\u70DB\u5F71",
  "\u5F52\u9E3F",
  "\u6DEC\u706B",
  "\u62FE\u5149"
];
var LEADER_NAMES = ["\u53F8\u5357"];
var INSPECTOR_NAMES = ["\u660E\u9274"];
function expandRoles(specs) {
  const result = [];
  let workerIdx = 0;
  for (const spec of specs) {
    const [name, countStr] = spec.split(":");
    const count = parseInt(countStr || "1", 10);
    const role = name === "leader" ? "leader" : name === "inspector" ? "inspector" : "worker";
    if (role === "leader") {
      result.push({ name: LEADER_NAMES[0], role });
    } else if (role === "inspector") {
      result.push({ name: INSPECTOR_NAMES[0], role });
    } else if (count <= 1) {
      const humanName = WORKER_NAMES[workerIdx++ % WORKER_NAMES.length];
      result.push({ name: humanName, role });
    } else {
      for (let i2 = 0; i2 < count; i2++) {
        const humanName = WORKER_NAMES[workerIdx++ % WORKER_NAMES.length];
        result.push({ name: humanName, role });
      }
    }
  }
  return result;
}

// src/team.mjs
import { join as join6 } from "node:path";
import { existsSync as existsSync7 } from "node:fs";
function generateRunId() {
  const d2 = /* @__PURE__ */ new Date();
  const pad = (n2) => String(n2).padStart(2, "0");
  return `${d2.getFullYear()}${pad(d2.getMonth() + 1)}${pad(d2.getDate())}-${pad(d2.getHours())}${pad(d2.getMinutes())}${pad(d2.getSeconds())}`;
}
async function main() {
  const { config: global2, rest } = parseGlobalArgs(process.argv, fatal);
  if (global2.help || rest.length === 0) {
    printUsage();
    return;
  }
  const cmd = rest[0];
  const args = rest.slice(1);
  switch (cmd) {
    case "serve": {
      const serveArgs = parseServeArgs(args, fatal);
      const runId = generateRunId();
      await serve(global2.cwd, {
        runId,
        goal: serveArgs.goal,
        roles: serveArgs.roles,
        baseRef: serveArgs.baseRef,
        engine: global2.engine,
        approvalMode: global2.approvalMode,
        sandboxMode: global2.sandboxMode,
        port: global2.port,
        dryRun: global2.dryRun,
        maxPulses: global2.maxPulses
      });
      return;
    }
    case "status": {
      const workshopDir = join6(global2.cwd, ".workshop");
      if (!existsSync7(join6(workshopDir, "board.json"))) {
        console.log("No active workshop found.");
        return;
      }
      const board = new Board(workshopDir);
      await board.init("?", "");
      console.log(board.toBoardView());
      return;
    }
    default:
      fatal(`Unknown command: ${cmd}. Use: serve | status`);
  }
}
main().catch((err) => fatal(err.stack || err.message));
