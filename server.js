"use strict";

// Minimal dependency-free server for the weather page.
//
// It serves the static front-end (index.html, app.js, style.css, image/*) and
// exposes GET /api/weather?city=<name>, which forwards the lookup to
// OpenWeatherMap using an API key that exists only on the server
// (OPENWEATHER_API_KEY environment variable). The key is never sent to the
// browser and only the fields the page needs are returned.
//
// Run with:  OPENWEATHER_API_KEY=<your key> node server.js

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const STATIC_ROOT = __dirname;
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_UPSTREAM_BODY_BYTES = 1024 * 1024;
const MAX_CITY_LENGTH = 100;

// Simple fixed-window rate limit per client address for the proxy endpoint.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateBuckets = new Map();

// Fail closed: without the key the proxy cannot work, so do not start at all.
if (!OPENWEATHER_API_KEY) {
  console.error("OPENWEATHER_API_KEY is not set. Refusing to start without the weather API key.");
  process.exit(1);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Files under STATIC_ROOT that must never be served to the browser.
const FORBIDDEN_FILES = new Set([
  path.join(STATIC_ROOT, "server.js")
]);

function sendJson(res, statusCode, payload) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { cod: "404", message: "Not found" });
}

function isRateLimited(clientKey) {
  const now = Date.now();
  let bucket = rateBuckets.get(clientKey);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(clientKey, bucket);
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

// Periodically drop expired rate-limit buckets so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
      rateBuckets.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function handleWeather(req, res, requestUrl) {
  const clientKey = req.socket.remoteAddress || "unknown";
  if (isRateLimited(clientKey)) {
    sendJson(res, 429, { cod: "429", message: "Too many requests" });
    return;
  }

  const city = (requestUrl.searchParams.get("city") || "").trim();
  if (!city || city.length > MAX_CITY_LENGTH) {
    sendJson(res, 400, {
      cod: "400",
      message: "A city name of at most " + MAX_CITY_LENGTH + " characters is required"
    });
    return;
  }

  // The key is attached here, server-side only, and never echoed back.
  const upstreamUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
  upstreamUrl.searchParams.set("units", "metric");
  upstreamUrl.searchParams.set("q", city);
  upstreamUrl.searchParams.set("appid", OPENWEATHER_API_KEY);

  const upstreamReq = https.get(upstreamUrl, { timeout: UPSTREAM_TIMEOUT_MS }, (upstreamRes) => {
    let body = "";
    upstreamRes.setEncoding("utf8");

    upstreamRes.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_UPSTREAM_BODY_BYTES) {
        upstreamReq.destroy();
        sendJson(res, 502, { cod: "502", message: "Weather service returned an oversized response" });
      }
    });

    upstreamRes.on("end", () => {
      if (res.headersSent) {
        return;
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        sendJson(res, 502, { cod: "502", message: "Invalid response from weather service" });
        return;
      }
      if (data === null || typeof data !== "object") {
        sendJson(res, 502, { cod: "502", message: "Invalid response from weather service" });
        return;
      }

      if (upstreamRes.statusCode !== 200) {
        // Pass through client-side lookup errors (e.g. unknown city); hide everything
        // else (e.g. key/quota problems) behind a generic upstream failure.
        if (upstreamRes.statusCode === 400 || upstreamRes.statusCode === 404) {
          sendJson(res, upstreamRes.statusCode, {
            cod: String(upstreamRes.statusCode),
            message: typeof data.message === "string" ? data.message : "Weather lookup failed"
          });
        } else {
          sendJson(res, 502, { cod: "502", message: "Weather service unavailable" });
        }
        return;
      }

      // Return only the fields app.js consumes, in the same shape it already expects.
      const main = data.main && typeof data.main === "object" ? data.main : {};
      const wind = data.wind && typeof data.wind === "object" ? data.wind : {};
      const weather = Array.isArray(data.weather) && data.weather.length > 0 && data.weather[0] ? data.weather[0] : {};

      sendJson(res, 200, {
        name: data.name,
        main: { temp: main.temp, humidity: main.humidity },
        wind: { speed: wind.speed },
        weather: [{ main: weather.main }]
      });
    });

    upstreamRes.on("error", () => {
      sendJson(res, 502, { cod: "502", message: "Weather service unavailable" });
    });
  });

  upstreamReq.on("timeout", () => {
    upstreamReq.destroy();
    sendJson(res, 504, { cod: "504", message: "Weather service timed out" });
  });

  upstreamReq.on("error", () => {
    sendJson(res, 502, { cod: "502", message: "Weather service unavailable" });
  });
}

function serveStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    sendJson(res, 400, { cod: "400", message: "Bad request" });
    return;
  }

  if (decoded === "/") {
    decoded = "/index.html";
  }
  if (decoded.indexOf("\0") !== -1) {
    notFound(res);
    return;
  }

  // Normalise away any ".." segments and confine the result to STATIC_ROOT.
  const filePath = path.resolve(STATIC_ROOT, "." + path.posix.normalize(decoded));
  if (!filePath.startsWith(STATIC_ROOT + path.sep) || FORBIDDEN_FILES.has(filePath)) {
    notFound(res);
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    notFound(res);
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      notFound(res);
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url, "http://localhost");
  } catch (e) {
    sendJson(res, 400, { cod: "400", message: "Bad request" });
    return;
  }

  if (requestUrl.pathname === "/api/weather") {
    handleWeather(req, res, requestUrl);
    return;
  }

  serveStatic(res, requestUrl.pathname);
});

server.listen(PORT, () => {
  console.log("Weather app listening on port " + PORT);
});
