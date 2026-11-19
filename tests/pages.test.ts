import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repoRoot } from "../src/site.ts";

test("pages workflow deploys only main and manual runs", () => {
  const pages = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "pages.yml"), "utf8");
  const check = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "check.yml"), "utf8");
  assert.match(pages, /branches:\s*\[main\]/);
  assert.match(pages, /workflow_dispatch/);
  assert.doesNotMatch(pages, /pull_request/);
  assert.match(pages, /actions\/upload-pages-artifact@v3/);
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.match(pages, /path:\s*dist/);
  assert.match(pages, /pages:\s*write/);
  assert.match(pages, /id-token:\s*write/);
  assert.match(pages, /contents:\s*read/);
  assert.match(pages, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(pages, /contents:\s*write/);
  assert.match(check, /npm test/);
  assert.match(check, /pull_request/);
  assert.doesNotMatch(check, /deploy-pages/);
});
