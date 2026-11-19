import { compareText } from "./issue.ts";
import { CATALOG_HREF } from "./site.ts";
import type { TopicMeta } from "./types.ts";

export const PLATFORM_CSS = `*, *::before, *::after { box-sizing: border-box; }
:root {
  color-scheme: light;
  --bg: #f3eee4;
  --ink: #1d1a16;
  --muted: #4e4942;
  --line: #d5cbbd;
  --mark: #8f3418;
  --card: #fbf8f3;
  --font: "Iowan Old Style", Palatino, "Palatino Linotype", "Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", "WenQuanYi Micro Hei", "Droid Sans Fallback", serif;
  --ui: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Droid Sans Fallback", "Segoe UI", sans-serif;
}
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--ui);
  font-size: 1rem;
  line-height: 1.55;
  border-top: 6px solid var(--mark);
}
h1, h2, h3, p { overflow-wrap: anywhere; }
h1, h2, h3 { font-family: var(--font); font-weight: 600; line-height: 1.2; margin: 0; }
a { color: inherit; }
.skip {
  position: absolute;
  left: 12px;
  top: -48px;
  background: var(--ink);
  color: var(--bg);
  padding: 8px 12px;
}
.skip:focus { top: 12px; }
.wrap { max-width: 72rem; margin: 0 auto; padding: 28px 16px 64px; }
.kicker {
  margin: 0 0 8px;
  color: var(--mark);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1 { font-size: clamp(2.4rem, 8vw, 4.2rem); }
.lead { max-width: 38rem; font-size: 1.05rem; }
.flow, .cards { display: grid; gap: 12px; margin: 16px 0 0; padding: 0; list-style: none; }
.flow li, .card, .empty, .missing {
  background: var(--card);
  border: 1px solid var(--line);
}
.flow li { padding: 14px; display: grid; gap: 4px; }
.flow span { color: var(--mark); font-variant-numeric: tabular-nums; }
.flow em, .note, footer, .eyebrow { color: var(--muted); font-style: normal; }
section { margin-top: 32px; }
h2 { font-size: 1.4rem; }
.tools { display: grid; gap: 12px; margin-top: 16px; }
label { display: grid; gap: 6px; font-size: 0.85rem; }
input, select, button {
  font: inherit;
  color: inherit;
  background: var(--card);
  border: 1px solid var(--ink);
  border-radius: 0;
  min-height: 44px;
  padding: 0 12px;
  width: 100%;
}
button { background: var(--ink); color: var(--bg); }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}
.count { min-height: 1.5rem; }
.card {
  display: grid;
  gap: 8px;
  padding: 16px;
  text-decoration: none;
  min-height: 100%;
}
.card[hidden] { display: none; }
.card h3 { font-size: 1.35rem; }
.card ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.card li { border: 1px solid var(--line); padding: 2px 8px; font-size: 0.85rem; }
.empty, .missing { padding: 20px; }
.missing { max-width: 36rem; margin: 15vh auto; }
footer { border-top: 1px solid var(--line); margin-top: 36px; padding-top: 16px; }
@media (min-width: 720px) {
  .flow, .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .flow { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tools { grid-template-columns: minmax(0, 1fr) 220px auto; align-items: end; }
  button { width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
`;

const PAGE_SCRIPT = `
const form = document.querySelector(".tools");
const queryInput = document.getElementById("q");
const categoryInput = document.getElementById("category");
const count = document.getElementById("count");
const empty = document.getElementById("empty");
const nomatch = document.getElementById("nomatch");
const cards = [...document.querySelectorAll(".card")];
if (
  form instanceof HTMLFormElement &&
  queryInput instanceof HTMLInputElement &&
  categoryInput instanceof HTMLSelectElement &&
  count && empty && nomatch
) {
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get("q");
  const initialCategory = params.get("category");
  if (initialQuery) queryInput.value = initialQuery;
  if (initialCategory && [...categoryInput.options].some((option) => option.value === initialCategory)) {
    categoryInput.value = initialCategory;
  }
  const apply = () => {
    const query = queryInput.value.trim().toLowerCase();
    const selected = categoryInput.value;
    let visible = 0;
    for (const card of cards) {
      if (!(card instanceof HTMLElement)) continue;
      const haystack = (card.dataset.search || "").toLowerCase();
      const category = card.dataset.category || "";
      const matched = (selected === "" || category === selected) && (query === "" || haystack.includes(query));
      card.hidden = !matched;
      if (matched) visible += 1;
    }
    count.textContent = visible + " 个主题";
    empty.hidden = cards.length !== 0;
    nomatch.hidden = !(cards.length > 0 && visible === 0);
    const url = new URL(location.href);
    const trimmed = queryInput.value.trim();
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    if (selected) url.searchParams.set("category", selected);
    else url.searchParams.delete("category");
    history.replaceState(null, "", url);
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  queryInput.addEventListener("input", apply);
  categoryInput.addEventListener("change", apply);
  apply();
}
`;

export function renderIndex(input: { topics: readonly TopicMeta[] }): string {
  const topics = input.topics;
  const cards = topics.map((topic) => renderCard(topic)).join("\n");
  const options = categories(topics)
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>拆解 · Teardown</title>
  <meta name="description" content="独立说明目录。用图示解释各种对象，不是官方页面。">
  <meta name="theme-color" content="#f3eee4">
  ${ICON}
  <link rel="stylesheet" href="${BASE_PATH_CSS}">
</head>
<body>
  <a class="skip" href="#catalog">跳到目录</a>
  <div class="wrap">
    <header>
      <p class="kicker">Teardown</p>
      <h1>拆解</h1>
      <p class="lead">用图示说明系统、技术、工具或概念。每篇都是独立说明，不是官方页面，也不表示获得认可。</p>
    </header>
    <main>
      <section aria-labelledby="how">
        <h2 id="how">怎么读</h2>
        <ol class="flow">
          <li><span>01</span><strong>元数据</strong><em>标题、摘要、分类、标签</em></li>
          <li><span>02</span><strong>目录</strong><em>搜索、筛选、稳定链接</em></li>
          <li><span>03</span><strong>独立页面</strong><em>版式、素材和演示都属于主题</em></li>
        </ol>
        <p class="note">图示负责结构和关系。较长的文字只在更适合说明理由或细节时出现。</p>
      </section>
      <section aria-labelledby="catalog">
        <h2 id="catalog">目录</h2>
        <form class="tools" role="search" action="${CATALOG_HREF}" method="get">
          <label for="q">搜索
            <input id="q" name="q" type="search" placeholder="标题、摘要、分类或标签" autocomplete="off">
          </label>
          <label for="category">分类
            <select id="category" name="category">
              <option value="">全部分类</option>
              ${options}
            </select>
          </label>
          <button type="submit">筛选</button>
        </form>
        <p id="count" class="count" role="status">${topics.length} 个主题</p>
        <div id="results" class="cards">
          ${cards}
        </div>
        <p id="empty" class="empty"${topics.length === 0 ? "" : " hidden"}>还没有主题。构建时，各主题的元数据会自动出现在这里。</p>
        <p id="nomatch" class="empty" hidden>没有匹配的主题。</p>
      </section>
    </main>
    <footer>
      <p>每篇主题使用自己的页面和资源，并提供返回本目录的链接。</p>
    </footer>
  </div>
  <script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
}

export function renderNotFound(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>没有这一页 · 拆解</title>
  ${ICON}
  <link rel="stylesheet" href="${BASE_PATH_CSS}">
</head>
<body>
  <main class="missing">
    <p class="kicker">Teardown</p>
    <h1>没有这一页</h1>
    <p>链接可能写错了，或者主题还没有发布。</p>
    <p><a href="${CATALOG_HREF}" data-teardown-catalog>返回目录</a></p>
  </main>
</body>
</html>
`;
}

const BASE_PATH_CSS = "/teardown/platform.css";
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%238f3418'/%3E%3C/svg%3E">`;

function renderCard(topic: TopicMeta): string {
  const haystack = [topic.title, topic.summary, topic.category, topic.slug, ...topic.tags].join(" ");
  const tags = topic.tags.length === 0 ? "" : `<ul>${topic.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
  return `<a class="card" href="/teardown/topics/${topic.slug}/" data-category="${escapeHtml(topic.category)}" data-search="${escapeHtml(haystack)}">
  <p class="eyebrow">${escapeHtml(topic.category)}</p>
  <h3>${escapeHtml(topic.title)}</h3>
  <p>${escapeHtml(topic.summary)}</p>
  ${tags}
</a>`;
}

function categories(topics: readonly TopicMeta[]): string[] {
  const values = new Set<string>();
  for (const topic of topics) values.add(topic.category);
  return [...values].sort(compareText);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
