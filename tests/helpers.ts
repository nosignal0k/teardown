import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { SitePaths } from "../src/site.ts";

export const CATALOG_LINK = '<a href="/teardown/" data-teardown-catalog>返回目录</a>';

export function tempSite(t: TestContext): SitePaths {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teardown-"));
  const topicsDir = path.join(root, "topics");
  fs.mkdirSync(topicsDir);
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    topicsDir,
    sharedDir: path.join(root, "shared"),
    outDir: path.join(root, "dist"),
  };
}

export function writeTopic(topicsDir: string, slug: string, meta: Record<string, unknown>, files: Record<string, string>): void {
  const directory = path.join(topicsDir, slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "topic.json"), `${JSON.stringify(meta, null, 2)}\n`);
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export function fileHashes(directory: string): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!fs.existsSync(directory)) return hashes;
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) {
        const rel = path.relative(directory, abs).split(path.sep).join("/");
        hashes.set(rel, crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex"));
      }
    }
  };
  visit(directory);
  return hashes;
}

export function sameHashes(left: Map<string, string>, right: Map<string, string>): boolean {
  const leftKeys = [...left.keys()].sort();
  const rightKeys = [...right.keys()].sort();
  if (leftKeys.join("\0") !== rightKeys.join("\0")) return false;
  return leftKeys.every((key) => left.get(key) === right.get(key));
}
