import http from "node:http";
import fs from "node:fs/promises";
import { at } from "./lib.mjs";
const files = new Map([
  ["/", "preview/index.html"],
  ["/preview/style.css", "preview/style.css"],
  ["/preview/app.mjs", "preview/app.mjs"],
  ["/src/core.mjs", "src/core.mjs"],
  ["/data/snapshot.json", "data/snapshot.json"],
]);
const server = http.createServer(async (req, res) => {
  const file = files.get(new URL(req.url, "http://localhost").pathname);
  if (!file || req.method !== "GET") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const data = await fs.readFile(at(file));
    res.writeHead(200, {
      "Content-Type": file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".json")
            ? "application/json"
            : "application/javascript",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' https://assets-bucket.deadlock-api.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Preview unavailable; run npm run sync first.");
  }
});
server.listen(Number(process.env.SHOPMARK_PORT ?? 4173), "127.0.0.1", () =>
  console.log("Shopmark preview: http://127.0.0.1:" + server.address().port),
);
