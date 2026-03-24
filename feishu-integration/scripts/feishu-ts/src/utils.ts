/**
 * Shared utilities.
 */

// ── Unified Output Protocol ─────────────────────────────────────────────────
// Every CLI command outputs exactly ONE JSON object to stdout.
// Agent parses stdout; Log.* goes to stderr (invisible to agent).

interface CliOutput {
  ok: boolean;
  data?: unknown;
  message?: string;
  hint?: string;
}

/**
 * Emit a success response to stdout and exit normally.
 */
export function respond(data: unknown, message?: string): never {
  const out: CliOutput = { ok: true };
  if (data !== undefined && data !== null) out.data = data;
  if (message) out.message = message;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(0);
}


/**
 * Emit an error response to stdout and exit with code 1.
 */
export function fail(message: string, hint?: string): never {
  const out: CliOutput = { ok: false, message };
  if (hint) out.hint = hint;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isoToTimestamp(dt: string): string {
  try {
    const parsed = new Date(dt);
    if (!isNaN(parsed.getTime())) {
      return String(Math.floor(parsed.getTime() / 1000));
    }
  } catch {
    // fall through
  }
  if (/^\d+$/.test(dt)) return dt;
  return dt;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse CLI arguments into a key-value map.
 * Supports --key value and --flag (boolean true).
 */
export function parseArgs(
  argv: string[]
): { command: string; args: Record<string, string>; positional: string[] } {
  const result: Record<string, string> = {};
  const positional: string[] = [];
  let command = "";
  let i = 0;

  // First positional arg is the command
  if (argv.length > 0 && !argv[0]!.startsWith("--")) {
    command = argv[0]!;
    i = 1;
  }

  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        result[key] = argv[i + 1]!;
        i += 2;
      } else {
        result[key] = "true";
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, args: result, positional };
}
