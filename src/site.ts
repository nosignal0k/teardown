import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_PATH = "/teardown";
export const CATALOG_HREF = "/teardown/";

export const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export type SitePaths = {
  readonly root: string;
  readonly topicsDir: string;
  readonly sharedDir: string;
  readonly outDir: string;
};

export function isStrictInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === "" || path.isAbsolute(relative)) return false;
  return !relative.split(path.sep).includes("..");
}

export function resolveSitePaths(env: NodeJS.ProcessEnv): SitePaths {
  const root = envPath(env, "TEARDOWN_ROOT", repoRoot);
  return {
    root,
    topicsDir: envPath(env, "TEARDOWN_TOPICS_DIR", path.join(root, "topics")),
    sharedDir: envPath(env, "TEARDOWN_SHARED_DIR", path.join(root, "shared")),
    outDir: envPath(env, "TEARDOWN_OUT_DIR", path.join(root, "dist")),
  };
}

export function assertSafeOutDir(paths: SitePaths): void {
  const outDir = path.resolve(paths.outDir);
  const allowed = [paths.root, os.tmpdir()].some((parent) => isStrictInside(parent, outDir));
  if (!allowed) {
    throw new Error("输出目录必须位于仓库或临时目录之内");
  }
  const protectedDirs = [
    paths.root,
    paths.topicsDir,
    paths.sharedDir,
    path.join(paths.root, ".git"),
    path.join(paths.root, "src"),
    path.join(paths.root, "tests"),
  ];
  for (const protectedDir of protectedDirs) {
    if (!fs.existsSync(protectedDir) && protectedDir !== paths.topicsDir && protectedDir !== paths.sharedDir) {
      continue;
    }
    const target = path.resolve(protectedDir);
    if (outDir === target || isStrictInside(outDir, target)) {
      throw new Error("拒绝清空源码、主题或仓库目录");
    }
  }
}

export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry === "") return false;
  return path.resolve(entry) === fileURLToPath(metaUrl);
}

function envPath(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") return path.resolve(fallback);
  return path.resolve(value);
}
