import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/build.ts";
import { startServer } from "../src/dev-server.ts";
import { repoRoot } from "../src/site.ts";

test("hermes cutaway steps, switches backend, and stays inside the viewport", async (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "teardown-hermes-"));
  t.after(() => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        fs.rmSync(outDir, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt === 7) throw error;
        execFileSync("sleep", ["0.1"]);
      }
    }
  });
  const built = buildSite({
    root: repoRoot,
    topicsDir: path.join(repoRoot, "topics"),
    sharedDir: path.join(repoRoot, "shared"),
    outDir,
  });
  assert.equal(built.ok, true);
  const server = await startServer({ outDir, host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await server.close();
  });

  const chromeDir = path.join(outDir, "chrome");
  fs.mkdirSync(chromeDir);
  const chrome = spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${chromeDir}`,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  t.after(async () => {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) resolve(undefined);
      else chrome.once("exit", () => resolve(undefined));
    });
  });
  const socket = new WebSocket(await browserSocket(chrome));
  t.after(() => {
    socket.close();
  });
  await opened(socket);
  const page = await openPage(socket, `${server.origin}/teardown/topics/hermes-agent/`);

  const first = await text(socket, page, "document.getElementById('progress').textContent");
  assert.match(first, /提出任务/);
  await click(socket, page, "[data-do='next']");
  const stepped = await text(socket, page, "document.getElementById('caption').textContent");
  assert.match(stepped, /需要文件/);
  const token = await text(socket, page, "document.querySelector('#machine [data-token]')?.getAttribute('data-token') || ''");
  assert.match(token, /看不见文件/);
  await click(socket, page, "[data-do='replay']");
  assert.match(await text(socket, page, "document.getElementById('progress').textContent"), /提出任务/);

  await run(socket, page, `document.querySelector("[data-do='next']").focus();
    document.querySelector("[data-do='next']").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));`);
  assert.match(await text(socket, page, "document.getElementById('progress').textContent"), /需要文件/);

  await click(socket, page, "[data-value='boundary']");
  await click(socket, page, "[data-do='backend'][data-value='docker']");
  const isolated = await text(socket, page, "document.querySelector('#machine').textContent");
  assert.match(isolated, /用户拒绝/);
  assert.match(isolated, /底线/);
  assert.doesNotMatch(isolated, /等待批准/);
  assert.doesNotMatch(isolated, /没有主机路径挂载/);
  assert.equal(await text(socket, page, "document.querySelector('#machine').dataset.skip"), "true");
  assert.equal(await text(socket, page, "document.querySelector('#machine').dataset.floor"), "false");
  assert.equal(await text(socket, page, "String(document.querySelectorAll('#machine .gate.off').length)"), "2");
  assert.equal(await text(socket, page, "String(document.querySelector('#machine .lane') !== null)"), "true");
  await click(socket, page, "[data-do='backend'][data-value='docker-mount']");
  const mounted = await text(socket, page, "document.querySelector('#machine').textContent");
  assert.match(mounted, /等待批准/);
  assert.match(mounted, /底线/);
  assert.equal(await text(socket, page, "document.querySelector('#machine').dataset.skip"), "false");
  assert.equal(await text(socket, page, "document.querySelector('#machine').dataset.floor"), "true");
  assert.equal(await text(socket, page, "String(document.querySelectorAll('#machine .gate.off').length)"), "0");

  await click(socket, page, "[data-value='keep']");
  await click(socket, page, "[data-do='memory']");
  for (let index = 0; index < 3; index += 1) await click(socket, page, "[data-do='next']");
  const memory = await text(socket, page, "document.querySelector('#machine').textContent");
  assert.match(memory, /偏好先看百分比/);
  assert.match(memory, /（空）/);

  await click(socket, page, "[data-value='compress']");
  const before = await text(socket, page, "document.querySelector('[data-readout=input]').textContent");
  assert.match(before, /92/);
  await click(socket, page, "[data-do='next']");
  await click(socket, page, "[data-do='next']");
  await click(socket, page, "[data-do='next']");
  const after = await text(socket, page, "document.querySelector('[data-readout=input]').textContent");
  const archive = await text(socket, page, "document.querySelector('[data-readout=archive]').textContent");
  assert.match(after, /46/);
  assert.match(archive, /100/);
  assert.notEqual(before, after);

  await click(socket, page, "[data-value='map']");
  await send(socket, "Emulation.setDeviceMetricsOverride", {
    width: 1100, height: 900, deviceScaleFactor: 1, mobile: false,
  }, page);
  assert.equal(await text(socket, page, GEOMETRY), "ok");
  assert.equal(await text(socket, page, ARROWS), "ok");

  await send(socket, "Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  }, page);
  assert.equal(await text(socket, page, GEOMETRY), "ok");
  assert.equal(await text(socket, page, ARROWS), "ok");
  await click(socket, page, "[data-value='loop']");
  assert.equal(await text(socket, page, GEOMETRY), "ok");
  await click(socket, page, "[data-value='boundary']");
  assert.equal(await text(socket, page, GEOMETRY), "ok");
  await click(socket, page, "[data-value='compress']");
  assert.equal(await text(socket, page, GEOMETRY), "ok");
  const overflow = await text(socket, page, "String(document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)");
  assert.equal(overflow, "false");
});

const GEOMETRY = `(() => {
  const problems = [];
  const svg = document.querySelector("#machine");
  if (!svg) return "no machine";
  const box = svg.getBoundingClientRect();
  if (box.width < 300) problems.push("narrow-svg");
  const texts = [...svg.querySelectorAll("text")];
  if (texts.length < 12) problems.push("few-labels");
  for (const text of texts) {
    const rect = text.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const label = (text.textContent || "").trim().slice(0, 16);
    if (rect.left < box.left - 2 || rect.right > box.right + 2 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2) {
      problems.push("outside:" + label);
    }
    if (rect.width < 14 && rect.height > 32) problems.push("stacked:" + label);
  }
  for (let i = 0; i < texts.length; i += 1) {
    const a = texts[i].getBoundingClientRect();
    if (a.width < 1) continue;
    for (let j = i + 1; j < texts.length; j += 1) {
      const b = texts[j].getBoundingClientRect();
      if (b.width < 1) continue;
      const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapW > 3 && overlapH > 3) {
        problems.push("overlap:" + (texts[i].textContent || "").trim().slice(0, 10) + "/" + (texts[j].textContent || "").trim().slice(0, 10));
      }
    }
  }
  return problems.slice(0, 6).join("|") || "ok";
})()`;

const ARROWS = `(() => {
  const problems = [];
  const paths = [...document.querySelectorAll("#machine path[data-flow]")];
  if (paths.length < 8) problems.push("few-rails");
  for (const path of paths) {
    if (!path.getAttribute("marker-end")) problems.push("no-marker:" + path.dataset.flow);
    const len = path.getTotalLength();
    if (len < 12) problems.push("short:" + path.dataset.flow);
    const end = path.getPointAtLength(len);
    const before = path.getPointAtLength(Math.max(0, len - 6));
    const dx = end.x - before.x;
    const dy = end.y - before.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
    if (dir !== path.dataset.dir) problems.push(path.dataset.flow + ":" + dir + "!=" + path.dataset.dir);
  }
  const back = document.querySelector("[data-flow='model-back']");
  const ask = document.querySelector("[data-flow='ask-model']");
  if (back && ask) {
    const backDir = back.dataset.dir;
    const askDir = ask.dataset.dir;
    if (backDir === askDir) problems.push("return-same-way");
  }
  return problems.join("|") || "ok";
})()`;

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH ?? "",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    if (candidate !== "" && fs.existsSync(candidate)) return candidate;
  }
  throw new Error("未找到 Chrome 或 Chromium");
}

function browserSocket(chrome: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("Chrome 没有开放调试端口")), 8000);
    chrome.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome 退出 ${code ?? 0}`));
    });
  });
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("无法连接 Chrome")));
  });
}

type CdpMessage = {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message?: string };
};

async function openPage(socket: WebSocket, url: string): Promise<string> {
  const created = await send(socket, "Target.createTarget", { url: "about:blank" });
  const targetId = readString(created.result, "targetId");
  const attached = await send(socket, "Target.attachToTarget", { targetId, flatten: true });
  const sessionId = readString(attached.result, "sessionId");
  await send(socket, "Page.enable", {}, sessionId);
  const loaded = waitFor(socket, "Page.loadEventFired");
  await send(socket, "Page.navigate", { url }, sessionId);
  await loaded;
  return sessionId;
}

async function click(socket: WebSocket, sessionId: string, selector: string): Promise<void> {
  const value = await text(socket, sessionId, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return ""; el.click(); return "ok"; })()`);
  assert.equal(value, "ok", selector);
}

async function run(socket: WebSocket, sessionId: string, expression: string): Promise<void> {
  await text(socket, sessionId, `(() => { ${expression}; return "ok"; })()`);
}

async function text(socket: WebSocket, sessionId: string, expression: string): Promise<string> {
  const message = await send(socket, "Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  if (message.error?.message) throw new Error(message.error.message);
  const result = message.result;
  if (!isRecord(result) || isRecord(result.exceptionDetails)) throw new Error("页面脚本失败");
  const inner = result.result;
  if (!isRecord(inner) || typeof inner.value !== "string") throw new Error("CDP 没有返回字符串");
  return inner.value;
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string") throw new Error(`CDP 缺少 ${key}`);
  return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function send(socket: WebSocket, method: string, params: Record<string, unknown>, sessionId?: string): Promise<CdpMessage> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`CDP 超时: ${method}`));
    }, 8000);
    const onMessage = (event: MessageEvent): void => {
      const message = parseMessage(event.data);
      if (message?.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId !== undefined) payload.sessionId = sessionId;
    socket.send(JSON.stringify(payload));
  });
}

function waitFor(socket: WebSocket, method: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`没有等到 ${method}`));
    }, 8000);
    const onMessage = (event: MessageEvent): void => {
      const message = parseMessage(event.data);
      if (message?.method !== method) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve();
    };
    socket.addEventListener("message", onMessage);
  });
}

function parseMessage(data: unknown): CdpMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let id = 0;
function nextId(): number {
  id += 1;
  return id;
}
