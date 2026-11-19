import {
  NODES,
  SCENES,
  commandGuard,
  frames,
  intervalMs,
  patch,
  replay,
  selectScene,
  step,
  tick,
  togglePlay,
  view,
  createStudy,
} from "./study.js";

const KIND = {
  control: "控制",
  data: "数据",
  persist: "持久化",
  warn: "边界",
  stop: "停止",
};

const TRADES = {
  tools: "工具让模型碰到文件和命令，副作用也跟着发生。批准和容器都不是盖住所有工具的网。",
  state: "会话、记忆和技能能留给下一次，但两个进程写同一个主目录会互相盖掉。",
  compact: "压缩让这一轮放得下，摘要却可能丢掉客单价。原文还在库里，不保证一搜就有。",
  cron: "到点再跑，要把网关留在开着的主机上。模型密钥和投递目标也还在你这边。",
};

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = reducedQuery.matches;
let state = createStudy();
let tradeId = "";
let timer = 0;

const progress = document.getElementById("progress");
const status = document.getElementById("status");
const tradeNote = document.getElementById("trade-note");

function sceneMeta(id) {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}

function render() {
  const seen = view(state);
  const meta = sceneMeta(state.scene);
  for (const link of document.querySelectorAll("[data-scene-link]")) {
    const on = link.getAttribute("data-scene-link") === state.scene;
    link.classList.toggle("is-current", on);
    link.setAttribute("aria-current", on ? "true" : "false");
  }
  for (const panel of document.querySelectorAll(".scene")) {
    panel.hidden = panel.dataset.scene !== state.scene;
  }
  const panel = document.querySelector(`.scene[data-scene="${state.scene}"]`);
  const play = document.querySelector("[data-do='play']");
  if (play) {
    play.textContent = state.playing ? "暂停" : reduced ? "单步" : "播放";
    play.setAttribute("aria-pressed", state.playing ? "true" : "false");
  }
  const speed = document.querySelector("[data-do='speed']");
  if (speed) {
    speed.textContent = state.speed === 2 ? "速度 2×" : "速度 1×";
    speed.setAttribute("aria-pressed", state.speed === 2 ? "true" : "false");
  }
  if (progress) progress.textContent = `第 ${seen.index + 1} / ${seen.total} 步 · ${seen.frame.title}`;
  const spoken = `${meta.title}。${seen.frame.actor}：${seen.frame.title}。${seen.note}`;
  if (status && status.textContent !== spoken) status.textContent = spoken;

  if (panel) {
    paintHot(panel, seen);
    paintFlow(panel, seen);
    paintBeats(panel, seen);
    paintTicket(panel, seen);
    const memory = panel.querySelector("[data-memory-label]");
    if (memory) memory.textContent = `此刻看到：${seen.shownMemory}`;
    const skill = panel.querySelector("[data-skill-label]");
    if (skill) skill.textContent = state.keepSkill ? "已选择保存" : "还没保存";
  }
  const duty = document.getElementById("duty");
  if (duty && state.scene === "map") {
    duty.textContent = `${seen.duty.title}：${seen.duty.duty}（${seen.duty.file}）`;
  }
  paintPressed();
  if (tradeNote) tradeNote.textContent = TRADES[tradeId] ?? "点一个取舍，看它换来什么、又留下什么。";
}

function paintHot(panel, seen) {
  for (const el of panel.querySelectorAll("[data-node]")) {
    const id = el.dataset.node ?? "";
    const on = seen.frame.hot.includes(id);
    el.classList.toggle("is-hot", on);
    el.dataset.on = on ? "true" : "false";
    el.classList.toggle("is-focus", state.scene === "map" && state.focus === id);
    el.classList.toggle("is-file", state.showFileRoot && id === "file");
  }
}

function paintFlow(panel, seen) {
  for (const edge of panel.querySelectorAll("[data-edge]")) {
    edge.classList.toggle("is-live", edge.dataset.edge === seen.frame.edge);
  }
  for (const old of panel.querySelectorAll(".packet")) old.remove();
  const token = seen.frame.token;
  const hostId = seen.frame.hot?.[0];
  if (typeof token === "string" && token !== "" && typeof hostId === "string") {
    const host = panel.querySelector(`[data-node="${hostId}"]`);
    if (host) {
      const packet = document.createElement("span");
      packet.className = "packet";
      packet.textContent = token;
      host.append(packet);
    }
  }
  const meter = seen.frame.meter;
  if (!meter) return;
  for (const name of ["old", "summary", "recent", "archive"]) {
    const part = panel.querySelector(`[data-part="${name}"]`);
    if (part) part.style.width = `${meter[name]}%`;
  }
  const input = panel.querySelector("[data-readout='input']");
  const archive = panel.querySelector("[data-readout='archive']");
  if (input) input.textContent = `模拟 ${meter.input}`;
  if (archive) archive.textContent = `模拟 ${meter.archive}，原文还在`;
  const bar = panel.querySelector("[data-node='input'] .bar");
  if (bar) bar.setAttribute("aria-label", `本轮输入 ${meter.input}：旧输出 ${meter.old}，摘要 ${meter.summary}，近期 ${meter.recent}。会话库 ${meter.archive}`);
}

function paintBeats(panel, seen) {
  const list = panel.querySelector(".beats");
  if (!list) return;
  const items = frames(state);
  list.replaceChildren();
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = item.title;
    if (index === seen.index) li.setAttribute("aria-current", "step");
    list.append(li);
  });
}

function paintTicket(panel, seen) {
  const ticket = panel.querySelector(".ticket");
  if (!ticket) return;
  const kicker = ticket.querySelector(".ticket-kicker");
  const title = ticket.querySelector("h3");
  const lines = ticket.querySelector("ul");
  const note = ticket.querySelector(".ticket-note");
  if (kicker) kicker.textContent = KIND[seen.frame.kind] ?? "数据";
  if (title) title.textContent = seen.frame.title;
  if (lines) {
    lines.replaceChildren();
    const rows = [...seen.frame.lines];
    if (state.retrieved && seen.frame.id === "search") {
      rows.push("取回的旧结果里有客单价 100 → 95");
      rows.push("不保证每次都能取回");
    }
    if (state.showFileRoot && state.scene === "boundary") {
      rows.push("文件写入范围只框住 write_file 和 patch");
    }
    for (const row of rows) {
      const li = document.createElement("li");
      li.textContent = row;
      lines.append(li);
    }
  }
  if (note) note.textContent = seen.note;
}

function paintPressed() {
  for (const button of document.querySelectorAll("button[data-do]")) {
    const action = button.dataset.do ?? "";
    const value = button.dataset.value ?? "";
    let pressed = false;
    if (action === "lens") pressed = state.lens === value;
    else if (action === "backend") pressed = state.backend === value;
    else if (action === "loop") pressed = state.loopBranch === value;
    else if (action === "decision") pressed = state.decision === value;
    else if (action === "file-root") pressed = state.showFileRoot;
    else if (action === "memory") pressed = state.keepMemory;
    else if (action === "skill") pressed = state.keepSkill;
    else if (action === "plane") pressed = state.plane === value;
    else if (action === "compress") pressed = state.compressBranch === value;
    else if (action === "retrieve") pressed = state.retrieved;
    else if (action === "schedule") pressed = state.scheduled;
    else if (action === "host") pressed = state.host === "offline";
    else if (action === "delivery") pressed = state.delivery === "fail";
    else if (action === "model") pressed = state.model === "down";
    else if (action === "trade") pressed = tradeId === (button.dataset.trade ?? "");
    else continue;
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    if (action === "decision") button.disabled = !commandGuard(state.backend).manual;
  }
}

function apply(next) {
  state = next;
  render();
  syncTimer();
}

function syncTimer() {
  window.clearInterval(timer);
  timer = 0;
  if (!state.playing || reduced) return;
  timer = window.setInterval(() => {
    state = tick(state);
    render();
    if (!state.playing) syncTimer();
  }, intervalMs(state));
}

function onClick(event) {
  const link = event.target instanceof Element ? event.target.closest("[data-scene-link]") : null;
  if (link) {
    event.preventDefault();
    const id = link.getAttribute("data-scene-link") ?? "";
    apply(selectScene(state, id));
    history.replaceState(null, "", `#${id}`);
    document.getElementById("stage")?.scrollIntoView({ block: "start" });
    return;
  }
  const button = event.target instanceof Element ? event.target.closest("button[data-do]") : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const action = button.dataset.do ?? "";
  const value = button.dataset.value ?? "";
  if (action === "play") apply(togglePlay(state, { reduced }));
  else if (action === "prev") apply(step(state, -1));
  else if (action === "next") apply(step(state, 1));
  else if (action === "replay") apply(replay(state));
  else if (action === "speed") apply({ ...state, speed: state.speed === 2 ? 1 : 2 });
  else if (action === "lens") apply(patch(state, { lens: value === "run" ? "run" : "ask" }));
  else if (action === "focus") {
    const node = button.dataset.node ?? "";
    if (NODES[node]) apply(patch(state, { focus: node }));
  }
  else if (action === "backend") {
    const backend = ["local", "docker", "docker-mount", "modal"].includes(value) ? value : "local";
    apply(patch(state, { backend }));
  }
  else if (action === "decision") {
    if (commandGuard(state.backend).manual) apply(patch(state, { decision: value === "deny" ? "deny" : "once" }));
  }
  else if (action === "file-root") apply(patch(state, { showFileRoot: !state.showFileRoot, focus: "file" }));
  else if (action === "loop") apply(patch(state, { loopBranch: value === "error" || value === "parallel" ? value : "read" }));
  else if (action === "memory") apply(patch(state, { keepMemory: !state.keepMemory }));
  else if (action === "skill") apply(patch(state, { keepSkill: !state.keepSkill }));
  else if (action === "plane") apply(patch(state, { plane: value === "disk" ? "disk" : "snapshot" }));
  else if (action === "compress") apply(patch(state, { compressBranch: value === "miss" ? "miss" : "kept" }));
  else if (action === "retrieve") apply(patch(state, { retrieved: !state.retrieved }));
  else if (action === "schedule") apply(patch(state, { scheduled: !state.scheduled }));
  else if (action === "host") apply(patch(state, { host: state.host === "offline" ? "online" : "offline" }));
  else if (action === "delivery") apply(patch(state, { delivery: state.delivery === "fail" ? "ok" : "fail" }));
  else if (action === "model") apply(patch(state, { model: state.model === "down" ? "ready" : "down" }));
  else if (action === "trade") {
    const id = button.dataset.trade ?? "";
    tradeId = tradeId === id ? "" : id;
    render();
  }
}

function onKey(event) {
  if (!(event.target instanceof HTMLElement)) return;
  if (event.target.closest(".rail")) {
    const links = [...document.querySelectorAll(".scene-link")];
    const index = links.indexOf(event.target);
    if (index < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      links[(index + 1) % links.length]?.focus();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      links[(index - 1 + links.length) % links.length]?.focus();
    }
    return;
  }
  if (!event.target.closest(".player")) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    apply(step(state, 1));
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    apply(step(state, -1));
  }
}

const opening = location.hash.replace("#", "");
if (SCENES.some((scene) => scene.id === opening)) state = selectScene(state, opening);
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
reducedQuery.addEventListener("change", () => {
  reduced = reducedQuery.matches;
  if (reduced && state.playing) state = { ...state, playing: false };
  render();
  syncTimer();
});
render();
