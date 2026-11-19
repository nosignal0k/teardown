import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { TOPIC_FILE_EXTENSIONS } from "../src/references.ts";
import { repoRoot } from "../src/site.ts";
import { discoverTopics, parseSlug, parseTopicDocument, uniquenessIssues } from "../src/topic.ts";
import { CATALOG_LINK, tempSite, writeTopic } from "./helpers.ts";

test("slug is branded only when the directory name matches", () => {
  assert.equal(parseSlug("power-supply"), "power-supply");
  assert.equal(parseSlug("Bad_Slug"), null);
  assert.equal(parseSlug("-nope"), null);
  assert.equal(parseSlug("a--b"), null);
  const slug = parseSlug("same");
  assert.ok(slug);
  const again = parseSlug("same");
  assert.ok(again);
  assert.equal(uniquenessIssues([slug, again]).length, 1);
  assert.equal(uniquenessIssues([slug]).length, 0);
});

test("topic.json rejects undeclared fields, duplicate tags, and loose strings", () => {
  const slug = parseSlug("motor");
  assert.ok(slug);
  const extra = parseTopicDocument({ title: "电机", summary: "一句", category: "机器", tags: [], slug: "motor" }, slug);
  assert.equal(extra.ok, false);
  if (!extra.ok) assert.match(extra.issues.map((item) => item.message).join("\n"), /未定义字段: slug/);

  const tags = parseTopicDocument({ title: "电机", summary: "一句", category: "机器", tags: ["铜", "铜"] }, slug);
  assert.equal(tags.ok, false);

  const blank = parseTopicDocument({ title: " 电机", summary: "一句", category: "机器", tags: [] }, slug);
  assert.equal(blank.ok, false);
});

test("discovery accepts a self-contained topic and rejects cross-topic paths", (t) => {
  const site = tempSite(t);
  writeTopic(site.topicsDir, "red-loom", meta("红线", "竖线"), {
    ...page("RED-LOOM-MARKER", "red.css", "red.js"),
    "red.css": ".stack { color: #7f1d1d; }\n",
    "red.js": 'document.documentElement.dataset.demo = "red-loom";\n',
    "note.txt": "只在本目录内。\n",
  });
  const found = discoverTopics(site);
  assert.equal(found.issues.length, 0);
  assert.equal(found.topics.length, 1);

  writeTopic(site.topicsDir, "blue-tide", meta("蓝潮", "横线"), {
    "index.html": `<!DOCTYPE html><html><body>${CATALOG_LINK}<link rel="stylesheet" href="/teardown/topics/red-loom/red.css"></body></html>\n`,
  });
  const crossed = discoverTopics(site);
  assert.ok(crossed.issues.some((item) => item.slug === "blue-tide" && item.message.includes("/teardown/topics/")));
});

test("remote assets, parent paths, platform css, and unknown files fail", (t) => {
  const site = tempSite(t);
  writeTopic(site.topicsDir, "loose", meta("松", "边界"), {
    "index.html": `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://example.com/a.css">
      <link rel="stylesheet" href="/teardown/platform.css">
      <link rel="stylesheet" href="../outside.css">
    </head><body>${CATALOG_LINK}<a href="https://example.com/spec">规格</a></body></html>\n`,
    "readme.md": "# no\n",
  });
  const found = discoverTopics(site);
  const messages = found.issues.map((item) => item.message).join("\n");
  assert.match(messages, /远程地址不能当作主题资源/);
  assert.match(messages, /绝对路径只允许返回目录/);
  assert.match(messages, /路径不能离开主题目录/);
  assert.match(messages, /类型不在允许列表中/);
  assert.equal(found.topics.length, 0);
});

test("shared files are opt-in and must exist", (t) => {
  const site = tempSite(t);
  fs.mkdirSync(site.sharedDir);
  fs.writeFileSync(path.join(site.sharedDir, "mark.css"), ".mark { color: black; }\n");
  writeTopic(site.topicsDir, "uses-shared", meta("共用", "显式引用"), {
    "index.html": `<!DOCTYPE html><html><head><link rel="stylesheet" href="/teardown/shared/mark.css"></head><body>${CATALOG_LINK}</body></html>\n`,
  });
  assert.equal(discoverTopics(site).issues.length, 0);

  writeTopic(site.topicsDir, "missing-shared", meta("缺", "没有文件"), {
    "index.html": `<!DOCTYPE html><html><head><link rel="stylesheet" href="/teardown/shared/missing.css"></head><body>${CATALOG_LINK}</body></html>\n`,
  });
  assert.ok(discoverTopics(site).issues.some((item) => item.slug === "missing-shared"));
});

test("published topic directory stays empty and extensions are documented once", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const agents = fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
  for (const extension of TOPIC_FILE_EXTENSIONS) assert.ok(readme.includes(extension), extension);
  assert.match(readme, /AGENTS\.md/);
  assert.match(agents, /README\.md/);
  assert.match(agents, /190580154\+nosignal0k@users\.noreply\.github\.com/);
  assert.doesNotMatch(readme, /190580154\+nosignal0k@users\.noreply\.github\.com/);
  assert.match(readme, /topic\.json/);
  assert.doesNotMatch(agents, /topic\.json/);
  assert.match(readme, /npm run build/);
  assert.doesNotMatch(agents, /npm run build/);

  const published = discoverTopics({
    topicsDir: path.join(repoRoot, "topics"),
    sharedDir: path.join(repoRoot, "shared"),
  });
  assert.deepEqual(published.issues, []);
  assert.equal(published.topics.length, 0);
  assert.equal(fs.readdirSync(path.join(repoRoot, "topics")).some((name) => fs.statSync(path.join(repoRoot, "topics", name)).isDirectory()), false);
});

function meta(title: string, summary: string): Record<string, unknown> {
  return { title, summary, category: "示意", tags: [title] };
}

function page(marker: string, css: string, js: string): Record<string, string> {
  return {
    "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
<body>
  ${CATALOG_LINK}
  <p>${marker}</p>
  <link rel="stylesheet" href="./${css}">
  <script src="./${js}"></script>
</body>
</html>
`,
    [css]: `/* ${marker} */\n`,
    [js]: `globalThis.__topic = ${JSON.stringify(marker)};\n`,
  };
}
