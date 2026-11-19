/**
 * 模拟状态机。数字、分支和批准都是预设，不连接 Hermes，不执行命令。
 * 机制以 Nous Research hermes-agent v0.23.2 的提交 ae2a81cc 为准。
 */

export const VERSION = Object.freeze({
  tag: "v0.23.2",
  tagObject: "28f57ed8e3dba4eceb67dfd3e3abda1a7604452d",
  commit: "ae2a81ccc00e9b7c06301523e5bb09608397149c",
  consulted: "2026-11-19",
});

export const SAMPLE = Object.freeze({
  yesterday: Object.freeze({ orders: 100, revenue: 10000 }),
  today: Object.freeze({ orders: 120, revenue: 11400 }),
});

export const SCENES = Object.freeze([
  Object.freeze({ id: "purpose", kicker: "01", title: "一句任务", takeaway: "模型提出工具请求，Hermes 负责执行并把结果送回来。" }),
  Object.freeze({ id: "map", kicker: "02", title: "整机", takeaway: "同一代理核心服务多个入口；模型、执行环境与持久状态分开。" }),
  Object.freeze({ id: "loop", kicker: "03", title: "一轮往返", takeaway: "每次结果都成为下一次模型调用的输入。" }),
  Object.freeze({ id: "boundary", kicker: "04", title: "三套边界", takeaway: "授权谁、批准什么、代码在哪跑，是三套边界。" }),
  Object.freeze({ id: "keep", kicker: "05", title: "留下什么", takeaway: "留下的是事实和方法，下一次再作为输入使用。" }),
  Object.freeze({ id: "compress", kicker: "06", title: "这一轮看见什么", takeaway: "磁盘可以保存很多历史，模型这一轮只看到选中的部分。" }),
  Object.freeze({ id: "again", kicker: "07", title: "再次发生", takeaway: "定时任务换了触发方式，仍要经过模型、工具和投递边界。" }),
]);

export const NODES = Object.freeze({
  cli: Object.freeze({ title: "CLI", duty: "本机交互入口，把这句话交给同一个 AIAgent。", file: "hermes_cli/" }),
  gateway: Object.freeze({ title: "Gateway", duty: "常驻进程。先确认发消息的人，再按会话键找回历史。", file: "gateway/run_inbound.py" }),
  agent: Object.freeze({ title: "AIAgent", duty: "驱动循环、预算和停止。它不自己充当模型。", file: "run_agent.py → agent/conversation_loop.py" }),
  provider: Object.freeze({ title: "Provider", duty: "选定模型和 API 格式，把内部消息发出去。", file: "agent/agent_init.py" }),
  model: Object.freeze({ title: "模型服务", duty: "进程之外的服务。只返回文本或工具请求。", file: "不在本地 Python 进程里" }),
  tools: Object.freeze({ title: "工具分发", duty: "运行时解析名字和参数，再调用处理器。异常包成错误结果。", file: "model_tools.py · agent/tool_executor.py" }),
  local: Object.freeze({ title: "本机", duty: "终端在主机权限内执行，没有容器隔离。", file: "tools/terminal_tool.py" }),
  docker: Object.freeze({ title: "Docker", duty: "没挂主机路径时，终端的危险命令检查会提前返回。挂了主机路径就不跳过。", file: "tools/approval.py" }),
  modal: Object.freeze({ title: "Modal 一类", duty: "modal、daytona、vercel_sandbox 总是跳过这层命令检查，不看有没有主机路径。", file: "tools/approval.py" }),
  file: Object.freeze({ title: "文件工具", duty: "不经过终端框。写入范围只约束 write_file 和 patch。", file: "agent/file_safety.py" }),
  session: Object.freeze({ title: "会话库", duty: "SQLite 保存消息、工具调用和工具结果，并可全文检索。", file: "~/.hermes/state.db" }),
  memory: Object.freeze({ title: "短记忆", duty: "少量事实。提示里用的是加载时的快照。", file: "MEMORY.md / USER.md" }),
  skill: Object.freeze({ title: "技能", duty: "可复用的做法。先看到索引，再按需把正文读成文本。", file: "~/.hermes/skills/" }),
});

const SCENE_IDS = SCENES.map((scene) => scene.id);

/** 终端命令的 check_all_command_guards。不是 execute_code。 */
export function commandGuard(backend) {
  if (backend === "docker") {
    return { skip: true, floor: false, userDeny: true, manual: false, reason: "docker-isolated" };
  }
  if (backend === "modal") {
    return { skip: true, floor: false, userDeny: true, manual: false, reason: "modal-class" };
  }
  if (backend === "docker-mount") {
    return { skip: false, floor: true, userDeny: true, manual: true, reason: "docker-host-mount" };
  }
  return { skip: false, floor: true, userDeny: true, manual: true, reason: "local" };
}

export function compareCsv(sample = SAMPLE) {
  const yesterday = sample.yesterday;
  const today = sample.today;
  const aovYesterday = yesterday.revenue / yesterday.orders;
  const aovToday = today.revenue / today.orders;
  return {
    ordersPct: Math.round(((today.orders - yesterday.orders) / yesterday.orders) * 100),
    revenuePct: Math.round(((today.revenue - yesterday.revenue) / yesterday.revenue) * 100),
    aovYesterday,
    aovToday,
    aovPct: Math.round(((aovToday - aovYesterday) / aovYesterday) * 100),
  };
}

export function signedPct(value) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

export function briefingLines(sample = SAMPLE) {
  const compared = compareCsv(sample);
  return [
    `订单 ${signedPct(compared.ordersPct)}`,
    `收入 ${signedPct(compared.revenuePct)}`,
    `客单价 ${compared.aovYesterday} → ${compared.aovToday}（${signedPct(compared.aovPct)}）`,
  ];
}

function frame(partial) {
  return {
    actor: "运行时",
    hot: [],
    kind: "control",
    lines: [],
    executed: false,
    healed: false,
    sandboxed: false,
    weightsChanged: false,
    ran: false,
    delivered: false,
    ...partial,
  };
}

function purposeFrames() {
  const brief = briefingLines();
  return [
    frame({ id: "task", title: "提出任务", actor: "用户", hot: ["user"], edge: "to-agent", token: "用户消息", kind: "control", lines: ["比较昨日与今日 CSV", "生成简报"], askNote: "用户只发来一句话。", runNote: "运行时还没有执行任何工具。" }),
    frame({ id: "need", title: "需要文件", actor: "运行时", hot: ["agent"], edge: "to-model", token: "任务", kind: "control", lines: ["回答需要两份表", "上下文里还没有数字"], askNote: "只回文本的示意会让模型直接作答。", runNote: "Hermes 准备把这句话放进带工具的循环。" }),
    frame({ id: "request", title: "请求读取", actor: "模型", hot: ["model"], edge: "to-tool", token: "tool_call", kind: "data", lines: ["tool_call", "read_file · yesterday.csv"], askNote: "这一步是模型在请求工具。", runNote: "运行时尚未碰文件。模型不执行操作系统命令。" }),
    frame({ id: "data", title: "获得数据", actor: "运行时", hot: ["tool"], edge: "back-model", token: "订单 100", kind: "data", lines: ["yesterday.csv", "订单 100 · 收入 10000"], askNote: "模型只提出了读取。", runNote: "这一步是运行时实际读取，并把结果送回。", executed: true }),
    frame({ id: "compute", title: "再次请求", actor: "模型", hot: ["model"], edge: "back-model", token: "工具结果", kind: "data", lines: ["输入含上一则工具结果", "教学简化：今日文件走同一种往返"], askNote: "模型根据工具结果继续请求或作答。", runNote: "运行时把结果放进下一次模型调用，自己不算成模型。" }),
    frame({ id: "brief", title: "生成简报", actor: "模型", hot: ["brief"], edge: "to-brief", token: "简报", kind: "data", lines: brief, askNote: "最终文本由模型返回。", runNote: "运行时负责收下文本并准备保存。没有改模型权重。" }),
  ];
}

function mapFrames(study) {
  const guard = commandGuard(study.backend);
  const where = study.backend === "modal" ? "modal" : study.backend === "local" ? "local" : "docker";
  const executeLines = guard.reason === "docker-isolated"
    ? ["终端在隔离的 Docker 里", "没挂主机路径，危险命令检查提前返回"]
    : guard.reason === "docker-host-mount"
      ? ["终端在 Docker 里，但挂了主机路径", "不跳过，走普通检查"]
      : guard.reason === "modal-class"
        ? ["这一类后端总是跳过命令检查", "文件工具仍不进这个框"]
        : ["终端走本机", "没有容器隔离"];
  return [
    frame({ id: "arrive", title: "输入抵达", actor: "入口", hot: ["cli", "gateway"], edge: "to-core", token: "用户消息", kind: "control", lines: ["CLI 或 Gateway", "同一句 CSV 任务"], askNote: "入口不同，核心相同。", runNote: "平台差异留在入口，不画成另一个代理。" }),
    frame({ id: "prepare", title: "准备上下文", actor: "运行时", hot: ["agent"], edge: "to-core", token: "历史", kind: "control", lines: ["会话历史", "记忆快照", "技能索引"], askNote: "模型还没被调用。", runNote: "AIAgent 组装这一轮要送出的消息。" }),
    frame({ id: "request", title: "模型请求", actor: "运行时", hot: ["provider", "model"], edge: "to-model", token: "请求", kind: "data", lines: ["Provider 选择 API 格式", "请求发往外部模型"], askNote: "模型服务在进程之外。", runNote: "本地代码发出请求，不把模型画进 Hermes 进程。" }),
    frame({ id: "dispatch", title: "工具分发", actor: "运行时", hot: ["tools"], edge: "to-exec", token: "tool_call", kind: "control", lines: ["解析工具名和参数", "再找处理器"], askNote: "模型给出的是请求。", runNote: "分发由运行时完成。异常会包成错误结果。" }),
    frame({ id: "execute", title: "后端执行", actor: "运行时", hot: [where, "file"], edge: "to-exec", token: "执行", kind: "warn", lines: executeLines, askNote: "不是每个工具都走终端。", runNote: executeLines[1] ?? executeLines[0], executed: true, sandboxed: false }),
    frame({ id: "save", title: "保存与回答", actor: "运行时", hot: ["session", "memory", "skill"], edge: "to-store", token: "记录", kind: "persist", lines: ["会话写入库", "记忆和技能另算"], askNote: "回答文本已经由模型返回。", runNote: "保存的是记录，不是模型权重。" }),
  ];
}

function loopFrames(study) {
  const head = [
    frame({ id: "lookup", title: "查会话", actor: "运行时", hot: ["db"], edge: "to-db", token: "会话键", kind: "persist", lines: ["按会话取出历史", "不是把整个库重发"], askNote: "先找已有会话。", runNote: "读取会话库是运行时的事。" }),
    frame({ id: "assemble", title: "组装输入", actor: "运行时", hot: ["agent"], edge: "to-model", token: "消息包", kind: "control", lines: ["系统提示复用已保存的字节", "技能先只放索引"], askNote: "模型即将看到的是这一包消息。", runNote: "运行时组包。记忆快照不会因为刚写磁盘就重绘。" }),
    frame({ id: "request", title: "请求模型", actor: "运行时", hot: ["model"], edge: "to-model", token: "请求", kind: "data", lines: ["role: 已组装的消息", "工具 schema 随请求给出"], askNote: "一次用户消息可以对应多次模型请求。", runNote: "请求由运行时发出。" }),
  ];
  if (study.loopBranch === "error") {
    return [
      ...head,
      frame({ id: "call", title: "收到 tool_call", actor: "模型", hot: ["model"], edge: "to-tool", token: "tool_call", kind: "data", lines: ["read_file", "yesterday.csv"], askNote: "模型请求读取。", runNote: "运行时还没读成。" }),
      frame({ id: "fail", title: "执行失败", actor: "运行时", hot: ["tool"], edge: "to-tool", token: "error", kind: "warn", lines: ["error", "文件不可读（预设）"], askNote: "失败不是模型的内心活动。", runNote: "处理器异常被包成错误结果。", executed: true, healed: false }),
      frame({ id: "back", title: "错误回到模型", actor: "运行时", hot: ["model"], edge: "back-model", token: "错误结果", kind: "data", lines: ["role: tool", "关联原来的 tool_call id"], askNote: "模型只是又收到一则消息。", runNote: "运行时把错误送回，不保证它能修好。" }),
      frame({ id: "stop", title: "停止", actor: "运行时", hot: ["agent"], kind: "warn", lines: ["预设：停止", "不是必然自愈"], askNote: "模型可以再试，也可以停。", runNote: "这条演示选择停止。", healed: false }),
    ];
  }
  if (study.loopBranch === "parallel") {
    return [
      ...head,
      frame({ id: "batch", title: "两个只读请求", actor: "模型", hot: ["model"], kind: "data", lines: ["read_file · yesterday.csv", "read_file · today.csv"], askNote: "模型一次发出两个读取请求。", runNote: "尚未执行。不演示两个写入。" }),
      frame({ id: "parallel", title: "并发读取", actor: "运行时", hot: ["tool"], kind: "data", lines: ["两个只读可以同时跑", "写入不据此当成互不冲突"], askNote: "并发是运行时的调度。", runNote: "交互类工具会限制并发。", executed: true }),
      frame({ id: "ordered", title: "按调用顺序收集", actor: "运行时", hot: ["tool", "db"], kind: "data", lines: ["先昨日，后今日", "结果按原顺序放回"], askNote: "模型稍后按这个顺序看见结果。", runNote: "收集顺序由运行时排列。" }),
      frame({ id: "again", title: "再次请求", actor: "运行时", hot: ["model"], kind: "data", lines: ["两次结果都在历史里"], askNote: "下一次模型调用看见它们。", runNote: "运行时再次发出请求。" }),
      frame({ id: "answer", title: "最终回答", actor: "模型", hot: ["model"], kind: "data", lines: briefingLines(), askNote: "模型返回简报文本。", runNote: "没有改模型权重。", healed: false }),
      frame({ id: "save", title: "保存", actor: "运行时", hot: ["db"], kind: "persist", lines: ["工具调用和结果写入会话"], askNote: "保存发生在运行时。", runNote: "会话库记下这一轮。" }),
    ];
  }
  return [
    ...head,
    frame({ id: "call", title: "收到 tool_call", actor: "模型", hot: ["model"], edge: "to-tool", token: "tool_call", kind: "data", lines: ["read_file", "yesterday.csv"], askNote: "模型决定请求这个工具。", runNote: "运行时只是收到请求。" }),
    frame({ id: "run", title: "执行读取", actor: "运行时", hot: ["tool"], edge: "to-tool", token: "订单 100", kind: "data", lines: ["订单 100", "收入 10000"], askNote: "模型没有碰文件。", runNote: "运行时执行读取。", executed: true }),
    frame({ id: "append", title: "追加结果", actor: "运行时", hot: ["db"], edge: "to-db", token: "tool 结果", kind: "persist", lines: ["role: tool", "对上 tool_call id"], askNote: "结果成为历史的一则。", runNote: "工具请求在执行前已经写入会话。这一步再追加结果。" }),
    frame({ id: "again", title: "再次请求", actor: "运行时", hot: ["model"], edge: "back-model", token: "工具结果", kind: "data", lines: ["历史里已经有工具结果", "今日文件用同一种往返"], askNote: "这是另一次模型调用。", runNote: "教学简化：第二次读取不再展开。" }),
    frame({ id: "answer", title: "最终回答", actor: "模型", hot: ["model"], kind: "data", lines: briefingLines(), askNote: "模型返回文本，不是工具请求。", runNote: "运行时准备结束这一轮。" }),
    frame({ id: "save", title: "保存", actor: "运行时", hot: ["db"], kind: "persist", lines: ["简报写入会话库"], askNote: "用户终于看到简报。", runNote: "会话在工具执行前后都会落盘。这里只标出这一轮结束时的保存。" }),
  ];
}

function boundaryFrames(study) {
  const guard = commandGuard(study.backend);
  const who = frame({ id: "who", title: "谁能发来", actor: "运行时", hot: ["who"], edge: "to-where", token: "会话", kind: "control", lines: ["模拟：个人会话已在允许范围", "群聊和操作员例外不在这幕展开"], askNote: "身份授权是第一套边界。", runNote: "没通过授权的消息不会进入循环。" });
  const request = frame({ id: "request", title: "命令请求", actor: "模型", hot: ["what"], edge: "to-what", token: "命令请求", kind: "warn", lines: ["模拟操作：清理旧输出目录", "页面不展示可复制命令"], askNote: "模型可以请求一个命令。", runNote: "还没有执行。", sandboxed: false });
  if (guard.reason === "docker-isolated") {
    return [
      who,
      request,
      frame({ id: "skip", title: "隔离才跳过", actor: "运行时", hot: ["where"], edge: "to-where", token: "无主机挂载", kind: "warn", lines: ["Docker 且没有主机路径挂载", "危险命令检查提前返回", "这一支仍看用户拒绝规则", "硬性底线不在这条提前返回里"], askNote: "不要把人工批准画成这里的步骤。", runNote: "跳过只在 has_host_access 为假时发生。", sandboxed: false, executed: false }),
      frame({ id: "scope", title: "范围就到这里", actor: "运行时", hot: ["where"], edge: "to-where", token: "仅终端检查", kind: "warn", lines: ["说的是 terminal 的命令检查", "execute_code 的隔离返回不看拒绝规则", "传入容器的环境变量仍可能被读到"], askNote: "挂载主机路径是另一支，不会跳过。", runNote: "这幕不播放本机的人工批准。", sandboxed: false }),
    ];
  }
  if (guard.reason === "modal-class") {
    return [
      who,
      request,
      frame({ id: "skip", title: "这一类总是跳过", actor: "运行时", hot: ["where"], edge: "to-where", token: "modal", kind: "warn", lines: ["modal、daytona、vercel_sandbox", "就算标了主机访问也不把检查加回来", "终端路径仍看用户拒绝规则", "硬性底线不在提前返回里"], askNote: "这和 Docker 是否挂载不是同一条规则。", runNote: "提前返回里没有硬性底线。", sandboxed: false, executed: false }),
    ];
  }
  const mounted = guard.reason === "docker-host-mount";
  const decision = study.decision;
  const result = decision === "once"
    ? frame({ id: "result", title: "批准一次", actor: "用户", hot: ["what", "where"], edge: "to-what", token: "批准一次", kind: "warn", lines: mounted ? ["挂了主机路径，所以走到普通检查", "演示仍是手动批准一次", "停止不会收回已经写出的内容"] : ["在主机执行这一次", "没有容器隔离", "停止不会收回已经写出的内容"], askNote: "批准的是这一次命令。", runNote: mounted ? "执行点在挂了主机路径的容器里。" : "执行点在主机上。", executed: true, sandboxed: false })
    : decision === "deny"
      ? frame({ id: "result", title: "已经拒绝", actor: "用户", hot: ["what"], edge: "to-what", token: "拒绝", kind: "stop", lines: ["命令没有执行"], askNote: "拒绝停在批准之前。", runNote: "运行时不执行。", executed: false, sandboxed: false })
      : frame({ id: "result", title: "仍在等待", actor: "用户", hot: ["what"], edge: "to-what", token: "等待", kind: "warn", lines: ["还没有批准", "也还没有执行"], askNote: "等待是这条演示的默认。", runNote: "这是显式的 manual，不是全局默认。", executed: false, sandboxed: false });
  return [
    who,
    request,
    frame({ id: "match", title: "先走底线", actor: "运行时", hot: ["what"], edge: "to-what", token: "普通检查", kind: "warn", lines: mounted ? ["主机路径挂载，不走容器快路径", "这一支才先跑硬性底线"] : ["本机没有容器快路径", "这一支才先跑硬性底线"], askNote: "底线只在没提前返回的那一支前面。", runNote: "YOLO 在这一支绕不过底线。隔离容器的提前返回到不了这里。", sandboxed: false }),
    frame({ id: "wait", title: "等待批准", actor: "用户", hot: ["what"], edge: "to-what", token: "等待人", kind: "warn", lines: ["显式配置：manual", "不是所有工具的全局默认"], askNote: "请在模拟卡上选择。", runNote: "智能模式可以由辅助模型自动放过低风险命令。这幕不演那种模式。", sandboxed: false }),
    result,
  ];
}

function keepFrames(study) {
  const memory = study.keepMemory ? "偏好先看百分比" : "（空）";
  const skillName = study.keepSkill ? "比较两份 CSV" : "（没有这次的技能）";
  return [
    frame({ id: "done", title: "任务完成", actor: "运行时", hot: ["context", "history"], kind: "data", lines: ["本轮上下文里有简报", ...briefingLines()], phase: "done", askNote: "四样东西还叠在一起。", runNote: "模型图标不变。" }),
    frame({ id: "choose", title: "选择保留", actor: "用户", hot: ["memory", "skill"], kind: "control", lines: ["短记忆和技能都要明确选择", "不会因为成功就自动写入"], phase: "choose", askNote: "不点，就只留在这次会话里。", runNote: "运行时不会偷偷训练模型。" }),
    frame({ id: "disk", title: "写入磁盘", actor: "运行时", hot: ["memory", "skill"], kind: "persist", lines: [`磁盘上的短记忆：${memory}`, `技能文件：${skillName}`], phase: "disk", askNote: "只有选中的项会写。", runNote: "写入立刻到文件。提示快照先不动。", executed: study.keepMemory || study.keepSkill }),
    frame({ id: "frozen", title: "快照仍旧", actor: "运行时", hot: ["context"], kind: "control", lines: ["当前系统提示不因这次写入重绘", "工具结果里可以看到新内容"], phase: "frozen", askNote: "模型这一轮仍看见旧快照。", runNote: "这是为了提示缓存，不是丢弃磁盘。" }),
    frame({ id: "next", title: "新会话", actor: "用户", hot: ["history"], kind: "control", lines: ["另开一轮", "上一份会话还在库里"], phase: "next", askNote: "新会话不会自动带上全部旧消息。", runNote: "运行时重新加载记忆文件。" }),
    frame({ id: "load", title: "加载快照", actor: "运行时", hot: ["memory"], kind: "persist", lines: [`新的提示快照：${memory}`], phase: "load", askNote: "快照在新会话开始时更新。", runNote: "没保存的偏好不会出现。" }),
    frame({ id: "index", title: "看见索引", actor: "运行时", hot: ["skill"], kind: "data", lines: [`技能索引：${skillName}`, "索引不是正文"], phase: "index", askNote: "模型先看见名字和简介。", runNote: "有没有索引项，取决于刚才有没有保存。" }),
    frame({ id: "read", title: "按需读技能", actor: "模型", hot: ["skill"], kind: "data", lines: study.keepSkill ? ["skill_view 读到步骤正文", "仍是文本，不是新工具，也不是权重"] : ["没有正文可读", "模型权重没有变化"], phase: "read", askNote: "读取技能只是又一次工具结果。", runNote: "不保证下次因此成功。", executed: study.keepSkill }),
  ];
}

export function memoryPlanes(study, phase) {
  const disk = study.keepMemory ? "偏好先看百分比" : "（空）";
  const snapshot = phase === "next" || phase === "load" || phase === "index" || phase === "read" ? disk : "（空）";
  return { disk, snapshot, weightsChanged: false };
}

function occupy(input, archive, old, summary, recent) {
  return { input, archive, old, summary, recent };
}

function compressFrames(study) {
  const missed = study.compressBranch === "miss";
  const base = [
    frame({ id: "pile", title: "输出累积", actor: "运行时", hot: ["input", "archive"], token: "工具输出", meter: occupy(92, 100, 78, 0, 14), kind: "data", lines: ["模拟：本轮输入 92", "模拟：会话库 100"], askNote: "上下文和磁盘不是同一叠纸。", runNote: "原文先在库里。" }),
    frame({ id: "threshold", title: "接近阈值", actor: "运行时", hot: ["input"], token: "再长一截", meter: occupy(96, 100, 82, 0, 14), kind: "control", lines: ["模拟：输入升到 96", "库仍是 100"], askNote: "不是所有模型到同一个比例就压缩。", runNote: "小于一定窗口时，代码还会把比例抬高。" }),
    frame({ id: "prune", title: "旧输出精简", actor: "运行时", hot: ["input"], token: "缩短", meter: occupy(64, 100, 18, 0, 46), kind: "warn", lines: ["模拟：输入降到 64", "库仍是 100，原文还在"], askNote: "精简的是这一轮要送出的内容。", runNote: "不把原文画成销毁。" }),
    frame({ id: "summary", title: "生成摘要", actor: "模型", hot: ["input"], token: missed ? "摘要缺客单价" : "摘要", meter: missed ? occupy(44, 100, 0, 20, 24) : occupy(46, 100, 0, 24, 22), kind: "data", lines: missed ? ["模拟：摘要 20，近期 24", "客单价没有写进摘要"] : ["模拟：摘要 24，近期 22", "库仍是 100"], askNote: "摘要由另一次模型调用生成，可能漏细节。", runNote: "运行时用摘要替换要送出的旧段。" }),
  ];
  if (study.compressBranch === "miss") {
    return [
      ...base,
      frame({ id: "gap", title: "摘要有缺口", actor: "模型", hot: ["input"], token: "缺客单价", meter: occupy(44, 100, 0, 20, 24), kind: "warn", lines: ["模拟：输入 44，库 100", "摘要里没有客单价"], askNote: "压缩是有损的。", runNote: "不保证每次都能从摘要恢复。", healed: false }),
      frame({ id: "search", title: "尝试取回", actor: "运行时", hot: ["archive"], edge: "to-archive", token: "检索", meter: occupy(44, 100, 0, 20, 24), kind: "persist", lines: ["从库里找，不从摘要里变出来", "预设：能找到，但不是每次都有"], askNote: "检索是另一次明确的工具请求。", runNote: "全文检索不是向量数据库。", healed: false }),
    ];
  }
  return [
    ...base,
    frame({ id: "tail", title: "留下近期", actor: "运行时", hot: ["input"], token: "近期", meter: occupy(40, 100, 0, 18, 22), kind: "control", lines: ["模拟：输入 40，库 100", "近期仍是原文"], askNote: "模型下一跳看不到全部历史。", runNote: "保留多少由配置决定，主图不写死条数。" }),
    frame({ id: "continue", title: "继续请求", actor: "运行时", hot: ["model"], edge: "to-model", token: "摘要+近期", meter: occupy(40, 100, 0, 18, 22), kind: "data", lines: ["送出的是摘要加近期消息", "会话 id 默认不变"], askNote: "继续的是同一次任务。", runNote: "默认原地压缩，不新开一个子会话。细节在折叠说明里。" }),
  ];
}

function againFrames(study) {
  if (!study.scheduled) {
    return [frame({ id: "idle", title: "尚未计划", actor: "用户", hot: ["plan"], kind: "control", lines: ["要点「每天生成简报」才会送进调度", "不会偷偷创建任务"], askNote: "这是模拟按钮。", runNote: "没有真实 cron。" })];
  }
  const plan = frame({ id: "plan", title: "保存计划", actor: "用户", hot: ["plan"], kind: "persist", lines: ["模拟：每天生成简报", "附带已保存的技能（如果刚才保存了）"], askNote: "计划本身不是一次运行。", runNote: "调度器记下下次时间。" });
  const due = frame({ id: "due", title: "到期", actor: "运行时", hot: ["plan"], kind: "control", lines: ["到点才触发", "主机和网关得在运行"], askNote: "到期不是云端托管的承诺。", runNote: "关机就不会出现成功结果。" });
  if (study.host === "offline") {
    return [plan, due, frame({ id: "offline", title: "主机离线", actor: "运行时", hot: ["plan"], kind: "stop", lines: ["没有成功运行", "也没有简报可投递"], askNote: "后台不等于人走了还能跑。", runNote: "网关进程和模型服务都要在。", ran: false, delivered: false })];
  }
  const fresh = frame({ id: "fresh", title: "新任务会话", actor: "运行时", hot: ["agent"], kind: "control", lines: ["默认不带上全部聊天历史", "会话 id 类似 cron_任务_时间"], askNote: "这是一次新的任务，不是把旧聊天接过来。", runNote: "运行时新建 AIAgent。" });
  const skill = frame({
    id: "skill",
    title: "加载技能",
    actor: "运行时",
    hot: ["skill"],
    kind: "data",
    lines: study.keepSkill ? ["索引里有「比较两份 CSV」", "正文仍要按需读取"] : ["这次没有保存技能", "不会临时发明一个"],
    askNote: "技能只是文本。",
    runNote: "没有技能文件，就没有那条方法。",
  });
  if (study.model === "down") {
    return [
      plan, due, fresh, skill,
      frame({ id: "fail", title: "模型不可用", actor: "运行时", hot: ["model"], kind: "warn", lines: ["这次请求失败"], askNote: "失败可见，不编造推理。", runNote: "运行时收到错误。", ran: false, delivered: false, healed: false }),
      frame({ id: "fallback", title: "备用提供者", actor: "运行时", hot: ["model"], kind: "stop", lines: ["只有配置了 fallback 才会再试", "演示停在这里，不保证换成功"], askNote: "备用链不是默认的无限重试。", runNote: "没配备用，就停止。", ran: false, delivered: false, healed: false }),
    ];
  }
  const run = frame({ id: "run", title: "执行循环", actor: "运行时", hot: ["tool", "model"], edge: "to-tool", token: "工具请求", kind: "data", lines: ["仍是模型请求、运行时执行", "无人值守时危险命令默认拒绝"], askNote: "定时没有取消工具循环。", runNote: "没挂主机路径的 Docker 才会跳过危险命令检查。挂了就回到普通检查。", executed: true, sandboxed: false });
  const done = frame({ id: "done", title: "任务完成", actor: "模型", hot: ["agent"], kind: "data", lines: briefingLines(), askNote: "简报已经生成。", runNote: "生成不等于已经送到聊天里。", ran: true, delivered: false });
  if (study.delivery === "fail") {
    return [plan, due, fresh, skill, run, done, frame({ id: "undelivered", title: "投递失败", actor: "运行时", hot: ["deliver"], kind: "stop", lines: ["任务已完成", "投递失败"], askNote: "两件事分开。", runNote: "不合成一个成功勾。", ran: true, delivered: false })];
  }
  return [plan, due, fresh, skill, run, done, frame({ id: "delivered", title: "投递简报", actor: "运行时", hot: ["deliver"], kind: "persist", lines: ["送到指定的聊天", "投递是另一步"], askNote: "用户这时才在聊天里看见。", runNote: "网关负责送出。", ran: true, delivered: true })];
}

export function frames(study) {
  switch (study.scene) {
    case "purpose":
      return purposeFrames();
    case "map":
      return mapFrames(study);
    case "loop":
      return loopFrames(study);
    case "boundary":
      return boundaryFrames(study);
    case "keep":
      return keepFrames(study);
    case "compress":
      return compressFrames(study);
    case "again":
      return againFrames(study);
    default:
      return purposeFrames();
  }
}

function blankIndex() {
  return Object.fromEntries(SCENE_IDS.map((id) => [id, 0]));
}

export function createStudy() {
  return {
    scene: "purpose",
    playing: false,
    speed: 1,
    index: blankIndex(),
    lens: "ask",
    focus: "agent",
    backend: "local",
    decision: "wait",
    showFileRoot: false,
    loopBranch: "read",
    keepMemory: false,
    keepSkill: false,
    plane: "snapshot",
    compressBranch: "kept",
    retrieved: false,
    scheduled: false,
    host: "online",
    delivery: "ok",
    model: "ready",
  };
}

function clone(study) {
  return { ...study, index: { ...study.index } };
}

const RESET_KEYS = ["backend", "loopBranch", "compressBranch", "scheduled", "host", "delivery", "model"];

export function patch(study, partial) {
  const next = clone(study);
  Object.assign(next, partial);
  next.playing = false;
  if (partial.speed !== undefined) next.speed = partial.speed === 2 ? 2 : 1;
  if (Object.prototype.hasOwnProperty.call(partial, "backend")) next.decision = "wait";
  const reset = RESET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(partial, key));
  if (reset) next.index[next.scene] = 0;
  if (Object.prototype.hasOwnProperty.call(partial, "decision") && partial.decision !== "wait" && !Object.prototype.hasOwnProperty.call(partial, "backend")) {
    next.index.boundary = Math.max(0, frames({ ...next, scene: "boundary" }).length - 1);
  }
  const list = frames(next);
  if (next.index[next.scene] > list.length - 1) next.index[next.scene] = 0;
  return next;
}

export function selectScene(study, id) {
  if (!SCENE_IDS.includes(id)) return study;
  const next = clone(study);
  next.scene = id;
  next.playing = false;
  next.index[id] = 0;
  return next;
}

export function currentIndex(study) {
  const list = frames(study);
  return Math.max(0, Math.min(list.length - 1, study.index[study.scene] ?? 0));
}

export function view(study) {
  const list = frames(study);
  const index = currentIndex(study);
  const item = list[index];
  const phase = item.phase ?? "done";
  const planes = memoryPlanes(study, phase);
  const shownMemory = study.plane === "disk" ? planes.disk : planes.snapshot;
  const note = study.lens === "run" ? item.runNote : item.askNote;
  const duty = NODES[study.focus] ?? NODES.agent;
  return {
    index,
    total: list.length,
    frame: item,
    note,
    planes,
    shownMemory,
    duty,
    fileRoot: study.showFileRoot,
    retrieved: study.retrieved,
    weightsChanged: false,
    sandboxed: false,
    simulated: true,
  };
}

export function step(study, delta) {
  const next = clone(study);
  const list = frames(study);
  const index = Math.max(0, Math.min(list.length - 1, currentIndex(study) + delta));
  next.index[study.scene] = index;
  next.playing = false;
  if (study.scene === "map") {
    const hot = list[index]?.hot?.find((id) => NODES[id]);
    if (hot) next.focus = hot;
  }
  return next;
}

export function replay(study) {
  const next = clone(study);
  next.index[study.scene] = 0;
  next.playing = false;
  return next;
}

export function togglePlay(study, options = {}) {
  if (options.reduced) return step(study, 1);
  if (study.playing) {
    const next = clone(study);
    next.playing = false;
    return next;
  }
  const next = clone(study);
  const seen = view(study);
  if (seen.index >= seen.total - 1) next.index[study.scene] = 0;
  next.playing = true;
  return next;
}

export function tick(study) {
  if (!study.playing) return study;
  const seen = view(study);
  if (seen.index >= seen.total - 1) {
    const next = clone(study);
    next.playing = false;
    return next;
  }
  const next = clone(study);
  next.index[study.scene] = seen.index + 1;
  if (next.index[study.scene] >= seen.total - 1) next.playing = false;
  if (study.scene === "map") {
    const hot = frames(next)[next.index[study.scene]]?.hot?.find((id) => NODES[id]);
    if (hot) next.focus = hot;
  }
  return next;
}

export function intervalMs(study) {
  return study.speed === 2 ? 800 : 1600;
}
