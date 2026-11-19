import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/build.ts";
import { CATALOG_LINK, fileHashes, sameHashes, tempSite, writeTopic } from "./helpers.ts";

test("two topic designs stay byte-isolated when one owned tree changes", (t) => {
  const site = tempSite(t);
  writeFixture(site.topicsDir, "red-loom", "RED-LOOM-MARKER", "stack", "RED-VERSION-1");
  writeFixture(site.topicsDir, "blue-tide", "BLUE-TIDE-MARKER", "rail", "BLUE-VERSION-1");

  const first = buildSite(site);
  assert.equal(first.ok, true);
  const redHtml = readTopic(site.outDir, "red-loom");
  const blueHtml = readTopic(site.outDir, "blue-tide");
  assert.match(redHtml, /stack-figure/);
  assert.match(blueHtml, /rail-figure/);
  assert.doesNotMatch(redHtml, /rail-figure|BLUE-TIDE-MARKER|blue\.css|platform\.css/);
  assert.doesNotMatch(blueHtml, /stack-figure|RED-LOOM-MARKER|red\.css|platform\.css/);
  assert.match(redHtml, /href="\/teardown\/"/);
  assert.match(blueHtml, /href="\/teardown\/"/);
  assert.equal(fs.existsSync(path.join(site.outDir, "topics", "red-loom", "topic.json")), false);
  assert.doesNotMatch(redHtml + blueHtml, new RegExp(site.root.replaceAll("/", "\\/")));

  const blueBefore = fileHashes(path.join(site.outDir, "topics", "blue-tide"));
  const sharedBefore = sharedHashes(site.outDir);
  const redBefore = fileHashes(path.join(site.outDir, "topics", "red-loom"));

  writeFixture(site.topicsDir, "red-loom", "RED-LOOM-MARKER", "stack", "RED-VERSION-2");
  const second = buildSite(site);
  assert.equal(second.ok, true);
  const blueAfterContent = fileHashes(path.join(site.outDir, "topics", "blue-tide"));
  const sharedAfterContent = sharedHashes(site.outDir);
  const redAfterContent = fileHashes(path.join(site.outDir, "topics", "red-loom"));
  assert.equal(sameHashes(blueBefore, blueAfterContent), true);
  assert.equal(sameHashes(sharedBefore, sharedAfterContent), true);
  assert.equal(sameHashes(redBefore, redAfterContent), false);
  assert.match(readTopic(site.outDir, "red-loom"), /RED-VERSION-2/);
  assert.doesNotMatch(readTopic(site.outDir, "blue-tide"), /RED-VERSION-2/);

  const metaPath = path.join(site.topicsDir, "red-loom", "topic.json");
  const metaText = fs.readFileSync(metaPath, "utf8");
  assert.match(metaText, /"title": "红线"/);
  fs.writeFileSync(metaPath, metaText.replace('"title": "红线"', '"title": "红线改名"'));
  const third = buildSite(site);
  assert.equal(third.ok, true);
  const sharedAfterMeta = sharedHashes(site.outDir);
  const blueAfterMeta = fileHashes(path.join(site.outDir, "topics", "blue-tide"));
  assert.equal(sameHashes(blueAfterContent, blueAfterMeta), true);
  assert.notEqual(sharedAfterContent.get("index.html"), sharedAfterMeta.get("index.html"));
  assert.equal(sharedAfterContent.get("platform.css"), sharedAfterMeta.get("platform.css"));
  assert.equal(sharedAfterContent.get("404.html"), sharedAfterMeta.get("404.html"));
  assert.match(fs.readFileSync(path.join(site.outDir, "index.html"), "utf8"), /红线改名/);
  assert.match(fs.readFileSync(path.join(site.outDir, "index.html"), "utf8"), /href="\/teardown\/topics\/blue-tide\/"/);

  console.log(report({
    blueOwned: blueAfterMeta,
    redOwned: fileHashes(path.join(site.outDir, "topics", "red-loom")),
    shared: sharedAfterMeta,
    contentEditKeptShared: sameHashes(sharedBefore, sharedAfterContent),
    metadataEditChangedCatalog: sharedAfterContent.get("index.html") !== sharedAfterMeta.get("index.html"),
  }));
});

function writeFixture(topicsDir: string, slug: string, marker: string, shape: "stack" | "rail", version: string): void {
  const vertical = shape === "stack";
  writeTopic(topicsDir, slug, {
    title: vertical ? "红线" : "蓝潮",
    summary: vertical ? "用竖线表示经线。" : "用横线表示流向。",
    category: vertical ? "结构" : "流程",
    tags: [vertical ? "竖线" : "横线"],
  }, {
    "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${marker}</title>
  <link rel="stylesheet" href="./${shape}.css">
</head>
<body>
  ${CATALOG_LINK}
  <p class="${shape}">${marker}</p>
  <svg class="${shape}-figure" viewBox="0 0 80 40" role="img" aria-label="${vertical ? "竖线" : "横线"}">
    ${vertical ? '<path d="M20 4 V36 M40 4 V36 M60 4 V36" stroke="currentColor"/>' : '<path d="M4 20 H76" stroke="currentColor"/>'}
  </svg>
  <p>${version}</p>
  <script src="./${shape}.js"></script>
</body>
</html>
`,
    [`${shape}.css`]: `.${shape} { color: ${vertical ? "#7f1d1d" : "#1e3a8a"}; }\n.${shape}-figure { width: 100%; }\n/* ${version} */\n`,
    [`${shape}.js`]: `document.documentElement.dataset.demo = ${JSON.stringify(slug)};\ndocument.documentElement.dataset.version = ${JSON.stringify(version)};\n`,
  });
}

function readTopic(outDir: string, slug: string): string {
  return fs.readFileSync(path.join(outDir, "topics", slug, "index.html"), "utf8");
}

function sharedHashes(outDir: string): Map<string, string> {
  const all = fileHashes(outDir);
  const shared = new Map<string, string>();
  for (const [rel, hash] of all) {
    if (!rel.startsWith("topics/")) shared.set(rel, hash);
  }
  return shared;
}

function report(input: {
  blueOwned: Map<string, string>;
  redOwned: Map<string, string>;
  shared: Map<string, string>;
  contentEditKeptShared: boolean;
  metadataEditChangedCatalog: boolean;
}): string {
  const lines = [
    "isolation report",
    `content edit left shared files unchanged: ${input.contentEditKeptShared}`,
    `metadata edit changed catalog index: ${input.metadataEditChangedCatalog}`,
    "shared files:",
  ];
  for (const [rel, hash] of [...input.shared.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    lines.push(`  ${rel} ${hash}`);
  }
  lines.push("red-loom owned:");
  for (const [rel, hash] of [...input.redOwned.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    lines.push(`  ${rel} ${hash}`);
  }
  lines.push("blue-tide owned:");
  for (const [rel, hash] of [...input.blueOwned.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    lines.push(`  ${rel} ${hash}`);
  }
  lines.push("scope: topic directories are copied; catalog index, platform.css, 404.html and .nojekyll are shared; scripts are not executed or sandboxed");
  return lines.join("\n");
}
