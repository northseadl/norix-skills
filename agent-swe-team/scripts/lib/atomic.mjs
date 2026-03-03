import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

async function ensureParentDir(filePath) {
    await mkdir(dirname(filePath), { recursive: true });
}

export async function writeTextAtomic(path, text) {
    await ensureParentDir(path);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, text, "utf-8");
    await rename(tmp, path);
}

export async function writeJsonAtomic(path, obj) {
    const text = JSON.stringify(obj, null, 2) + "\n";
    await writeTextAtomic(path, text);
}

