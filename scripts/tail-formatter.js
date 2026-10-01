#!/usr/bin/env node
// tail-formatter.js — Companion to scripts/tail-all.sh
//
// Reads wrangler tail --format json stdout (multi-line pretty JSON), buffers
// complete JSON objects by tracking brace depth, and emits one formatted line
// per event.
//
// Args: workerName colorEsc resetEsc dimEsc grayEsc redEsc greenEsc yellowEsc format statusOnly debug baseRoute

const workerName = process.argv[2];
const colorEsc = process.argv[3] || "";
const resetEsc = process.argv[4] || "";
const dimEsc = process.argv[5] || "";
const grayEsc = process.argv[6] || "";
const redEsc = process.argv[7] || "";
const greenEsc = process.argv[8] || "";
const yellowEsc = process.argv[9] || "";
const format = process.argv[10] || "pretty";
const statusOnly = process.argv[11] === "true";
const debug = process.argv[12] === "true";
const baseRoute = (process.argv[13] || "").trim();

const prefix = colorEsc + "[" + workerName + "]" + resetEsc;

let buf = "";
let depth = 0;
let inString = false;
let escape = false;

function processEvent(jsonStr) {
  let evt;
  try {
    evt = JSON.parse(jsonStr);
  } catch {
    return;
  }

  if (format === "json") {
    console.log(prefix + " " + JSON.stringify(evt));
    return;
  }

  // Pretty mode
  const req = evt.event && evt.event.request;
  const res = evt.event && evt.event.response;
  const logs = evt.logs || [];
  const exceptions = evt.exceptions || [];
  const outcome = evt.outcome || "ok";
  const cpuTime = evt.cpuTime;
  const wallTime = evt.wallTime;

  if (req) {
    const status = res ? (res.status || "?") : "?";
    const method = req.method || "?";
    const rawUrl = req.url || "?";
    let url = rawUrl;
    try {
      const u = new URL(rawUrl);
      url = u.pathname + u.search;
    } catch {}

    // Filter static asset noise
    if (
      url.startsWith("/assets/") ||
      url.startsWith("/__manifest") ||
      url.startsWith("/_astro/") ||
      url === "/favicon.ico"
    ) {
      return;
    }

    // Status-only filter: skip 2xx/3xx (unless there are logs/exceptions)
    if (statusOnly && typeof status === "number" && status < 400) {
      if (logs.length === 0 && exceptions.length === 0) return;
    }

    // Color by status
    let statusColor = greenEsc;
    if (typeof status === "number") {
      if (status >= 500) statusColor = redEsc;
      else if (status >= 400) statusColor = yellowEsc;
    }

    let line = `${prefix} ${statusColor}${status}${resetEsc} ${method} ${url}`;

    // Timing
    if (debug && typeof cpuTime === "number") {
      line += ` ${dimEsc}${cpuTime}ms(cpu)${resetEsc}`;
    } else if (typeof wallTime === "number") {
      line += ` ${dimEsc}${wallTime}ms${resetEsc}`;
    }

    // Debug: cf-ray, IP, country
    if (debug && req.headers) {
      const ray = req.headers["cf-ray"] || "";
      const ip = req.headers["cf-connecting-ip"] || "";
      const cf = req.cf || (evt.event && evt.event.cf) || {};
      const country = cf.country || "";
      if (ray) line += ` ${dimEsc}ray=${ray}${resetEsc}`;
      if (ip) line += ` ${dimEsc}ip=${ip}${resetEsc}`;
      if (country) line += ` ${dimEsc}${country}${resetEsc}`;
    }

    // Outcome warning
    if (outcome === "exception" || outcome === "exceededCpu") {
      line += ` ${redEsc}${outcome}${resetEsc}`;
    }

    console.log(line);
  }

  // console.log / console.error from worker code
  for (const log of logs) {
    const msg = typeof log === "string" ? log : (log.message || JSON.stringify(log));
    if (statusOnly && !/error|fail|warn|exception/i.test(msg) && !exceptions.length) continue;
    console.log(`${prefix} ${grayEsc}log${resetEsc} ${msg}`);
  }

  // Exceptions
  for (const ex of exceptions) {
    const name = ex.name || "Error";
    const msg = ex.message || "";
    console.log(`${prefix} ${redEsc}EXCEPTION${resetEsc} ${name}: ${msg}`);
    if (ex.stack) {
      const stackLines = ex.stack.split("\n").slice(0, 5);
      for (const sl of stackLines) {
        console.log(`${prefix} ${dimEsc}  ${sl.trim()}${resetEsc}`);
      }
    }
  }

  // Bad outcome with no request details
  if (!req && (outcome === "exception" || outcome === "exceededCpu")) {
    console.log(`${prefix} ${redEsc}${outcome}${resetEsc} (no request details)`);
  }
}

// Read stdin, buffer complete JSON objects by tracking brace depth
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const objStr = buf.slice(0, i + 1);
        buf = buf.slice(i + 1);
        i = -1;
        processEvent(objStr.trim());
      }
    }
  }
});

process.stdin.on("end", () => {
  if (buf.trim() && depth === 0) {
    processEvent(buf.trim());
  }
});
