// Minimal translation proxy for the SWF.
// Node.js 18+; run: npm install && npm start
// The free MyMemory endpoint has usage limits; this is a prototype, not a guaranteed
// unlimited public translation service.

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 8080;

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;

  // Flash Player checks this file before allowing a SWF to call this server.
  if (path === "/crossdomain.xml") {
    return send(res, 200,
      '<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*" secure="true"/></cross-domain-policy>',
      "text/x-cross-domain-policy; charset=utf-8");
  }

  if (req.method === "OPTIONS") return send(res, 204, "");
  if (path !== "/translate" || req.method !== "POST") {
    return send(res, 404, JSON.stringify({ error: "Not found" }));
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 20000) req.destroy();
  });

  req.on("end", () => {
    const params = new URLSearchParams(body);
    const text = (params.get("text") || "").trim();
    if (!text) return send(res, 400, JSON.stringify({ error: "Text is required" }));
    if (text.length > 4500) return send(res, 413, JSON.stringify({ error: "Text too long (max 4500 characters)" }));

    const query = new URLSearchParams({
      q: text,
      langpair: "es|tr"
    });
    const target = `https://api.mymemory.translated.net/get?${query.toString()}`;

    https.get(target, upstream => {
      let data = "";
      upstream.setEncoding("utf8");
      upstream.on("data", chunk => data += chunk);
      upstream.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const translation = parsed.responseData && parsed.responseData.translatedText;
          if (!translation) return send(res, 502, JSON.stringify({ error: "Translation provider returned no translation" }));
          send(res, 200, JSON.stringify({ translation }));
        } catch {
          send(res, 502, JSON.stringify({ error: "Invalid translation provider response" }));
        }
      });
    }).on("error", () => send(res, 502, JSON.stringify({ error: "Translation provider unavailable" })));
  });
});

server.listen(PORT, () => console.log(`Translation proxy listening on ${PORT}`));
