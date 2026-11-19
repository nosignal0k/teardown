import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/build.ts";
import { resolvePublishedPath, startServer } from "../src/dev-server.ts";
import { CATALOG_LINK, tempSite, writeTopic } from "./helpers.ts";

test("preview server keeps the /teardown/ prefix and does not escape the output directory", async (t) => {
  const site = tempSite(t);
  writeTopic(site.topicsDir, "red-loom", {
    title: "红线",
    summary: "竖线。",
    category: "结构",
    tags: ["竖线"],
  }, {
    "index.html": `<!DOCTYPE html><html><head><link rel="stylesheet" href="./stack.css"></head><body>${CATALOG_LINK}<p>RED-LOOM-MARKER</p></body></html>\n`,
    "stack.css": ".stack { color: #7f1d1d; }\n",
  });
  const built = buildSite(site);
  assert.equal(built.ok, true);

  const escaped = resolvePublishedPath(site.outDir, "http://127.0.0.1/teardown/../../.git/config");
  assert.equal(escaped.kind, "missing");
  const collapsed = resolvePublishedPath(site.outDir, "http://127.0.0.1/teardown/topics/../platform.css");
  assert.equal(collapsed.kind, "file");
  if (collapsed.kind === "file") assert.equal(collapsed.file, path.join(site.outDir, "platform.css"));

  const server = await startServer({ outDir: site.outDir, host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await server.close();
  });
  const origin = new URL(server.origin);

  const root = await request(origin, "/");
  assert.equal(root.status, 302);
  assert.equal(root.location, "/teardown/");

  const catalog = await request(origin, "/teardown/");
  assert.equal(catalog.status, 200);
  assert.ok(catalog.type);
  assert.match(catalog.type, /text\/html/);
  assert.match(catalog.body, /还没有主题|红线/);
  assert.match(catalog.body, /href="\/teardown\/platform\.css"/);
  assert.match(catalog.body, /href="\/teardown\/topics\/red-loom\/"/);

  const css = await request(origin, "/teardown/platform.css");
  assert.equal(css.status, 200);
  assert.ok(css.type);
  assert.match(css.type, /text\/css/);
  assert.match(css.body, /prefers-reduced-motion/);

  const topic = await request(origin, "/teardown/topics/red-loom/");
  assert.equal(topic.status, 200);
  assert.match(topic.body, /RED-LOOM-MARKER/);
  assert.doesNotMatch(topic.body, /platform\.css/);

  const asset = await request(origin, "/teardown/topics/red-loom/stack.css");
  assert.equal(asset.status, 200);
  assert.match(asset.body, /#7f1d1d/);

  const bare = await request(origin, "/teardown/topics/red-loom");
  assert.equal(bare.status, 302);
  assert.equal(bare.location, "/teardown/topics/red-loom/");

  const missing = await request(origin, "/teardown/topics/missing/");
  assert.equal(missing.status, 404);
  assert.match(missing.body, /href="\/teardown\/"/);
});

function request(origin: URL, pathname: string): Promise<{ status: number; location: string | undefined; type: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: origin.hostname, port: origin.port, path: pathname, method: "GET" },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const location = response.headers.location;
          const type = response.headers["content-type"];
          resolve({
            status: response.statusCode ?? 0,
            location: Array.isArray(location) ? location[0] : location,
            type: Array.isArray(type) ? type[0] : type,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}
