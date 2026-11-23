/**
 * 同一台 Hermes 的剖面坐标。场景只改照明和令牌，不换一套版式。
 * 机制数字来自 study.js，对应 hermes-agent v0.23.2 / ae2a81cc。
 */

import { commandGuard, view } from "./study.js";

const WIDE = {
  viewBox: [0, 0, 1120, 760],
  regions: {
    cli: { x: 16, y: 28, w: 158, h: 76 },
    gateway: { x: 16, y: 116, w: 158, h: 88 },
    clock: { x: 16, y: 216, w: 158, h: 76 },
    model: { x: 860, y: 28, w: 244, h: 268 },
    housing: { x: 196, y: 16, w: 640, h: 728 },
    fresh: { x: 214, y: 46, w: 132, h: 78 },
    agent: { x: 362, y: 40, w: 168, h: 168 },
    window: { x: 548, y: 46, w: 268, h: 158 },
    tools: { x: 214, y: 268, w: 206, h: 78 },
    file: { x: 214, y: 362, w: 206, h: 104 },
    code: { x: 214, y: 494, w: 206, h: 56 },
    exec: { x: 438, y: 268, w: 376, h: 282 },
    session: { x: 214, y: 564, w: 192, h: 156 },
    memory: { x: 420, y: 564, w: 200, h: 156 },
    skills: { x: 634, y: 564, w: 180, h: 156 },
  },
};

const NARROW = {
  viewBox: [0, 0, 390, 900],
  regions: {
    cli: { x: 8, y: 8, w: 120, h: 58 },
    gateway: { x: 134, y: 8, w: 122, h: 58 },
    clock: { x: 262, y: 8, w: 120, h: 58 },
    model: { x: 8, y: 74, w: 374, h: 112 },
    housing: { x: 8, y: 198, w: 374, h: 688 },
    fresh: { x: 20, y: 228, w: 108, h: 86 },
    agent: { x: 140, y: 220, w: 118, h: 118 },
    window: { x: 20, y: 354, w: 350, h: 76 },
    tools: { x: 20, y: 444, w: 164, h: 58 },
    file: { x: 20, y: 524, w: 164, h: 78 },
    code: { x: 20, y: 624, w: 164, h: 48 },
    exec: { x: 196, y: 444, w: 174, h: 228 },
    session: { x: 20, y: 688, w: 112, h: 180 },
    memory: { x: 140, y: 688, w: 114, h: 180 },
    skills: { x: 262, y: 688, w: 108, h: 180 },
  },
};

const PARENT = {
  fresh: "housing",
  agent: "housing",
  window: "housing",
  tools: "housing",
  file: "housing",
  code: "housing",
  exec: "housing",
  session: "housing",
  memory: "housing",
  skills: "housing",
};

export function layoutFor(mode) {
  return mode === "narrow" ? NARROW : WIDE;
}

export function textWidth(text, font) {
  let width = 0;
  for (const ch of String(text)) {
    if (ch === " ") width += font * 0.32;
    else if (/[0-9A-Za-z_.,:%→+\-×/]/.test(ch)) width += font * 0.6;
    else width += font * 1;
  }
  return width;
}

function midX(rect) {
  return rect.x + rect.w / 2;
}

function midY(rect) {
  return rect.y + rect.h / 2;
}

function railsFor(regions, mode) {
  const box = regions;
  if (mode === "narrow") {
    return {
      "in-cli": [bottom(box.cli), { x: midX(box.cli), y: box.agent.y }, { x: box.agent.x, y: box.agent.y }],
      "in-gateway": [bottom(box.gateway), { x: midX(box.gateway), y: box.agent.y - 8 }, { x: midX(box.agent), y: box.agent.y - 8 }, top(box.agent)],
      "ask-model": [top(box.agent), { x: midX(box.agent), y: box.model.y + box.model.h }],
      "model-back": [{ x: midX(box.model), y: box.model.y + box.model.h }, { x: midX(box.window), y: box.model.y + box.model.h }, top(box.window)],
      "to-tools": [bottom(box.window), top(box.tools)],
      "to-exec": [right(box.tools), left(box.exec)],
      "to-file": [bottom(box.tools), top(box.file)],
      "file-back": [top(box.file), { x: midX(box.file), y: box.window.y + box.window.h }, { x: box.window.x + 28, y: box.window.y + box.window.h }],
      "to-session": [bottom(box.exec), { x: midX(box.session), y: box.exec.y + box.exec.h }, top(box.session)],
      "to-code": [bottom(box.file), top(box.code)],
      deliver: [left(box.window), { x: box.gateway.x + box.gateway.w / 2, y: midY(box.window) }, bottom(box.gateway)],
      cron: [bottom(box.clock), { x: midX(box.clock), y: box.fresh.y }, top(box.fresh)],
    };
  }
  return {
    "in-cli": [right(box.cli), { x: box.fresh.x - 12, y: midY(box.cli) }, { x: box.fresh.x - 12, y: midY(box.fresh) }, left(box.fresh)],
    "in-gateway": [right(box.gateway), { x: box.agent.x - 16, y: midY(box.gateway) }, { x: box.agent.x - 16, y: midY(box.agent) }, left(box.agent)],
    "ask-model": [right(box.window), { x: box.model.x, y: box.window.y + 48 }],
    "model-back": [{ x: box.model.x, y: box.window.y + 96 }, { x: box.window.x + box.window.w, y: box.window.y + 96 }],
    "to-tools": [{ x: midX(box.agent), y: box.agent.y + box.agent.h }, { x: midX(box.agent), y: box.tools.y - 14 }, { x: midX(box.tools), y: box.tools.y - 14 }, top(box.tools)],
    "to-exec": [right(box.tools), { x: box.exec.x, y: midY(box.tools) }],
    "to-file": [bottom(box.tools), top(box.file)],
    "file-back": [left(box.file), { x: box.housing.x + 12, y: midY(box.file) }, { x: box.housing.x + 12, y: box.agent.y + box.agent.h - 28 }, { x: box.agent.x, y: box.agent.y + box.agent.h - 28 }],
    "to-session": [bottom(box.file), { x: midX(box.session), y: box.file.y + box.file.h }, top(box.session)],
    "to-code": [bottom(box.file), { x: midX(box.code), y: box.file.y + box.file.h }, top(box.code)],
    deliver: [left(box.agent), { x: box.gateway.x + box.gateway.w + 18, y: box.agent.y + 36 }, { x: box.gateway.x + box.gateway.w + 18, y: midY(box.gateway) }, right(box.gateway)],
    cron: [right(box.clock), { x: box.fresh.x - 12, y: midY(box.clock) }, { x: box.fresh.x - 12, y: box.fresh.y + box.fresh.h }, bottom(box.fresh)],
  };
}

function top(rect) {
  return { x: midX(rect), y: rect.y };
}
function bottom(rect) {
  return { x: midX(rect), y: rect.y + rect.h };
}
function left(rect) {
  return { x: rect.x, y: midY(rect) };
}
function right(rect) {
  return { x: rect.x + rect.w, y: midY(rect) };
}

export const DIRECTIONS = {
  wide: {
    "in-cli": { dx: 1 },
    "in-gateway": { dx: 1 },
    "ask-model": { dx: 1 },
    "model-back": { dx: -1 },
    "to-tools": { dy: 1 },
    "to-exec": { dx: 1 },
    "to-file": { dy: 1 },
    "file-back": { dy: -1 },
    "to-session": { dy: 1 },
    "to-code": { dy: 1 },
    deliver: { dx: -1 },
    cron: { dx: 1 },
  },
  narrow: {
    "in-cli": { dy: 1 },
    "in-gateway": { dy: 1 },
    "ask-model": { dy: -1 },
    "model-back": { dy: 1 },
    "to-tools": { dy: 1 },
    "to-exec": { dx: 1 },
    "to-file": { dy: 1 },
    "file-back": { dy: -1 },
    "to-session": { dy: 1 },
    "to-code": { dy: 1 },
    deliver: { dy: -1 },
    cron: { dy: 1 },
  },
};

const RAIL_KIND = {
  "in-cli": "control",
  "in-gateway": "control",
  "ask-model": "data",
  "model-back": "data",
  "to-tools": "control",
  "to-exec": "warn",
  "to-file": "data",
  "file-back": "data",
  "to-session": "persist",
  "to-code": "warn",
  deliver: "persist",
  cron: "control",
};

function endDirection(points) {
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

function netVector(points) {
  return {
    dx: points[points.length - 1].x - points[0].x,
    dy: points[points.length - 1].y - points[0].y,
  };
}

const MARK = {
  user: "入",
  call: "请",
  result: "果",
  brief: "报",
  memory: "记",
  summary: "摘",
  simplify: "简",
  error: "误",
  file: "档",
  command: "令",
};

function tokenSize(text, font) {
  return { w: Math.ceil(textWidth(text, font) + 28), h: 22 };
}

function dockPoint(regions, regionId, ox, oy) {
  const rect = regions[regionId];
  return { x: midX(rect) + ox, y: rect.y + rect.h - 16 + oy };
}

function execProfile(backend) {
  const guard = commandGuard(backend);
  if (guard.reason === "docker-isolated") {
    return {
      variant: "docker",
      skip: true,
      floorOnPath: false,
      manual: false,
      short: "Docker · 无主机挂载",
      lines: ["没有主机路径挂载", "危险命令检查提前返回", "仍看用户拒绝规则", "硬性底线不在这条提前返回里"],
      gates: [
        { id: "deny", title: "用户拒绝", onPath: true },
        { id: "skip", title: "检查跳过", onPath: false },
        { id: "floor", title: "底线不到", onPath: false },
      ],
    };
  }
  if (guard.reason === "modal-class") {
    return {
      variant: "modal",
      skip: true,
      floorOnPath: false,
      manual: false,
      short: "Modal 一类 · 总是跳过",
      lines: ["modal、daytona、vercel", "总是跳过这层检查", "不看有没有主机路径", "底线不在提前返回里"],
      gates: [
        { id: "deny", title: "用户拒绝", onPath: true },
        { id: "skip", title: "总是跳过", onPath: false },
        { id: "floor", title: "底线不到", onPath: false },
      ],
    };
  }
  if (guard.reason === "docker-host-mount") {
    return {
      variant: "mount",
      skip: false,
      floorOnPath: true,
      manual: true,
      short: "Docker · 挂了主机路径",
      lines: ["主机路径挂载，不走快路径", "先走硬性底线", "手动批准只是显式 manual"],
      gates: [
        { id: "floor", title: "底线", onPath: true },
        { id: "manual", title: "等待批准", onPath: true },
      ],
    };
  }
  return {
    variant: "local",
    skip: false,
    floorOnPath: true,
    manual: true,
    short: "本机 · 无容器隔离",
    lines: ["本机执行没有容器隔离", "先走硬性底线", "手动批准只是显式 manual"],
    gates: [
      { id: "floor", title: "底线", onPath: true },
      { id: "manual", title: "等待批准", onPath: true },
    ],
  };
}

function placeGates(exec, profile, mode) {
  const showDetail = profile.detail;
  const lineH = mode === "narrow" ? 13 : 15;
  const lastBaseline = showDetail ? 52 + (profile.lines.length - 1) * lineH : 36;
  const topY = exec.y + lastBaseline + 12;
  const gates = profile.gates;
  const innerW = exec.w - 16;
  if (mode === "narrow" || profile.variant === "docker" || profile.variant === "modal") {
    const gap = 5;
    const avail = exec.y + exec.h - topY - 8;
    const gateH = Math.min(28, (avail - gap * (gates.length - 1)) / gates.length);
    return gates.map((gate, index) => ({
      ...gate,
      x: exec.x + 8,
      y: topY + index * (gateH + gap),
      w: innerW,
      h: gateH,
    }));
  }
  const gateW = (innerW - 8 * (gates.length - 1)) / gates.length;
  return gates.map((gate, index) => ({
    ...gate,
    x: exec.x + 8 + index * (gateW + 8),
    y: topY,
    w: gateW,
    h: Math.min(44, exec.y + exec.h - topY - 10),
  }));
}

function memoryPlates(memory) {
  const gap = 6;
  const top = memory.y + 36;
  const height = (memory.h - 48 - gap) / 2;
  return {
    disk: { x: memory.x + 8, y: top, w: memory.w - 16, h: height },
    snap: { x: memory.x + 8, y: top + height + gap, w: memory.w - 16, h: height },
  };
}

function label(part, text, x, y, font, anchor = "middle", extra = {}) {
  return { part, text, x, y, font, anchor, ...extra };
}

function buildLabels(regions, spec, mode, plates, gates) {
  const title = mode === "narrow" ? 13 : 15;
  const sub = mode === "narrow" ? 11 : 12;
  const fine = mode === "narrow" ? 10 : 11;
  const labels = [];
  const add = (part, text, x, y, font, anchor, extra) => {
    if (text) labels.push(label(part, text, x, y, font, anchor, extra));
  };
  const titleAt = (id, text, fontSize = title) => add(id, text, regions[id].x + 10, regions[id].y + 18, fontSize, "start");

  titleAt("cli", "CLI");
  add("cli", "入口", regions.cli.x + 10, regions.cli.y + 36, sub, "start");
  titleAt("gateway", "Gateway", mode === "narrow" ? 12 : 15);
  add("gateway", "入口 · 投递", regions.gateway.x + 8, regions.gateway.y + 36, sub, "start");
  titleAt("clock", "时钟");
  add("clock", "到点触发", regions.clock.x + 10, regions.clock.y + 36, sub, "start");
  add("housing", "Hermes 进程", midX(regions.housing), regions.housing.y + 15, sub, "middle");
  add("model", "模型提供者", midX(regions.model), regions.model.y + 20, title, "middle");
  add("model", "进程外 · 只返回文本或工具请求", midX(regions.model), regions.model.y + 40, fine, "middle");
  add("model", "没有改模型权重", midX(regions.model), regions.model.y + 58, fine, "middle");
  add("agent", "AIAgent", midX(regions.agent), midY(regions.agent) - 6, mode === "narrow" ? 12 : 15, "middle", { tone: "light" });
  add("agent", "循环引擎", midX(regions.agent), midY(regions.agent) + 12, sub, "middle", { tone: "light" });
  add("agent", "不是模型", midX(regions.agent), midY(regions.agent) + 28, fine, "middle", { tone: "light" });
  titleAt("fresh", "新会话", sub);
  add("fresh", spec.freshNote, regions.fresh.x + 8, regions.fresh.y + 36, fine, "start");
  titleAt("window", "本轮窗口");
  titleAt("tools", "工具分发");
  titleAt("file", "读文件");
  add("file", spec.fileNote, regions.file.x + 10, regions.file.y + 36, fine, "start");
  titleAt("code", "execute_code", fine);
  add("code", spec.codeNote, regions.code.x + 8, regions.code.y + 34, fine, "start");
  titleAt("exec", "执行环境");
  add("exec", spec.exec.short, regions.exec.x + 10, regions.exec.y + 36, fine, "start");
  if (spec.execDetail) {
    spec.exec.lines.forEach((text, index) => {
      add("exec", text, regions.exec.x + 10, regions.exec.y + 52 + index * (mode === "narrow" ? 13 : 15), fine, "start");
    });
  }
  titleAt("session", "会话库");
  add("session", "历史仓库", regions.session.x + 10, regions.session.y + 36, fine, "start");
  titleAt("memory", "短记忆");
  add("skills", "技能", regions.skills.x + 10, regions.skills.y + 18, title, "start");
  add("skills", "先索引", regions.skills.x + 10, regions.skills.y + 40, fine, "start");
  add("skills", spec.skillBody ? "正文已读出" : "正文按需", regions.skills.x + 10, regions.skills.y + 56, fine, "start");

  add("memory", "磁盘", midX(plates.disk), plates.disk.y + 14, fine, "middle");
  add("memory", spec.diskText, midX(plates.disk), plates.disk.y + plates.disk.h / 2 + 8, fine, "middle", { readout: spec.plane === "disk" ? "memory" : "" });
  add("memory", "写入立即在这", midX(plates.disk), plates.disk.y + plates.disk.h - 6, mode === "narrow" ? 9 : 10, "middle");
  add("memory", "提示快照", midX(plates.snap), plates.snap.y + 14, fine, "middle");
  add("memory", spec.snapText, midX(plates.snap), plates.snap.y + plates.snap.h / 2 + 8, fine, "middle", { readout: spec.plane === "snapshot" ? "memory" : "" });
  add("memory", "新会话或重建才换", midX(plates.snap), plates.snap.y + plates.snap.h - 6, mode === "narrow" ? 9 : 10, "middle");

  if (spec.meter) {
    add("window", `模拟 ${spec.meter.input}`, regions.window.x + regions.window.w - 8, regions.window.y + 18, sub, "end", { readout: "input" });
    add("session", `模拟 ${spec.meter.archive}`, regions.session.x + regions.session.w - 8, regions.session.y + 18, fine, "end", { readout: "archive" });
    add("session", "同一会话 id", regions.session.x + 10, regions.session.y + 54, fine, "start");
    if (spec.meter.summary > 0 || spec.meter.old < 70) add("session", "软归档", regions.session.x + 10, regions.session.y + 72, fine, "start");
  }
  spec.windowLines.forEach((text, index) => {
    add("window", text, regions.window.x + 10, regions.window.y + 40 + index * (mode === "narrow" ? 14 : 16), fine, "start");
  });
  for (const gate of gates) {
    add("exec", gate.title, gate.x + gate.w / 2, gate.y + gate.h / 2 + 4, fine, "middle");
  }
  if (spec.fileFence) add("file", "只围文件写入", regions.file.x + 10, regions.file.y + regions.file.h - 8, fine, "start");
  return labels.filter((item) => item.text !== "");
}

function story(study, seen) {
  const frame = seen.frame;
  const id = `${study.scene}:${frame.id}`;
  const brief = ["订单 +20%", "收入 +14%", "客单价 100→95（-5%）"];
  const base = {
    lit: new Set(["agent"]),
    rails: new Set(),
    tokens: [],
    line: seen.note,
    windowLines: [],
    freshNote: "默认不带旧聊天",
    fileNote: "不经终端",
    codeNote: "不走终端那道门",
    diskText: "（空）",
    snapText: "（空）",
    skillBody: false,
    meter: null,
    execDetail: false,
    fileFence: false,
    cutCron: false,
    plane: study.plane,
  };
  const scripts = {
    "purpose:task": { lit: ["cli", "agent"], rails: ["in-cli"], tokens: [tok("msg", "用户消息", "user", "cli")], line: "用户消息进到循环引擎，模型还没被叫。", windowLines: ["比较两份 CSV"] },
    "purpose:need": { lit: ["agent", "model", "window"], rails: ["ask-model"], tokens: [tok("msg", "看不见文件", "user", "model", 0, modeShift(study))], line: "模型看不见 CSV，只能返回文本或工具请求。", windowLines: ["文件内容：无"] },
    "purpose:request": { lit: ["model", "agent", "file"], rails: ["model-back", "to-file"], tokens: [tok("call", "tool_call", "call", "model", 0, modeShift(study))], line: "tool_call 飞出来读 yesterday.csv，文件还没打开。", fileNote: "尚未打开" },
    "purpose:data": { lit: ["file", "model", "agent"], rails: ["file-back", "ask-model"], tokens: [tok("row", "订单 100", "result", "file"), tok("file", "yesterday.csv", "file", "model", 0, modeShift(study))], line: "运行时读到订单 100，结果送回模型。", fileNote: "订单 100 · 收入 10000" },
    "purpose:compute": { lit: ["model", "window", "agent"], rails: ["ask-model"], tokens: [tok("row", "订单 100", "result", "window"), tok("again", "今日同路", "simplify", "model", 0, modeShift(study))], line: "模型看见结果。今日文件是同一种往返。", windowLines: ["订单 100 已在窗口"] },
    "purpose:brief": { lit: ["model", "window", "gateway"], rails: ["model-back", "deliver"], tokens: [tok("brief", "简报", "brief", "gateway")], line: "模型返回简报。权重没有改。", windowLines: brief },
    "map:arrive": { rails: ["in-cli", "in-gateway"], tokens: [tok("msg", "用户消息", "user", "cli")], line: "CLI 和 Gateway 都把同一句任务送进同一个引擎。" },
    "map:prepare": { lit: ["agent", "window", "session", "memory", "skills"], rails: ["to-session"], tokens: [tok("pack", "历史+索引", "file", "window")], line: "这一轮窗口装进历史、记忆快照和技能索引。", windowLines: ["历史", "快照", "索引"] },
    "map:request": { lit: ["agent", "model", "window"], rails: ["ask-model"], tokens: [tok("ask", "请求", "call", "model", 0, modeShift(study))], line: "请求穿过进程壁，模型在虚线框外面。" },
    "map:dispatch": { lit: ["tools", "agent"], rails: ["to-tools"], tokens: [tok("call", "tool_call", "call", "tools")], line: "运行时拆开工具名和参数，模型并不自己执行。" },
    "map:execute": { lit: ["exec", "file", "code"], rails: ["to-exec", "to-file", "to-code"], tokens: [tok("go", "执行", "command", "file")], line: "终端走执行环境。读文件和 execute_code 不进那道门。", execDetail: true },
    "map:save": { lit: ["session", "memory", "skills"], rails: ["to-session"], tokens: [tok("save", "记录", "memory", "session", 0, -20)], line: "三份存储分开。记下的不是模型权重。", diskText: "事实", snapText: "快照" },
    "loop:lookup": { lit: ["session", "agent"], rails: ["to-session"], tokens: [tok("key", "会话键", "file", "session", 0, -20)], line: "按会话取出历史，不是把整个库重发。" },
    "loop:assemble": { lit: ["window", "agent", "memory", "skills"], tokens: [tok("pack", "消息包", "file", "window")], line: "提示复用已保存的字节。技能先只放索引。", windowLines: ["技能索引"] },
    "loop:request": { lit: ["model", "window"], rails: ["ask-model"], tokens: [tok("ask", "请求", "call", "model", 0, modeShift(study))], line: "一次用户消息可以变成多次模型请求。" },
    "loop:call": { lit: ["model", "file"], rails: ["model-back"], tokens: [tok("call", "tool_call", "call", "file")], line: "模型请求 read yesterday.csv。运行时还没读。", fileNote: "yesterday.csv" },
    "loop:run": { lit: ["file"], rails: ["to-file"], tokens: [tok("row", "订单 100", "result", "file")], line: "运行时读到订单 100、收入 10000。", fileNote: "订单 100 · 10000" },
    "loop:append": { lit: ["session"], rails: ["to-session"], tokens: [tok("tool", "tool 结果", "result", "session", 0, -20)], line: "结果按 tool_call id 追加进会话库。" },
    "loop:again": { lit: ["model", "window"], rails: ["ask-model"], tokens: [tok("back", "工具结果", "result", "model", 0, modeShift(study))], line: "结果先回到模型，这是下一次请求。" },
    "loop:answer": { lit: ["model", "window"], rails: ["model-back"], tokens: [tok("brief", "简报", "brief", "window")], line: "模型返回简报文本。", windowLines: brief },
    "loop:save": { lit: ["session"], rails: ["to-session"], tokens: [tok("save", "简报", "brief", "session", 0, -20)], line: "简报写入会话库。" },
    "loop:batch": { lit: ["model"], rails: ["model-back"], tokens: [tok("a", "yesterday.csv", "file", "file", 0, -8), tok("b", "today.csv", "file", "file", 0, 14)], line: "模型一次交出两个只读请求。" },
    "loop:parallel": { lit: ["file"], rails: ["to-file"], tokens: [tok("a", "昨日", "file", "file", 0, -10), tok("b", "今日", "file", "file", 0, 12)], line: "两个只读可以同时跑。这里不演示两次写入。" },
    "loop:ordered": { lit: ["session", "file"], rails: ["to-session"], tokens: [tok("a", "先昨日", "result", "session", 0, -8), tok("b", "后今日", "result", "session", 0, -34)], line: "结果按原来的调用顺序放回。" },
    "loop:fail": { lit: ["file"], rails: ["to-file"], tokens: [tok("err", "error", "error", "file")], line: "处理器异常被包成错误结果。不是自愈。", fileNote: "文件不可读" },
    "loop:back": { lit: ["model"], rails: ["file-back", "ask-model"], tokens: [tok("err", "error", "error", "model", 0, modeShift(study))], line: "错误回到模型。不保证它能修好。" },
    "loop:stop": { lit: ["agent"], tokens: [tok("stop", "停止", "error", "window")], line: "这条演示停在这里，不是必然自愈。" },
    "boundary:who": { lit: ["gateway", "agent"], rails: ["in-gateway"], tokens: [tok("who", "允许的人", "user", "gateway")], line: "先看是谁。没通过授权，进不了循环。" },
    "boundary:request": { lit: ["exec", "model"], rails: ["model-back", "to-exec"], tokens: [tok("cmd", "命令请求", "command", "tools")], line: "模型请求一条命令。页面不展示可复制命令。", execDetail: true },
    "boundary:match": { lit: ["exec"], rails: ["to-exec"], tokens: [tok("cmd", "普通检查", "command", "tools")], line: "没走容器快路径时，才先碰到硬性底线。", execDetail: true },
    "boundary:wait": { lit: ["exec"], rails: ["to-exec"], tokens: [tok("cmd", "等待人", "command", "tools")], line: "这是显式的 manual，不是每个工具的全局默认。", execDetail: true },
    "boundary:result": { lit: ["exec"], rails: ["to-exec"], tokens: [tok("cmd", study.decision === "deny" ? "未执行" : study.decision === "once" ? "执行一次" : "仍等待", "command", "tools")], line: study.decision === "deny" ? "拒绝之后命令没有执行。" : study.decision === "once" ? "只批准这一次。停止不会收回已经写出的内容。" : "还没有批准，也还没有执行。", execDetail: true },
    "boundary:skip": { lit: ["exec"], rails: ["to-exec"], tokens: [tok("cmd", "提前返回", "command", "tools")], line: "危险命令检查提前返回。底线不在这条返回上。", execDetail: true },
    "boundary:scope": { lit: ["code", "exec"], rails: ["to-code"], tokens: [tok("code", "另一条", "command", "code")], line: "execute_code 的隔离返回不看那份拒绝规则。", execDetail: true, codeNote: "隔离则直接放行" },
    "keep:done": { lit: ["window", "session", "memory", "skills", "model"], tokens: [tok("brief", "简报", "brief", "window")], line: "简报在这一轮窗口里。四份东西还没分开。", windowLines: brief },
    "keep:choose": { lit: ["memory", "skills"], line: "短记忆和技能都要明确选择，不会自动写。" },
    "keep:disk": { lit: ["memory", "skills"], rails: ["to-session"], line: "选中的项写入磁盘。提示快照先不动。" },
    "keep:frozen": { lit: ["memory", "window"], line: "磁盘已经更新，这一轮系统提示仍是旧快照。" },
    "keep:next": { lit: ["fresh", "session"], rails: ["cron"], line: "新会话不自动带上全部旧消息。", freshNote: "另一轮" },
    "keep:load": { lit: ["memory"], line: "新会话开始时，快照才按磁盘重载。" },
    "keep:index": { lit: ["skills", "window"], line: "模型先看见技能索引，还不是正文。", windowLines: [study.keepSkill ? "索引：比较两份 CSV" : "索引里没有这次"] },
    "keep:read": { lit: ["skills", "model"], rails: ["ask-model"], tokens: [tok("body", study.keepSkill ? "正文" : "无正文", "file", "model", 0, modeShift(study))], line: study.keepSkill ? "skill_view 读到的仍是文本，不是新工具，也不是权重。" : "没有正文可读。模型权重没有变化。", skillBody: study.keepSkill },
    "compress:pile": { lit: ["window", "session"], line: "本轮窗口和会话库不是同一叠。", meter: frame.meter },
    "compress:threshold": { lit: ["window"], line: "接近这条演示的阈值。不是所有模型到同一个比例就压缩。", meter: frame.meter },
    "compress:prune": { lit: ["window", "session"], line: "缩短的是要送出的内容。库里的原文还在。", meter: frame.meter },
    "compress:summary": { lit: ["window", "model"], rails: ["ask-model"], tokens: [tok("sum", frame.lines.some((line) => line.includes("客单价")) ? "摘要缺项" : "摘要", "summary", "model", 0, modeShift(study))], line: seen.note, meter: frame.meter },
    "compress:tail": { lit: ["window"], line: "近期消息仍是原文。主图不写死保留几条。", meter: frame.meter },
    "compress:continue": { lit: ["window", "model", "session", "memory"], rails: ["ask-model"], tokens: [tok("sum", "摘要+近期", "summary", "model", 0, modeShift(study))], line: "默认原地压缩，会话 id 不变。重建提示时快照会重载。", meter: frame.meter },
    "compress:gap": { lit: ["window"], line: "摘要把客单价漏了。压缩是有损的。", meter: frame.meter },
    "compress:search": { lit: ["session"], rails: ["to-session"], tokens: [tok("find", "检索", "file", "session", 0, -28)], line: "从库里找，不从摘要里变出来。不保证每次都有。", meter: frame.meter },
    "again:idle": { lit: ["clock"], line: "还没把「每天生成简报」送进调度。" },
    "again:plan": { lit: ["clock"], rails: ["cron"], tokens: [tok("plan", "每天", "memory", "clock")], line: "计划本身还不是一次运行。" },
    "again:due": { lit: ["clock", "fresh"], rails: ["cron"], tokens: [tok("due", "到点", "command", "fresh")], line: "到点才触发。主机和网关得在运行。", freshNote: "等待触发" },
    "again:offline": { lit: ["clock"], rails: ["cron"], line: "主机或网关停了，就不会有成功结果。", cutCron: true, freshNote: "没有跑" },
    "again:fresh": { lit: ["fresh", "agent"], rails: ["cron"], tokens: [tok("new", "新会话", "user", "fresh")], line: "默认为这次任务新开一个会话，不接上全部旧聊天。", freshNote: "空的新会话" },
    "again:skill": { lit: ["skills", "fresh"], line: study.keepSkill ? "索引里有比较步骤，正文仍要按需读。" : "这次没有技能，不会临时发明一个。" },
    "again:fail": { lit: ["model"], rails: ["ask-model"], tokens: [tok("down", "失败", "error", "model", 0, modeShift(study))], line: "这次模型请求失败。" },
    "again:fallback": { lit: ["model"], tokens: [tok("down", "停止", "error", "model", 0, modeShift(study))], line: "只有配置了备用提供者才会再试，这里停住。" },
    "again:run": { lit: ["agent", "tools", "exec", "model"], rails: ["ask-model", "to-tools"], tokens: [tok("call", "tool_call", "call", "tools")], line: "定时没有取消工具循环。无人值守时危险命令默认拒绝。", execDetail: true },
    "again:done": { lit: ["window", "agent"], tokens: [tok("brief", "简报", "brief", "window")], line: "简报已经生成，还没有投递。", windowLines: brief },
    "again:undelivered": { lit: ["window", "gateway"], rails: ["deliver"], tokens: [tok("brief", "简报", "brief", "window"), tok("miss", "投递失败", "error", "gateway")], line: "任务完成和投递失败是两件事。" },
    "again:delivered": { lit: ["gateway"], rails: ["deliver"], tokens: [tok("brief", "简报", "brief", "gateway")], line: "投递是另一步，这时才送到入口。" },
  };
  const script = scripts[id] ?? {};
  const next = {
    ...base,
    ...script,
    lit: new Set(script.lit ?? base.lit),
    rails: new Set(script.rails ?? []),
  };
  if (study.scene === "map") next.lit = new Set(Object.keys(regionsOf()));
  if (study.scene === "boundary") next.execDetail = true;
  if (study.scene === "keep" || study.scene === "compress") {
    next.diskText = script.diskText ?? seen.planes.disk;
    next.snapText = script.snapText ?? seen.planes.snapshot;
  }
  if (study.scene === "compress" && frame.id === "continue") {
    next.snapText = seen.planes.disk;
    next.lit.add("memory");
  }
  if (study.showFileRoot && study.scene === "boundary") next.fileFence = true;
  if (!study.scheduled && study.scene === "again") next.freshNote = "尚未计划";
  return next;
}

function regionsOf() {
  return WIDE.regions;
}

function modeShift() {
  return 0;
}

function tok(id, text, kind, regionId, ox = 0, oy = 0) {
  return { id, text, kind, regionId, ox, oy };
}

function avoidToken(token, labels, region) {
  const box = {
    x: token.x - token.w / 2,
    y: token.y - token.h / 2,
    w: token.w,
    h: token.h,
  };
  const hits = labels.some((item) => item.part === token.regionId && overlaps(box, textBox(item)));
  if (!hits) return token;
  const shifted = { ...token, y: region.y + 18 + token.h / 2 + 28 };
  const again = {
    x: shifted.x - shifted.w / 2,
    y: shifted.y - shifted.h / 2,
    w: shifted.w,
    h: shifted.h,
  };
  if (!labels.some((item) => overlaps(again, textBox(item)))) return shifted;
  return { ...token, y: region.y + region.h + token.h / 2 + 4 };
}

export function picture(study, mode = "wide") {
  const layout = layoutFor(mode);
  const regions = layout.regions;
  const seen = view(study);
  const spec = story(study, seen);
  const profile = execProfile(study.backend);
  profile.detail = spec.execDetail;
  const gates = placeGates(regions.exec, profile, mode);
  if (study.decision === "once") {
    for (const gate of gates) if (gate.id === "manual") gate.title = "已批准";
  } else if (study.decision === "deny") {
    for (const gate of gates) if (gate.id === "manual") gate.title = "已拒绝";
  }
  const plates = memoryPlates(regions.memory);
  const font = mode === "narrow" ? 11 : 12;
  const labels = buildLabels(regions, { ...spec, exec: profile }, mode, plates, gates);
  const tokens = spec.tokens.map((item) => {
    const size = tokenSize(item.text, font);
    const point = dockPoint(regions, item.regionId, item.ox, item.oy);
    const placed = {
      ...item,
      ...size,
      x: point.x,
      y: point.y,
      mark: MARK[item.kind] ?? "·",
    };
    return avoidToken(placed, labels, regions[item.regionId]);
  });
  const railPoints = railsFor(regions, mode);
  const directions = DIRECTIONS[mode];
  const rails = Object.entries(railPoints).map(([id, points]) => ({
    id,
    points,
    kind: RAIL_KIND[id],
    live: spec.rails.has(id),
    cut: id === "cron" && spec.cutCron,
    dir: endDirection(points),
    net: netVector(points),
  }));
  const meter = spec.meter
    ? { input: spec.meter.input, archive: spec.meter.archive, old: spec.meter.old, summary: spec.meter.summary, recent: spec.meter.recent }
    : null;
  return {
    mode,
    viewBox: layout.viewBox.join(" "),
    width: layout.viewBox[2],
    height: layout.viewBox[3],
    regions,
    plates,
    gates,
    rails,
    directions,
    labels,
    tokens,
    lit: spec.lit,
    line: spec.line,
    frameTitle: seen.frame.title,
    frameId: seen.frame.id,
    meter,
    exec: {
      variant: profile.variant,
      skip: profile.skip,
      floorOnPath: profile.floorOnPath,
      manual: profile.manual,
      short: profile.short,
    },
    diskText: spec.diskText,
    snapText: spec.snapText,
    shownMemory: study.plane === "disk" ? spec.diskText : spec.snapText,
    skillBody: spec.skillBody,
    fileFence: spec.fileFence,
    freshNote: spec.freshNote,
    wiring: study.scene === "map",
    plane: study.plane,
    step: seen.index + 1,
    total: seen.total,
  };
}

function textBox(item) {
  const width = textWidth(item.text, item.font);
  const height = item.font + 2;
  const x = item.anchor === "middle" ? item.x - width / 2 : item.anchor === "end" ? item.x - width : item.x;
  const y = item.y - item.font + 1;
  return { x, y, w: width, h: height, text: item.text };
}

function overlaps(a, b) {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 1 && y > 1;
}

function rectOf(part) {
  return { x: part.x, y: part.y, w: part.w, h: part.h, text: part.id ?? "" };
}

export function geometryIssues(pic) {
  const problems = [];
  const boxes = [];
  for (const item of pic.labels) {
    const box = textBox(item);
    boxes.push(box);
    if (box.x < -0.5 || box.y < -0.5 || box.x + box.w > pic.width + 0.5 || box.y + box.h > pic.height + 0.5) {
      problems.push(`out:${item.text}`);
    }
    const host = pic.regions[item.part];
    if (host && item.part !== "housing") {
      const pad = 2;
      if (box.x < host.x - pad || box.x + box.w > host.x + host.w + pad || box.y < host.y - pad || box.y + box.h > host.y + host.h + pad) {
        problems.push(`host:${item.text}`);
      }
    }
  }
  for (const token of pic.tokens) {
    const box = { x: token.x - token.w / 2, y: token.y - token.h / 2, w: token.w, h: token.h, text: `token:${token.text}` };
    boxes.push(box);
    if (box.x < -0.5 || box.y < -0.5 || box.x + box.w > pic.width + 0.5 || box.y + box.h > pic.height + 0.5) {
      problems.push(`token-out:${token.text}`);
    }
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i], boxes[j])) problems.push(`overlap:${boxes[i].text}/${boxes[j].text}`);
    }
  }
  const roots = ["cli", "gateway", "clock", "model", "housing"];
  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      const a = { ...pic.regions[roots[i]], text: roots[i] };
      const b = { ...pic.regions[roots[j]], text: roots[j] };
      if (overlaps(rectOf(a), rectOf(b))) problems.push(`region:${roots[i]}/${roots[j]}`);
    }
  }
  const children = Object.keys(PARENT);
  for (let i = 0; i < children.length; i += 1) {
    const id = children[i];
    const rect = pic.regions[id];
    const parent = pic.regions[PARENT[id]];
    if (rect.x < parent.x || rect.y < parent.y || rect.x + rect.w > parent.x + parent.w || rect.y + rect.h > parent.y + parent.h) {
      problems.push(`inside:${id}`);
    }
    for (let j = i + 1; j < children.length; j += 1) {
      const other = children[j];
      if (overlaps({ ...rect, text: id }, { ...pic.regions[other], text: other })) problems.push(`region:${id}/${other}`);
    }
  }
  for (const rail of pic.rails) {
    const expect = pic.directions[rail.id];
    if (!expect) problems.push(`nodir:${rail.id}`);
    else {
      if (expect.dx && Math.sign(rail.net.dx) !== expect.dx) problems.push(`net:${rail.id}`);
      if (expect.dy && Math.sign(rail.net.dy) !== expect.dy) problems.push(`net:${rail.id}`);
    }
    if (Math.hypot(rail.net.dx, rail.net.dy) < 16) problems.push(`short:${rail.id}`);
    const head = rail.points[rail.points.length - 1];
    const prev = rail.points[rail.points.length - 2];
    if (Math.hypot(head.x - prev.x, head.y - prev.y) < 8) problems.push(`head:${rail.id}`);
  }
  for (const gate of pic.gates) {
    const exec = pic.regions.exec;
    if (gate.x < exec.x || gate.y < exec.y || gate.x + gate.w > exec.x + exec.w + 0.5 || gate.y + gate.h > exec.y + exec.h + 0.5) {
      problems.push(`gate:${gate.title}`);
    }
    if (gate.h < 16 || gate.w < 36) problems.push(`gate-size:${gate.title}`);
  }
  return problems;
}
