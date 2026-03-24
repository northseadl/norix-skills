/**
 * Minimal colored logger to stderr.
 * Matches Python version's Log class output format for consistency.
 */

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const CYAN = "\x1b[0;36m";
const NC = "\x1b[0m";

function print(prefix: string, msg: string): void {
  process.stderr.write(`${prefix} ${msg}\n`);
}

export const Log = {
  info: (msg: string) => print(`${CYAN}[INFO]${NC}`, msg),
  ok: (msg: string) => print(`${GREEN}[OK]${NC}`, msg),
  warn: (msg: string) => print(`${YELLOW}[WARN]${NC}`, msg),
  error: (msg: string) => print(`${RED}[ERROR]${NC}`, msg),
};
