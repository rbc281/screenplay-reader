const http = require("http");
const fs = require("fs");
const path = require("path");

let chromium;
try { ({ chromium } = require("playwright")); }
catch {
  console.error("Playwright is required for browser tests. Run: npm install");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".fdx": "application/xml", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const safePath = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, safePath);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/tests/browser-tests.html`);
  await page.waitForFunction(() => Array.isArray(window.__TEST_RESULTS__));
  const results = await page.evaluate(() => window.__TEST_RESULTS__);
  results.forEach((result) => console.log(`${result.pass ? "✓" : "✗"} ${result.name}${result.error ? ` — ${result.error}` : ""}`));
  await browser.close();
  server.close();
  if (results.some((result) => !result.pass)) process.exit(1);
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});

