"use strict";

// Minimal server for the weather application.
// - Serves the static front-end (index.html, app.js, style.css, image/*).
// - Exposes GET /api/weather?q=<city>, which forwards a validated city name to
//   OpenWeatherMap using the API key held server-side in OPENWEATHER_API_KEY.
// Uses only Node.js core modules; no third-party dependencies.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Fail closed: never start without the secret, and never fall back to a literal.
if (typeof OPENWEATHER_API_KEY !== "string" || OPENWEATHER_API_KEY.trim() === "") {
  console.error("OPENWEATHER_API_KEY environment variable is not set. Refusing to start.");
  process.exit(1);
}

const OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5/weather?units=metric&q=";
const MAX_CITY_LENGTH = 100;
const UPSTREAM_TIMEOUT_MS = 10000;

const STATIC_ROOT = __dirname;
// Files that live in the repository but must never be served to browsers.
const SERVER_ONLY_FILES = new Set(["server.js", "package.json", "package-lock.json", ".env"]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function handleWeather(req, res, url) {
  const rawCity = url.searchParams.get("q");
  const city = typeof rawCity === "string" ? rawCity.trim() : "";
  if (city.length === 0 || city.length > MAX_CITY_LENGTH) {
    sendJson(res, 400, { cod: "400", message: "A city name of 1-" + MAX_CITY_LENGTH + " characters is required" });
    return;
  }

  const upstreamUrl =
    OPENWEATHER_BASE + encodeURIComponent(city) + "&appid=" + encodeURIComponent(OPENWEATHER_API_KEY);

  const upstreamReq = https.get(upstreamUrl, { headers: { Accept: "application/json" } }, (upstreamRes) => {
    const chunks = [];
    upstreamRes.on("data", (chunk) => chunks.push(chunk));
    upstreamRes.on("end", () => {
      if (res.headersSent) {
        res.end();
        return;
      }
      // Pass the provider's status and JSON body through unchanged so the
      // client keeps receiving the same data shape (name, main, wind, weather).
      res.writeHead(upstreamRes.statusCode || 502, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(Buffer.concat(chunks));
    });
    upstreamRes.on("error", () => {
      sendJson(res, 502, { cod: "502", message: "Weather service unavailable" });
    });
  });

  upstreamReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error("Upstream request timed out"));
  });
  upstreamReq.on("error", () => {
    sendJson(res, 502, { cod: "502", message: "Weather service unavailable" });
  });
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    sendJson(res, 400, { message: "Bad request" });
    return;
  }
  if (pathname === "/") {
    pathname = "/index.html";
  }

  // Confine to the repository directory and never expose server-side or dot files.
  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  if (!filePath.startsWith(STATIC_ROOT + path.sep)) {
    sendJson(res, 403, { message: "Forbidden" });
    return;
  }
  const relative = path.relative(STATIC_ROOT, filePath);
  const segments = relative.split(path.sep);
  if (SERVER_ONLY_FILES.has(relative) || segments.some((segment) => segment.startsWith("."))) {
    sendJson(res, 404, { message: "Not found" });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { message: "Not found" });
      return;
    }
    const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": stats.size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { message: "Internal server error" });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (e) {
    sendJson(res, 400, { message: "Bad request" });
    return;
  }

  if (url.pathname === "/api/weather") {
    handleWeather(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log("Weather application listening on http://localhost:" + PORT);
});
