import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/build.ts";
import { renderIndex } from "../src/catalog-page.ts";
import { resolveSitePaths } from "../src/site.ts";
import { parseSlug } from "../src/topic.ts";
import { CATALOG_LINK, tempSite, writeTopic } from "./helpers.ts";

test("catalog escapes text and points topic links at the base path", () => {
  const slug = parseSlug("amp");
  assert.ok(slug);
  const html = renderIndex({
    topics: [
      {
        slug,
        title: `</script><img src=x onerror=alert(1)>`,
        summary: `a<b>&"c`,
        category: "安全",
        tags: ["引号"],
      },
    ],
  });
  assert.match(html, /href="\/teardown\/topics\/amp\/"/);
  assert.match(html, /href="\/teardown\/platform\.css"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal(html.match(/<script/g)?.length, 1);
  assert.match(html, /a&lt;b&gt;&amp;&quot;c/);
});

test("empty production catalog has an intentional empty state and base-path assets", (t) => {
  const paths = resolveSitePaths({});
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "teardown-empty-"));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
  const result = buildSite({ ...paths, outDir });
  assert.equal(result.ok, true);
  const index = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(outDir, "platform.css"), "utf8");
  const notFound = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
  assert.match(index, /还没有主题/);
  assert.match(index, /href="\/teardown\/platform\.css"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(index, /href="\/teardown\/topics\//);
  assert.match(notFound, /href="\/teardown\/"/);
  assert.equal(fs.existsSync(path.join(outDir, ".nojekyll")), true);
  assert.equal(fs.existsSync(path.join(outDir, "topics")), false);
  assert.doesNotMatch(index, /\/home\/|cursoragent|Co-authored-by/);
});

test("invalid topics are not published and unsafe output directories are refused", (t) => {
  const site = tempSite(t);
  writeTopic(site.topicsDir, "Bad_Name", { title: "错", summary: "错", category: "错", tags: [] }, {
    "index.html": `<!DOCTYPE html><body>${CATALOG_LINK}</body>`,
  });
  const failed = buildSite(site);
  assert.equal(failed.ok, false);
  assert.equal(fs.existsSync(site.outDir), false);

  assert.throws(() => buildSite({ ...site, outDir: site.topicsDir }), /拒绝清空/);
  assert.ok(fs.existsSync(path.join(site.topicsDir, "Bad_Name", "topic.json")));
});
