import fs from "node:fs";
import path from "node:path";
import { PLATFORM_CSS, renderIndex, renderNotFound } from "./catalog-page.ts";
import { formatIssue } from "./issue.ts";
import { assertSafeOutDir, isDirectRun, resolveSitePaths, type SitePaths } from "./site.ts";
import { discoverTopics } from "./topic.ts";
import type { CheckIssue, TopicFile, TopicMeta, TopicSource } from "./types.ts";

export type BuildResult =
  | { readonly ok: true; readonly topicCount: number }
  | { readonly ok: false; readonly issues: readonly CheckIssue[] };

export function buildSite(paths: SitePaths): BuildResult {
  assertSafeOutDir(paths);
  const discovered = discoverTopics({ topicsDir: paths.topicsDir, sharedDir: paths.sharedDir });
  if (discovered.issues.length > 0) return { ok: false, issues: discovered.issues };

  fs.rmSync(paths.outDir, { recursive: true, force: true });
  fs.mkdirSync(paths.outDir, { recursive: true });
  const topics = discovered.topics.map(toMeta);
  fs.writeFileSync(path.join(paths.outDir, "platform.css"), PLATFORM_CSS);
  fs.writeFileSync(path.join(paths.outDir, "index.html"), renderIndex({ topics }));
  fs.writeFileSync(path.join(paths.outDir, "404.html"), renderNotFound());
  fs.writeFileSync(path.join(paths.outDir, ".nojekyll"), "");
  for (const topic of discovered.topics) {
    copyFiles(topic.files, path.join(paths.outDir, "topics", topic.slug), (rel) => rel === "topic.json");
  }
  if (discovered.sharedFiles.length > 0) {
    copyFiles(discovered.sharedFiles, path.join(paths.outDir, "shared"), () => false);
  }
  return { ok: true, topicCount: topics.length };
}

function toMeta(topic: TopicSource): TopicMeta {
  return {
    slug: topic.slug,
    title: topic.title,
    summary: topic.summary,
    category: topic.category,
    tags: topic.tags,
  };
}

function copyFiles(files: readonly TopicFile[], destination: string, skip: (rel: string) => boolean): void {
  for (const file of files) {
    if (skip(file.rel)) continue;
    if (file.rel.split("/").includes("..")) throw new Error("拒绝复制越界路径");
    const target = path.resolve(destination, file.rel);
    const relative = path.relative(destination, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("拒绝复制越界路径");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.abs, target);
  }
}

if (isDirectRun(import.meta.url)) {
  try {
    const result = buildSite(resolveSitePaths(process.env));
    if (!result.ok) {
      for (const item of result.issues) console.error(formatIssue(item));
      process.exitCode = 1;
    } else {
      console.log(`已构建 ${result.topicCount} 个主题`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "构建失败");
    process.exitCode = 1;
  }
}
