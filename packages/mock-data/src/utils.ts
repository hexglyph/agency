import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { slugify } from "./shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

export function resolveFromRoot(relativePath: string) {
  return path.resolve(PROJECT_ROOT, relativePath);
}

export function readTextFile(relativePath: string, encoding: BufferEncoding = "utf-8") {
  const absolutePath = resolveFromRoot(relativePath);
  return fs.readFileSync(absolutePath, { encoding });
}
