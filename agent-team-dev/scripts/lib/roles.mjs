import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function roleTemplatePath(role) {
    return join(__dirname, "..", "..", "references", "roles", `${role}.md`);
}

export async function loadRoleTemplate(role) {
    const p = roleTemplatePath(role);
    if (!existsSync(p)) {
        throw new Error(`role template not found: ${p}`);
    }
    return await readFile(p, "utf-8");
}

