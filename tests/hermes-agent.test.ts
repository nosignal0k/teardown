// @ts-nocheck
// Topic scripts stay outside the TypeScript program. This file checks their runtime behavior.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repoRoot } from "../src/site.ts";
import { discoverTopics } from "../src/topic.ts";
import * as study from "../topics/hermes-agent/study.js";

test("csv briefing is the fixed comparison", () => {
  const compared = study.compareCsv();
  assert.deepEqual(compared, { ordersPct: 20, revenuePct: 14, aovYesterday: 100, aovToday: 95, aovPct: -5 });
  assert.deepEqual(study.briefingLines(), ["订单 +20%", "收入 +14%", "客单价 100 → 95（-5%）"]);
});

test("playback steps, pauses, replays, and stops on the last frame", () => {
  let current = study.createStudy();
  const first = study.view(current).frame.id;
  current = study.tick(current);
  assert.equal(study.view(current).frame.id, first);
  current = study.togglePlay(current);
  assert.equal(current.playing, true);
  current = study.tick(current);
  assert.notEqual(study.view(current).frame.id, first);
  current = study.step(current, -1);
  assert.equal(current.playing, false);
  assert.equal(study.view(current).frame.id, first);
  current = study.togglePlay(current);
  for (let i = 0; i < 12; i += 1) current = study.tick(current);
  const done = study.view(current);
  assert.equal(current.playing, false);
  assert.equal(done.index, done.total - 1);
  current = study.replay(current);
  assert.equal(study.view(current).index, 0);
  assert.equal(current.playing, false);
  const stepped = study.togglePlay(current, { reduced: true });
  assert.equal(stepped.playing, false);
  assert.equal(study.view(stepped).index, 1);
});

test("switching scenes pauses at the first state", () => {
  let current = study.step(study.createStudy(), 3);
  assert.equal(study.view(current).index, 3);
  current = study.selectScene(current, "map");
  assert.equal(current.playing, false);
  assert.equal(current.scene, "map");
  assert.equal(study.view(current).index, 0);
});

test("the model requests tools and the runtime executes them", () => {
  let current = study.selectScene(study.createStudy(), "purpose");
  const titles = new Map(study.frames(current).map((item) => [item.id, item]));
  assert.equal(titles.get("request")?.executed, false);
  assert.equal(titles.get("data")?.executed, true);
  assert.equal(study.view(current).weightsChanged, false);
  assert.equal(study.view(current).sandboxed, false);
  current = study.patch(current, { lens: "run" });
  assert.match(study.view(current).note, /运行时/);
});

test("a failed tool returns an error and is not marked healed", () => {
  const current = study.patch(study.selectScene(study.createStudy(), "loop"), { loopBranch: "error" });
  const items = study.frames(current);
  assert.equal(items.at(-1)?.id, "stop");
  assert.equal(items.every((item) => item.healed !== true), true);
  assert.match(items.map((item) => item.lines.join(" ")).join("\n"), /error/);
});

test("two reads are collected in call order", () => {
  const current = study.patch(study.selectScene(study.createStudy(), "loop"), { loopBranch: "parallel" });
  const ordered = study.frames(current).find((item) => item.id === "ordered");
  assert.deepEqual(ordered?.lines.slice(0, 2), ["先昨日，后今日", "结果按原顺序放回"]);
  assert.equal(study.frames(current).some((item) => item.id === "fail"), false);
});

test("local approval is manual and docker does not reuse that wait", () => {
  let current = study.selectScene(study.createStudy(), "boundary");
  assert.equal(study.frames(current).some((item) => item.id === "wait"), true);
  assert.equal(study.view(current).sandboxed, false);
  current = study.patch(current, { decision: "deny" });
  assert.equal(study.view(current).frame.executed, false);
  assert.equal(study.view(current).frame.id, "result");
  current = study.patch(current, { decision: "once" });
  assert.equal(study.view(current).frame.executed, true);
  assert.equal(study.view(current).sandboxed, false);
  assert.match(study.view(current).frame.lines.join(" "), /主机/);
  current = study.patch(current, { backend: "docker" });
  const docker = study.frames(current).map((item) => item.id);
  assert.deepEqual(docker.includes("wait"), false);
  assert.equal(docker.at(-1), "mounts");
  assert.equal(study.frames(current).every((item) => item.sandboxed === false), true);
});

test("memory writes stay out of the frozen snapshot until the next session", () => {
  let current = study.patch(study.selectScene(study.createStudy(), "keep"), { keepMemory: true, keepSkill: true });
  const frozen = study.frames(current).find((item) => item.id === "frozen");
  const planes = study.memoryPlanes(current, frozen?.phase ?? "");
  assert.equal(planes.disk, "偏好先看百分比");
  assert.equal(planes.snapshot, "（空）");
  assert.equal(planes.weightsChanged, false);
  const loaded = study.memoryPlanes(current, "load");
  assert.equal(loaded.snapshot, "偏好先看百分比");
  const read = study.frames(current).find((item) => item.id === "read");
  assert.match(read?.lines.join(" ") ?? "", /不是新工具/);
  assert.equal(read?.weightsChanged, false);
  current = study.patch(current, { plane: "snapshot" });
  const atFrozen = study.frames(current).findIndex((item) => item.id === "frozen");
  current.index.keep = atFrozen;
  assert.equal(study.view(current).shownMemory, "（空）");
  current = study.patch(current, { plane: "disk" });
  current.index.keep = atFrozen;
  assert.equal(study.view(current).shownMemory, "偏好先看百分比");
});

test("compression keeps the archive and cron splits failure modes", () => {
  let current = study.selectScene(study.createStudy(), "compress");
  const blob = JSON.stringify(study.frames(current));
  assert.doesNotMatch(blob, /50%|85%|child session/);
  assert.match(study.frames(current).map((item) => item.lines.join(" ")).join("\n"), /不画成销毁|可搜索/);
  current = study.patch(current, { compressBranch: "miss" });
  assert.equal(study.frames(current).at(-1)?.healed, false);

  let cron = study.selectScene(study.createStudy(), "again");
  assert.equal(study.frames(cron)[0]?.id, "idle");
  cron = study.patch(cron, { scheduled: true, host: "offline" });
  assert.equal(study.frames(cron).at(-1)?.ran, false);
  assert.equal(study.frames(cron).at(-1)?.delivered, false);
  cron = study.patch(cron, { host: "online", delivery: "fail", model: "ready" });
  const delivered = study.frames(cron).at(-1);
  assert.equal(delivered?.id, "undelivered");
  assert.equal(delivered?.ran, true);
  assert.equal(delivered?.delivered, false);
  cron = study.patch(cron, { delivery: "ok", model: "down" });
  assert.equal(study.frames(cron).at(-1)?.id, "fallback");
  assert.equal(study.frames(cron).at(-1)?.delivered, false);
});

test("main-path frames do not claim a sandbox, training, or a fixed percent", () => {
  let current = study.createStudy();
  for (const scene of study.SCENES) {
    current = study.selectScene(current, scene.id);
    const text = JSON.stringify(study.frames(current));
    assert.doesNotMatch(text, /50%|85%|child session/);
    assert.equal(study.frames(current).every((item) => item.weightsChanged === false && item.sandboxed === false), true);
    assert.equal(study.view(current).weightsChanged, false);
    assert.equal(study.view(current).simulated, true);
  }
});

test("the published page pins the commit and keeps the simulation visible", () => {
  const root = path.join(repoRoot, "topics", "hermes-agent");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const found = discoverTopics({ topicsDir: path.join(repoRoot, "topics"), sharedDir: path.join(repoRoot, "shared") });
  assert.equal(found.issues.length, 0);
  assert.match(html, /ae2a81ccc00e9b7c06301523e5bb09608397149c/);
  assert.match(html, /28f57ed8e3dba4eceb67dfd3e3abda1a7604452d/);
  assert.match(html, /模拟流程，不连接真实 Hermes，不执行命令/);
  assert.match(html, /本机执行没有容器隔离/);
  assert.match(html, /没有改模型权重/);
  assert.match(html, /href="\/teardown\/" data-teardown-catalog/);
  assert.doesNotMatch(html, /\/teardown\/topics\//);
  assert.match(html, /data-do="play"/);
  assert.match(html, /data-do="prev"/);
  assert.match(html, /data-do="next"/);
  assert.match(html, /data-do="replay"/);
  for (const scene of study.SCENES) assert.ok(html.includes(scene.takeaway), scene.id);
  const css = fs.readFileSync(path.join(root, "hermes.css"), "utf8");
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(html + css, /phone|@gmail|cursoragent|Co-authored-by/i);
});
