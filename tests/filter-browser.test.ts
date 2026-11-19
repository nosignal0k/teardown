import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildSite } from "../src/build.ts";
import { startServer } from "../src/dev-server.ts";
import { CATALOG_LINK, tempSite, writeTopic } from "./helpers.ts";

test("filtered cards are not visible in a browser", async (t) => {
  const site = tempSite(t);
  writePair(site.topicsDir);
  const built = buildSite(site);
  assert.equal(built.ok, true);
  const server = await startServer({ outDir: site.outDir, host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await server.close();
  });

  const chromeDir = path.join(site.root, "chrome");
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
  const page = await openPage(socket, `${server.origin}/teardown/`);

  const initial = await cards(socket, page);
  assert.deepEqual(initial.map((card) => card.title), ["蓝潮", "红线"]);
  for (const card of initial) assert.equal(card.visible, true, card.title);

  await run(socket, page, `document.getElementById("category").value = "结构";
    document.getElementById("category").dispatchEvent(new Event("change"));`);
  const byCategory = await cards(socket, page);
  assertVisible(byCategory, "红线", true);
  assertVisible(byCategory, "蓝潮", false);

  await run(socket, page, `document.getElementById("category").value = "";
    document.getElementById("q").value = "蓝潮";
    document.getElementById("q").dispatchEvent(new Event("input"));`);
  const bySearch = await cards(socket, page);
  assertVisible(bySearch, "蓝潮", true);
  assertVisible(bySearch, "红线", false);
});

type CardView = {
  readonly title: string;
  readonly display: string;
  readonly visible: boolean;
  readonly height: number;
};

type CdpMessage = {
  readonly id?: number;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
};

function writePair(topicsDir: string): void {
  writeTopic(topicsDir, "red-loom", { title: "红线", summary: "竖线。", category: "结构", tags: ["竖线"] }, {
    "index.html": `<!DOCTYPE html><body>${CATALOG_LINK}</body>\n`,
  });
  writeTopic(topicsDir, "blue-tide", { title: "蓝潮", summary: "横线。", category: "流程", tags: ["横线"] }, {
    "index.html": `<!DOCTYPE html><body>${CATALOG_LINK}</body>\n`,
  });
}

function assertVisible(views: readonly CardView[], title: string, visible: boolean): void {
  const card = views.find((item) => item.title === title);
  assert.ok(card, title);
  assert.equal(card.visible, visible, title);
  assert.equal(card.display === "none", !visible, `${title} display ${card.display}`);
  assert.equal(card.height === 0, !visible, `${title} height ${card.height}`);
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH ?? "",
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
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
    let settled = false;
    const finish = (url: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Chrome 没有开放调试端口")), 8000);
    chrome.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
      const url = match?.[1];
      if (url !== undefined) finish(url);
    });
    chrome.on("exit", (code) => fail(new Error(`Chrome 退出 ${code ?? 0}`)));
  });
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("无法连接 Chrome")));
  });
}

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

async function cards(socket: WebSocket, sessionId: string): Promise<CardView[]> {
  const message = await run(socket, sessionId, `[...document.querySelectorAll(".card")].map((card) => ({
    title: card.querySelector("h3")?.textContent ?? "",
    display: getComputedStyle(card).display,
    visible: card.checkVisibility(),
    height: card.getBoundingClientRect().height,
  }))`);
  const parsed = evaluated(message);
  if (!Array.isArray(parsed) || !parsed.every(isCardView)) throw new Error("浏览器没有返回卡片状态");
  return parsed;
}

function isCardView(value: unknown): value is CardView {
  if (!isRecord(value)) return false;
  return typeof value.title === "string"
    && typeof value.display === "string"
    && typeof value.visible === "boolean"
    && typeof value.height === "number";
}

async function run(socket: WebSocket, sessionId: string, expression: string): Promise<CdpMessage> {
  const message = await send(socket, "Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  if (message.error?.message !== undefined) throw new Error(message.error.message);
  return message;
}

function evaluated(message: CdpMessage): unknown {
  const result = message.result;
  if (!isRecord(result)) throw new Error("CDP 没有返回结果");
  if (isRecord(result.exceptionDetails)) throw new Error("页面脚本失败");
  const inner = result.result;
  if (!isRecord(inner) || !("value" in inner)) throw new Error("CDP 没有返回值");
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
