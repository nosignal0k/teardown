import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { buildSite } from "./build.ts";
import { formatIssue } from "./issue.ts";
import { isDirectRun, resolveSitePaths, type SitePaths } from "./site.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

export type PublishedMatch =
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "file"; readonly file: string }
  | { readonly kind: "missing" };

export function resolvePublishedPath(outDir: string, rawUrl: string): PublishedMatch {
  let url: URL;
  try {
    url = new URL(rawUrl, "http://127.0.0.1");
  } catch {
    return { kind: "missing" };
  }
  const pathname = url.pathname;
  if (pathname.includes("\0")) return { kind: "missing" };
  if (pathname === "/" || pathname === "/teardown") return { kind: "redirect", to: "/teardown/" };
  if (!pathname.startsWith("/teardown/")) return { kind: "missing" };

  const remainder = pathname.slice("/teardown/".length);
  const segments = remainder.split("/").filter((part) => part !== "");
  if (segments.some((part) => part === "." || part === "..")) return { kind: "missing" };
  const root = path.resolve(outDir);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return { kind: "missing" };

  if (remainder === "" || remainder.endsWith("/")) {
    const index = path.join(target, "index.html");
    return fs.existsSync(index) && fs.statSync(index).isFile() ? { kind: "file", file: index } : { kind: "missing" };
  }
  if (!fs.existsSync(target)) return { kind: "missing" };
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const suffix = pathname.endsWith("/") ? "" : "/";
    return { kind: "redirect", to: `${pathname}${suffix}` };
  }
  if (stat.isFile()) return { kind: "file", file: target };
  return { kind: "missing" };
}

export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 4173;
  if (!/^\d+$/.test(raw)) throw new Error("端口无效");
  const port = Number(raw);
  if (port > 65535) throw new Error("端口无效");
  return port;
}

export function startServer(input: { outDir: string; host: string; port: number }): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    serve(request, response, input.outDir);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, input.host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("无法确定端口"));
        return;
      }
      resolve({
        origin: `http://${input.host}:${address.port}`,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

function serve(request: http.IncomingMessage, response: http.ServerResponse, outDir: string): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const match = resolvePublishedPath(outDir, request.url ?? "/");
  if (match.kind === "redirect") {
    response.writeHead(302, { Location: match.to, "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const file = match.kind === "file" ? match.file : path.join(outDir, "404.html");
  const status = match.kind === "file" ? 200 : 404;
  const body = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from("没有这一页\n");
  const type = match.kind === "file" ? contentType(file) : "text/html; charset=utf-8";
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function watch(paths: SitePaths): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const result = buildSite(paths);
        if (!result.ok) {
          for (const item of result.issues) console.error(formatIssue(item));
          return;
        }
        console.log(`已重新构建 ${result.topicCount} 个主题`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : "构建失败");
      }
    }, 100);
  };
  for (const directory of [path.join(paths.root, "src"), paths.topicsDir, paths.sharedDir]) {
    if (!fs.existsSync(directory)) continue;
    fs.watch(directory, { recursive: true }, schedule);
  }
}

if (isDirectRun(import.meta.url)) {
  try {
    const paths = resolveSitePaths(process.env);
    const built = buildSite(paths);
    if (!built.ok) {
      for (const item of built.issues) console.error(formatIssue(item));
      process.exitCode = 1;
    } else {
      const port = parsePort(process.env.TEARDOWN_PORT);
      startServer({ outDir: paths.outDir, host: "127.0.0.1", port })
        .then((running) => {
          console.log(`${running.origin}/teardown/`);
          watch(paths);
        })
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : "无法启动");
          process.exitCode = 1;
        });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "无法启动");
    process.exitCode = 1;
  }
}
