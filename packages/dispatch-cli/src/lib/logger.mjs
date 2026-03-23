// Logger — timestamped console output with level routing

/**
 * @param {"INFO"|"WARN"|"ERROR"|"FATAL"|"SKIP"} level
 * @param  {...any} args
 */
export function log(level, ...args) {
    const time = new Date().toTimeString().slice(0, 8);
    const prefix = `[${time}] [${level}]`;
    if (level === "ERROR" || level === "FATAL") {
        console.error(prefix, ...args);
    } else {
        console.log(prefix, ...args);
    }
}

/**
 * Log a fatal error and exit.
 * @param {string} msg
 * @returns {never}
 */
export function fatal(msg) {
    log("FATAL", msg);
    process.exit(1);
}
