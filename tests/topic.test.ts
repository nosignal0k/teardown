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

test("inline style and script literals cannot point outside the topic", (t) => {
  const site = tempSite(t);
  const dot = { "dot.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n", "local.js": "export const ready = true;\n" };
  writeTopic(site.topicsDir, "style-parent", meta("样式块", "越界"), {
    "index.html": html(`<style>.x{background:url('../blue-tide/x.svg')}</style>`),
  });
  writeTopic(site.topicsDir, "style-local", meta("样式块", "本地"), {
    "index.html": html(`<style>.x{background:url('./dot.svg')}</style>`),
    ...dot,
  });
  writeTopic(site.topicsDir, "attr-parent", meta("样式属性", "越界"), {
    "index.html": html(`<div style="background:url('../blue-tide/x.svg')"></div>`),
  });
  writeTopic(site.topicsDir, "attr-local", meta("样式属性", "本地"), {
    "index.html": html(`<div style="background:url('./dot.svg')"></div>`),
    ...dot,
  });
  writeTopic(site.topicsDir, "module-parent", meta("模块", "越界"), {
    "index.html": html(`<script type="module">import "../blue-tide/other.js";</script>`),
  });
  writeTopic(site.topicsDir, "module-local", meta("模块", "本地"), {
    "index.html": html(`<script type="module">import "./local.js";</script>`),
    ...dot,
  });
  writeTopic(site.topicsDir, "script-url-parent", meta("脚本", "越界"), {
    "index.html": html(`<script>new URL("../blue-tide/x.svg", import.meta.url);</script>`),
  });
  writeTopic(site.topicsDir, "svg-parent", meta("矢量", "越界"), {
    "index.html": html(""),
    "mark.svg": `<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:url('../blue-tide/x.svg')}</style></svg>\n`,
  });

  const found = discoverTopics(site);
  const messages = (slug: string): string => found.issues.filter((item) => item.slug === slug).map((item) => item.message).join("\n");
  for (const slug of ["style-parent", "attr-parent", "module-parent", "script-url-parent", "svg-parent"]) {
    assert.match(messages(slug), /路径不能离开主题目录/, slug);
  }
  for (const slug of ["style-local", "attr-local", "module-local"]) {
    assert.equal(messages(slug), "", slug);
    assert.ok(found.topics.some((topic) => topic.slug === slug), slug);
  }
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
  assert.match(readme, /不在此仓库选择许可证/);
  assert.doesNotMatch(agents, /不选择许可证|不在此仓库选择许可证/);
  assert.match(agents, /许可证是否设置，以 README 的贡献约定为准/);

  const published = discoverTopics({
    topicsDir: path.join(repoRoot, "topics"),
    sharedDir: path.join(repoRoot, "shared"),
  });
  assert.deepEqual(published.issues, []);
  assert.equal(published.topics.length, 0);
  assert.equal(fs.readdirSync(path.join(repoRoot, "topics")).some((name) => fs.statSync(path.join(repoRoot, "topics", name)).isDirectory()), false);
});

function html(extra: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${CATALOG_LINK}${extra}</body></html>\n`;
}

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
