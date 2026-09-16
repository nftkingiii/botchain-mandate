import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const root = resolve("dist");
const port = Number(process.env.PORT || 8080);
const revision = process.env.REVISION || process.env.RAILWAY_GIT_COMMIT_SHA || "local";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok", service: "mandate-web", revision }));
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400); response.end("Bad path"); return; }
  const candidate = resolve(root, `.${pathname}`);
  const safeCandidate = candidate === root || candidate.startsWith(root + sep);
  const file = safeCandidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(root, "index.html");
  if (!existsSync(file)) { response.writeHead(503); response.end("Build output is missing. Run pnpm build."); return; }
  response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY" });
  createReadStream(file).pipe(response);
});
server.listen(port, "0.0.0.0", () => process.stdout.write(`Mandate listening on 0.0.0.0:${port} (${revision})\n`));
