import {
  commandGuard,
  createStudy,
  intervalMs,
  patch,
  replay,
  selectScene,
  step,
  tick,
  togglePlay,
} from "./study.js";
import { picture } from "./machine.js";

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = reducedQuery.matches;
let state = createStudy();
let timer = 0;
let previous = { scene: "", mode: "", points: new Map() };

const svg = document.getElementById("machine");
const caption = document.getElementById("caption");
const progress = document.getElementById("progress");
const dock = document.getElementById("dock");

function mode() {
  return window.innerWidth <= 760 ? "narrow" : "wide";
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function render() {
  const layout = mode();
  const pic = picture(state, layout);
  const animate = state.playing && !reduced && previous.scene === state.scene && previous.mode === layout;
  svg.setAttribute("viewBox", pic.viewBox);
  svg.dataset.frame = pic.frameId;
  svg.dataset.backend = pic.exec.variant;
  svg.dataset.skip = pic.exec.skip ? "true" : "false";
  svg.innerHTML = draw(pic, animate ? previous.points : null);
  previous = {
    scene: state.scene,
    mode: layout,
    points: new Map(pic.tokens.map((token) => [token.id, { x: token.x, y: token.y }])),
  };
  const spoken = `${pic.frameTitle}。${pic.line}`;
  if (caption && caption.textContent !== spoken) caption.textContent = spoken;
  if (progress) progress.textContent = `第 ${pic.step} / ${pic.total} 步 · ${pic.frameTitle}`;
  paintChrome();
  if (dock) dock.innerHTML = dockMarkup();
}

function paintChrome() {
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
  for (const button of document.querySelectorAll("[data-do='scene']")) {
    const on = button.dataset.value === state.scene;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function dockMarkup() {
  return dockItems()
    .map((item) => {
      const pressed = pressedFor(item);
      const disabled = item.action === "decision" && !commandGuard(state.backend).manual;
      const value = item.value ? ` data-value="${esc(item.value)}"` : "";
      return `<button type="button" data-do="${esc(item.action)}"${value} aria-pressed="${pressed ? "true" : "false"}"${disabled ? " disabled" : ""}>${esc(item.label)}</button>`;
    })
    .join("");
}

function dockItems() {
  if (state.scene === "purpose") {
    return [
      { action: "lens", value: "ask", label: "模型在请求" },
      { action: "lens", value: "run", label: "运行时在执行" },
    ];
  }
  if (state.scene === "map" || state.scene === "boundary") {
    const items = [
      { action: "backend", value: "local", label: "本机" },
      { action: "backend", value: "docker", label: "Docker 隔离" },
      { action: "backend", value: "docker-mount", label: "Docker 挂载" },
      { action: "backend", value: "modal", label: "Modal 一类" },
    ];
    if (state.scene === "boundary") {
      items.push(
        { action: "decision", value: "deny", label: "拒绝" },
        { action: "decision", value: "once", label: "批准一次" },
        { action: "file-root", value: "", label: "只看文件写入" },
      );
    }
    return items;
  }
  if (state.scene === "loop") {
    return [
      { action: "loop", value: "read", label: "读一份" },
      { action: "loop", value: "parallel", label: "两个只读" },
      { action: "loop", value: "error", label: "读取失败" },
    ];
  }
  if (state.scene === "keep") {
    return [
      { action: "memory", value: "", label: "记下偏好" },
      { action: "skill", value: "", label: "存比较步骤" },
      { action: "plane", value: "snapshot", label: "看提示快照" },
      { action: "plane", value: "disk", label: "看磁盘" },
    ];
  }
  if (state.scene === "compress") {
    return [
      { action: "compress", value: "kept", label: "摘要留下要点" },
      { action: "compress", value: "miss", label: "摘要漏了客单价" },
    ];
  }
  return [
    { action: "schedule", value: "", label: "每天生成简报" },
    { action: "host", value: "offline", label: "主机离线" },
    { action: "delivery", value: "fail", label: "投递失败" },
    { action: "model", value: "down", label: "模型不可用" },
  ];
}

function pressedFor(item) {
  if (item.action === "lens") return state.lens === item.value;
  if (item.action === "backend") return state.backend === item.value;
  if (item.action === "loop") return state.loopBranch === item.value;
  if (item.action === "decision") return state.decision === item.value;
  if (item.action === "file-root") return state.showFileRoot;
  if (item.action === "memory") return state.keepMemory;
  if (item.action === "skill") return state.keepSkill;
  if (item.action === "plane") return state.plane === item.value;
  if (item.action === "compress") return state.compressBranch === item.value;
  if (item.action === "schedule") return state.scheduled;
  if (item.action === "host") return state.host === "offline";
  if (item.action === "delivery") return state.delivery === "fail";
  if (item.action === "model") return state.model === "down";
  return false;
}

function draw(pic, origins) {
  const rails = pic.rails.map((rail) => {
    const cls = rail.live ? "is-live" : pic.wiring ? "is-wire" : "is-quiet";
    const cut = rail.cut ? " is-cut" : "";
    return `<path class="rail rail-${rail.kind} ${cls}${cut}" data-flow="${esc(rail.id)}" data-rail="${esc(rail.id)}" data-dir="${rail.dir}" d="${pathD(rail.points)}" marker-end="url(#arrow)"/>`;
  }).join("");
  return `${defs()}
    ${rails}
    ${housing(pic)}
    ${port(pic, "cli")}
    ${port(pic, "gateway")}
    ${port(pic, "clock")}
    ${model(pic)}
    ${part(pic, "fresh", tray(pic.regions.fresh))}
    ${part(pic, "agent", rotor(pic.regions.agent, pic))}
    ${part(pic, "window", viewport(pic))}
    ${part(pic, "tools", bay(pic.regions.tools, "tools"))}
    ${part(pic, "file", bay(pic.regions.file, "file"))}
    ${part(pic, "code", bay(pic.regions.code, "code"))}
    ${exec(pic)}
    ${part(pic, "session", cabinet(pic))}
    ${part(pic, "memory", memory(pic))}
    ${part(pic, "skills", book(pic.regions.skills, pic))}
    ${pic.tokens.map((token) => tokenMarkup(token, origins)).join("")}`;
}

function defs() {
  return `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0 1 L9 5 L0 9 Z" fill="context-stroke"/>
    </marker>
  </defs>`;
}

function housing(pic) {
  const box = pic.regions.housing;
  const screws = [[18, 18], [box.w - 18, 18], [18, box.h - 18], [box.w - 18, box.h - 18]]
    .map(([dx, dy]) => `<circle class="screw" cx="${box.x + dx}" cy="${box.y + dy}" r="3.5"/>`)
    .join("");
  return part(pic, "housing", `<rect class="body chassis" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="16"/>${screws}`);
}

function port(pic, id) {
  const box = pic.regions[id];
  return part(pic, id, `<rect class="body jack" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10"/>`);
}

function model(pic) {
  const box = pic.regions.model;
  return part(pic, "model", `<rect class="body outside" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="16"/>`);
}

function tray(box) {
  return `<rect class="body tray" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8"/>
    <rect class="tray-well" x="${box.x + 8}" y="${box.y + 28}" width="${box.w - 16}" height="${Math.max(16, box.h - 40)}" rx="4"/>`;
}

function rotor(box, pic) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radius = Math.min(box.w, box.h) / 2 - 2;
  const ticks = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const inner = radius - 12;
    const outer = radius - 4;
    return `<line class="tick" x1="${cx + Math.cos(angle) * inner}" y1="${cy + Math.sin(angle) * inner}" x2="${cx + Math.cos(angle) * outer}" y2="${cy + Math.sin(angle) * outer}"/>`;
  }).join("");
  const span = (pic.step - 1) / Math.max(1, pic.total - 1);
  const arc = span > 0.02 ? `<path class="arc" d="${arcPath(cx, cy, radius - 16, -90, -90 + span * 300)}"/>` : "";
  return `<circle class="ring" cx="${cx}" cy="${cy}" r="${radius}"/>
    <circle class="hub" cx="${cx}" cy="${cy}" r="${radius - 18}"/>
    ${ticks}${arc}`;
}

function viewport(pic) {
  const box = pic.regions.window;
  const blocks = pic.meter ? blocksMarkup(box, pic.meter) : "";
  return `<rect class="body frame" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8"/>${blocks}`;
}

function blocksMarkup(box, meter) {
  const x0 = box.x + 8;
  const y = box.y + Math.min(46, box.h - 30);
  const width = box.w - 16;
  const height = Math.min(22, box.h - (y - box.y) - 8);
  let cursor = x0;
  return ["old", "summary", "recent"].map((key) => {
    const span = width * (meter[key] / 100);
    const rect = span > 0.8 ? `<rect class="block block-${key}" x="${cursor.toFixed(1)}" y="${y}" width="${span.toFixed(1)}" height="${height}" rx="3"/>` : "";
    cursor += span;
    return rect;
  }).join("");
}

function bay(box, kind) {
  return `<rect class="body bay bay-${kind}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8"/>`;
}

function exec(pic) {
  const box = pic.regions.exec;
  const variant = pic.exec.variant;
  const shape = variant === "local"
    ? `<path class="body hazard" d="${openRight(box)}"/>`
    : variant === "modal"
      ? `<polygon class="body chamfer" points="${chamfer(box)}"/>`
      : `<rect class="body shell" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12"/>
         <rect class="shell-inner" x="${box.x + 6}" y="${box.y + 6}" width="${box.w - 12}" height="${box.h - 12}" rx="8"/>`;
  const pipe = variant === "mount"
    ? `<rect class="pipe" x="${box.x + box.w - 18}" y="${box.y + box.h / 2 - 8}" width="14" height="16" rx="2"/>`
    : "";
  const gates = pic.gates.map((gate) => `<g class="gate ${gate.onPath ? "on" : "off"}"><rect x="${gate.x}" y="${gate.y}" width="${gate.w}" height="${gate.h}" rx="5"/></g>`).join("");
  return part(pic, "exec", `${shape}${pipe}${gates}${fence}`, `data-variant="${variant}" data-skip="${pic.exec.skip ? "true" : "false"}" data-floor="${pic.exec.floorOnPath ? "true" : "false"}"`);
}

function cabinet(pic) {
  const box = pic.regions.session;
  const top = box.y + 86;
  const shelves = [0, 1, 2, 3].map((index) => {
    const y = top + index * ((box.h - 100) / 3);
    return `<line class="shelf" x1="${box.x + 10}" y1="${y}" x2="${box.x + box.w - 10}" y2="${y}"/>`;
  }).join("");
  return `<rect class="body cabinet" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8"/>${shelves}`;
}

function memory(pic) {
  const disk = pic.plates.disk;
  const snap = pic.plates.snap;
  return `<rect class="body memory-bay" x="${pic.regions.memory.x}" y="${pic.regions.memory.y}" width="${pic.regions.memory.w}" height="${pic.regions.memory.h}" rx="8"/>
    <rect class="disk ${pic.plane === "disk" ? "is-chosen" : ""}" data-store="disk" x="${disk.x}" y="${disk.y}" width="${disk.w}" height="${disk.h}" rx="6"/>
    <rect class="snap ${pic.plane === "snapshot" ? "is-chosen" : ""}" data-store="snapshot" x="${snap.x}" y="${snap.y}" width="${snap.w}" height="${snap.h}" rx="6"/>`;
}

function book(box, pic) {
  const pages = pic.skillBody
    ? `<rect class="page" x="${box.x + 12}" y="${box.y + 64}" width="${box.w - 24}" height="${box.h - 78}" rx="3"/>`
    : `<rect class="page shut" x="${box.x + 12}" y="${box.y + 64}" width="${box.w - 24}" height="14" rx="3"/>`;
  return `<rect class="body book" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="6"/>
    <rect class="tab" x="${box.x + box.w - 46}" y="${box.y + 8}" width="34" height="12" rx="2"/>
    ${pages}`;
}

function part(pic, id, body, extra = "") {
  const stateClass = id === "housing" ? "is-on" : pic.lit.has(id) ? "is-hot" : "is-dim";
  const fence = id === "file" && pic.fileFence ? fenceOf(pic.regions.file) : "";
  const texts = pic.labels.filter((item) => item.part === id).map(textTag).join("");
  return `<g class="part ${stateClass}" data-part="${id}" ${extra}>${body}${fence}${texts}</g>`;
}

function fenceOf(box) {
  return `<rect class="fence" x="${box.x + 3}" y="${box.y + 3}" width="${box.w - 6}" height="${box.h - 6}" rx="6"/>`;
}

function textTag(item) {
  const tone = item.tone === "light" ? ` class="on-dark"` : "";
  const readout = item.readout ? ` data-readout="${esc(item.readout)}"` : "";
  return `<text x="${item.x}" y="${item.y}" font-size="${item.font}" text-anchor="${item.anchor}"${tone}${readout}>${esc(item.text)}</text>`;
}

function tokenMarkup(token, origins) {
  const prev = origins?.get(token.id);
  const motion = prev ? `<animateTransform attributeName="transform" type="translate" from="${prev.x} ${prev.y}" to="${token.x} ${token.y}" dur="0.45s" fill="freeze"/>` : "";
  const x = -token.w / 2;
  return `<g class="token" data-kind="${esc(token.kind)}" data-token="${esc(token.text)}" transform="translate(${token.x} ${token.y})">${motion}
    <rect x="${x}" y="${-token.h / 2}" width="${token.w}" height="${token.h}" rx="11"/>
    <text class="mark" x="${x + 12}" y="4" text-anchor="middle">${esc(token.mark)}</text>
    <text class="chip" x="${x + 22}" y="4" text-anchor="start">${esc(token.text)}</text>
  </g>`;
}

function pathD(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function openRight(box) {
  const r = 12;
  return `M${box.x + box.w} ${box.y} H${box.x + r} Q${box.x} ${box.y} ${box.x} ${box.y + r} V${box.y + box.h - r} Q${box.x} ${box.y + box.h} ${box.x + r} ${box.y + box.h} H${box.x + box.w}`;
}

function chamfer(box) {
  const c = 14;
  return `${box.x + c},${box.y} ${box.x + box.w - c},${box.y} ${box.x + box.w},${box.y + c} ${box.x + box.w},${box.y + box.h - c} ${box.x + box.w - c},${box.y + box.h} ${box.x + c},${box.y + box.h} ${box.x},${box.y + box.h - c} ${box.x},${box.y + c}`;
}

function arcPath(cx, cy, radius, start, end) {
  const a = polar(cx, cy, radius, end);
  const b = polar(cx, cy, radius, start);
  const large = end - start > 180 ? 1 : 0;
  return `M${a.x} ${a.y} A${radius} ${radius} 0 ${large} 0 ${b.x} ${b.y}`;
}

function polar(cx, cy, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
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
  const button = event.target instanceof Element ? event.target.closest("button[data-do]") : null;
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  const action = button.dataset.do ?? "";
  const value = button.dataset.value ?? "";
  if (action === "play") apply(togglePlay(state, { reduced }));
  else if (action === "prev") apply(step(state, -1));
  else if (action === "next") apply(step(state, 1));
  else if (action === "replay") apply(replay(state));
  else if (action === "speed") apply(patch(state, { speed: state.speed === 2 ? 1 : 2 }));
  else if (action === "scene") apply(selectScene(state, value));
  else if (action === "lens") apply(patch(state, { lens: value === "run" ? "run" : "ask" }));
  else if (action === "backend") apply(patch(state, { backend: ["docker", "docker-mount", "modal"].includes(value) ? value : "local" }));
  else if (action === "decision" && commandGuard(state.backend).manual) apply(patch(state, { decision: value === "deny" ? "deny" : "once" }));
  else if (action === "file-root") apply(patch(state, { showFileRoot: !state.showFileRoot }));
  else if (action === "loop") apply(patch(state, { loopBranch: value === "error" || value === "parallel" ? value : "read" }));
  else if (action === "memory") apply(patch(state, { keepMemory: !state.keepMemory }));
  else if (action === "skill") apply(patch(state, { keepSkill: !state.keepSkill }));
  else if (action === "plane") apply(patch(state, { plane: value === "disk" ? "disk" : "snapshot" }));
  else if (action === "compress") apply(patch(state, { compressBranch: value === "miss" ? "miss" : "kept" }));
  else if (action === "schedule") apply(patch(state, { scheduled: !state.scheduled }));
  else if (action === "host") apply(patch(state, { host: state.host === "offline" ? "online" : "offline" }));
  else if (action === "delivery") apply(patch(state, { delivery: state.delivery === "fail" ? "ok" : "fail" }));
  else if (action === "model") apply(patch(state, { model: state.model === "down" ? "ready" : "down" }));
}

function onKey(event) {
  if (!(event.target instanceof HTMLElement)) return;
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
if (["purpose", "map", "loop", "boundary", "keep", "compress", "again"].includes(opening)) state = selectScene(state, opening);
document.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);
window.addEventListener("resize", () => render());
window.matchMedia("(max-width: 760px)").addEventListener("change", () => render());
reducedQuery.addEventListener("change", () => {
  reduced = reducedQuery.matches;
  if (reduced && state.playing) state = { ...state, playing: false };
  render();
  syncTimer();
});
render();
