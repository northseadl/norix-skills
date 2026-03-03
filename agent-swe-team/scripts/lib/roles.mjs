import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Extract the base role type from an instance name.
 * "backend-1" → "backend", "backend-2" → "backend", "architect" → "architect"
 */
export function getRoleType(roleInstance) {
    const match = roleInstance.match(/^(.+)-\d+$/);
    return match ? match[1] : roleInstance;
}

export function roleTemplatePath(role) {
    const baseRole = getRoleType(role);
    return join(__dirname, "..", "..", "references", "roles", `${baseRole}.md`);
}

export async function loadRoleTemplate(role) {
    const p = roleTemplatePath(role);
    if (!existsSync(p)) {
        throw new Error(`role template not found: ${p} (role=${role}, type=${getRoleType(role)})`);
    }
    return await readFile(p, "utf-8");
}

