export function log(level, msg) {
    const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
    const line = `[${ts}] ${level} ${msg}`;
    if (level === "ERROR") console.error(line);
    else console.log(line);
}

export function fatal(msg, code = 1) {
    log("ERROR", msg);
    process.exit(code);
}

