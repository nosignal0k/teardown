import fs from "node:fs";
import path from "node:path";
import { compareText, issue } from "./issue.ts";
import { BASE_PATH, CATALOG_HREF } from "./site.ts";
import type { CheckIssue, TopicFile } from "./types.ts";

export const TOPIC_FILE_EXTENSIONS = [
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".txt",
  ".json",
  ".woff2",
] as const;

const ALLOWED = new Set<string>(TOPIC_FILE_EXTENSIONS);
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".svg", ".txt", ".json"]);

export function inspectDirectory(root: string, slug: string): { files: TopicFile[]; issues: CheckIssue[] } {
  const files: TopicFile[] = [];
  const issues: CheckIssue[] = [];
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const abs = path.join(directory, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (entry.name.startsWith(".")) {
        issues.push(issue("file", slug, `${rel} 是隐藏文件`));
        continue;
      }
      if (entry.isSymbolicLink()) {
        issues.push(issue("file", slug, `${rel} 是符号链接`));
        continue;
      }
      if (entry.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!entry.isFile()) {
        issues.push(issue("file", slug, `${rel} 不是普通文件`));
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!ALLOWED.has(extension)) {
        issues.push(issue("file", slug, `${rel} 的类型不在允许列表中`));
        continue;
      }
      files.push({ rel, abs });
    }
  };
  visit(root);
  return { files, issues };
}

export function scanTopic(files: readonly TopicFile[], topicRoot: string, slug: string, sharedDir: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const index = files.find((file) => file.rel === "index.html");
  if (index === undefined) {
    issues.push(issue("entry", slug, "缺少 index.html"));
  }
  for (const file of files) {
    const extension = path.extname(file.rel).toLowerCase();
    if (!TEXT.has(extension)) continue;
    const text = fs.readFileSync(file.abs, "utf8");
    if (file.rel === "index.html" && !hasCatalogLink(text)) {
      issues.push(issue("entry", slug, 'index.html 需要 href="/teardown/" 且带 data-teardown-catalog 的链接'));
    }
    if (text.includes("/teardown/topics/")) {
      issues.push(issue("reference", slug, `${file.rel} 引用了 /teardown/topics/，主题不能互相指向`));
    }
    for (const ref of extractRefs(extension, text)) {
      const problem = validateUrl(ref.url, ref.kind, file.abs, topicRoot, sharedDir, slug, file.rel);
      if (problem !== null) issues.push(problem);
    }
  }
  return issues;
}

type RefKind = "href" | "asset";

function hasCatalogLink(html: string): boolean {
  const tags = html.match(/<a\b[^>]*>/gi) ?? [];
  return tags.some((tag) => attribute(tag, "href") === CATALOG_HREF && /\bdata-teardown-catalog\b/i.test(tag));
}

function attribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function extractRefs(extension: string, text: string): { url: string; kind: RefKind }[] {
  if (extension === ".html" || extension === ".svg") return extractMarkup(text);
  if (extension === ".css") return extractCss(text);
  if (extension === ".js" || extension === ".mjs") return extractScripts(text);
  return [];
}

function extractMarkup(text: string): { url: string; kind: RefKind }[] {
  const refs: { url: string; kind: RefKind }[] = [];
  for (const match of text.matchAll(/<([a-zA-Z0-9:-]+)\b[^>]*>/g)) {
    const tag = match[0];
    const name = (match[1] ?? "").toLowerCase();
    const citation = name === "a" || name === "area";
    for (const attr of tag.matchAll(/\b(href|src|poster|action|srcset|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const attrName = (attr[1] ?? "").toLowerCase();
      const value = attr[2] ?? attr[3] ?? "";
      const kind: RefKind = citation && (attrName === "href" || attrName === "xlink:href") ? "href" : "asset";
      pushRef(refs, kind, attrName === "srcset" ? splitSrcset(value) : [value]);
    }
  }
  return refs;
}

function extractCss(text: string): { url: string; kind: RefKind }[] {
  const refs: { url: string; kind: RefKind }[] = [];
  for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    pushRef(refs, "asset", [match[1] ?? match[2] ?? match[3] ?? ""]);
  }
  for (const match of text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    pushRef(refs, "asset", [match[1] ?? match[2] ?? ""]);
  }
  return refs;
}

function extractScripts(text: string): { url: string; kind: RefKind }[] {
  const refs: { url: string; kind: RefKind }[] = [];
  const patterns = [
    /\bfrom\s*(?:"([^"]*)"|'([^']*)')/g,
    /\bimport\s*(?:"([^"]*)"|'([^']*)')/g,
    /\bimport\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g,
    /\bnew\s+URL\s*\(\s*(?:"([^"]*)"|'([^']*)')/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      pushRef(refs, "asset", [match[1] ?? match[2] ?? ""]);
    }
  }
  return refs;
}

function pushRef(refs: { url: string; kind: RefKind }[], kind: RefKind, urls: string[]): void {
  for (const url of urls) {
    if (url.trim() !== "") refs.push({ url: url.trim(), kind });
  }
}

function splitSrcset(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");
}

function validateUrl(
  raw: string,
  kind: RefKind,
  fromAbs: string,
  topicRoot: string,
  sharedDir: string,
  slug: string,
  relFile: string,
): CheckIssue | null {
  if (raw.startsWith("#")) return null;
  if (raw.startsWith("data:")) {
    return kind === "asset" ? null : problem(slug, relFile, "不使用 data: 作为链接");
  }
  if (/^mailto:/i.test(raw)) {
    return kind === "href" ? null : problem(slug, relFile, "mailto 只能用于链接");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (/^https?:\/\//i.test(raw)) {
      return kind === "href" ? null : problem(slug, relFile, "远程地址不能当作主题资源");
    }
    return problem(slug, relFile, "不允许的 URL 协议");
  }
  if (raw.startsWith("//")) return problem(slug, relFile, "不使用协议相对地址");
  if (raw.includes("\\") || /%2e%2e/i.test(raw)) return problem(slug, relFile, "路径不能离开主题目录");

  const pathOnly = stripQuery(raw);
  if (pathOnly === "") return null;
  if (pathOnly.startsWith("/")) return validateAbsolute(pathOnly, kind, sharedDir, slug, relFile);

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return problem(slug, relFile, "无法解码 URL");
  }
  if (decoded.split("/").includes("..")) return problem(slug, relFile, "路径不能离开主题目录");
  const target = path.resolve(path.dirname(fromAbs), decoded);
  const relative = path.relative(topicRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return problem(slug, relFile, "路径不能离开主题目录");
  if (!fs.existsSync(target)) return problem(slug, relFile, `本地文件不存在: ${pathOnly}`);
  return null;
}

function validateAbsolute(pathOnly: string, kind: RefKind, sharedDir: string, slug: string, relFile: string): CheckIssue | null {
  if (kind === "href" && (pathOnly === CATALOG_HREF || pathOnly === BASE_PATH)) return null;
  const sharedPrefix = `${BASE_PATH}/shared/`;
  if (!pathOnly.startsWith(sharedPrefix)) {
    return problem(slug, relFile, "绝对路径只允许返回目录，或指向已有的 /teardown/shared/ 文件");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly.slice(sharedPrefix.length));
  } catch {
    return problem(slug, relFile, "无法解码 URL");
  }
  if (decoded === "" || decoded.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return problem(slug, relFile, "shared 路径无效");
  }
  if (!fs.existsSync(sharedDir) || !fs.statSync(sharedDir).isDirectory()) {
    return problem(slug, relFile, "shared 文件不存在");
  }
  const target = path.resolve(sharedDir, decoded);
  const relative = path.relative(sharedDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return problem(slug, relFile, "shared 文件不存在");
  }
  if (!ALLOWED.has(path.extname(target).toLowerCase())) return problem(slug, relFile, "shared 文件类型不允许");
  return null;
}

function stripQuery(raw: string): string {
  const noHash = raw.split("#")[0] ?? "";
  return noHash.split("?")[0] ?? "";
}

function problem(slug: string, relFile: string, message: string): CheckIssue {
  return issue("reference", slug, `${relFile}: ${message}`);
}
