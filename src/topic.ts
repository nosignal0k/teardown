import fs from "node:fs";
import path from "node:path";
import { compareText, issue } from "./issue.ts";
import { inspectDirectory, scanTopic } from "./references.ts";
import type { CheckIssue, Discovery, TopicMeta, TopicSlug, TopicSource } from "./types.ts";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT_KEYS = ["title", "summary", "category"] as const;
const ALLOWED_KEYS = new Set<string>([...TEXT_KEYS, "tags"]);

export function isTopicSlug(value: string): value is TopicSlug {
  return SLUG_PATTERN.test(value);
}

export function parseSlug(value: string): TopicSlug | null {
  return isTopicSlug(value) ? value : null;
}

export function uniquenessIssues(slugs: readonly TopicSlug[]): CheckIssue[] {
  const seen = new Set<string>();
  const issues: CheckIssue[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) issues.push(issue("slug", slug, "slug 重复"));
    else seen.add(slug);
  }
  return issues;
}

export function parseTopicDocument(input: unknown, slug: TopicSlug): { ok: true; meta: TopicMeta } | { ok: false; issues: CheckIssue[] } {
  const issues: CheckIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [issue("metadata", slug, "topic.json 必须是对象")] };
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) issues.push(issue("metadata", slug, `含有未定义字段: ${key}`));
  }
  const texts: Partial<Record<(typeof TEXT_KEYS)[number], string>> = {};
  for (const key of TEXT_KEYS) {
    const value = readText(input[key], key, slug, issues);
    if (value !== null) texts[key] = value;
  }
  const tags = readTags(input.tags, slug, issues);
  if (issues.length > 0 || tags === null) return { ok: false, issues };
  const title = texts.title;
  const summary = texts.summary;
  const category = texts.category;
  if (title === undefined || summary === undefined || category === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, meta: { slug, title, summary, category, tags } };
}

export function discoverTopics(input: { topicsDir: string; sharedDir: string }): Discovery {
  const issues: CheckIssue[] = [];
  if (!fs.existsSync(input.topicsDir) || !fs.statSync(input.topicsDir).isDirectory()) {
    return { topics: [], sharedFiles: [], issues: [issue("topics-dir", "", "主题目录不存在")] };
  }

  let sharedFiles: TopicSource["files"] = [];
  if (fs.existsSync(input.sharedDir)) {
    if (!fs.statSync(input.sharedDir).isDirectory()) {
      issues.push(issue("file", "", "shared 必须是目录"));
    } else {
      const shared = inspectDirectory(input.sharedDir, "");
      sharedFiles = shared.files;
      issues.push(...shared.issues);
    }
  }

  const topics: TopicSource[] = [];
  const slugs: TopicSlug[] = [];
  const entries = fs.readdirSync(input.topicsDir, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      issues.push(issue("file", entry.name, "主题目录不能是符号链接"));
      continue;
    }
    if (!entry.isDirectory()) continue;
    const slug = parseSlug(entry.name);
    if (slug === null) {
      issues.push(issue("slug", entry.name, "目录名必须是小写字母、数字和连字符组成的 slug"));
      continue;
    }
    slugs.push(slug);
    const loaded = loadTopic(path.join(input.topicsDir, entry.name), slug, input.sharedDir);
    issues.push(...loaded.issues);
    if (loaded.topic !== null) topics.push(loaded.topic);
  }
  issues.push(...uniquenessIssues(slugs));
  topics.sort((left, right) => compareText(left.slug, right.slug));
  return { topics, sharedFiles, issues };
}

function loadTopic(root: string, slug: TopicSlug, sharedDir: string): { topic: TopicSource | null; issues: CheckIssue[] } {
  const issues: CheckIssue[] = [];
  let meta: TopicMeta | null = null;
  const jsonPath = path.join(root, "topic.json");
  if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
    issues.push(issue("metadata", slug, "缺少 topic.json"));
  } else {
    const parsed = readJson(jsonPath);
    if (!parsed.ok) issues.push(issue("metadata", slug, parsed.message));
    else {
      const document = parseTopicDocument(parsed.value, slug);
      if (document.ok) meta = document.meta;
      else issues.push(...document.issues);
    }
  }

  const inspected = inspectDirectory(root, slug);
  issues.push(...inspected.issues);
  issues.push(...scanTopic(inspected.files, root, slug, sharedDir));
  if (issues.length > 0 || meta === null) return { topic: null, issues };
  return { topic: { ...meta, root, files: inspected.files }, issues: [] };
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; message: string } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { ok: false, message: "无法读取 topic.json" };
  }
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false, message: "topic.json 不是合法 JSON" };
  }
}

function readText(value: unknown, key: string, slug: TopicSlug, issues: CheckIssue[]): string | null {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    issues.push(issue("metadata", slug, `${key} 必须是非空字符串，且不能有首尾空白`));
    return null;
  }
  if (/[\u0000-\u001F]/.test(value)) {
    issues.push(issue("metadata", slug, `${key} 含有控制字符`));
    return null;
  }
  return value;
}

function readTags(value: unknown, slug: TopicSlug, issues: CheckIssue[]): readonly string[] | null {
  if (!isUnknownArray(value)) {
    issues.push(issue("metadata", slug, "tags 必须是字符串数组"));
    return null;
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  let valid = true;
  for (const tag of value) {
    if (typeof tag !== "string" || tag.trim() === "" || tag !== tag.trim() || /[\u0000-\u001F]/.test(tag)) {
      issues.push(issue("metadata", slug, "标签必须是非空字符串，且不能有首尾空白或控制字符"));
      valid = false;
      continue;
    }
    if (seen.has(tag)) {
      issues.push(issue("metadata", slug, `标签重复: ${tag}`));
      valid = false;
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return valid ? tags : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
