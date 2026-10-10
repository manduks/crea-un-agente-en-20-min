// Everyone gets their own app — live demo server.
//
// Each person who scans the QR gets a private copy (fork) of one small web app
// and a box that says "change this app". A coding agent (pi by default) edits
// their copy; the projector wall shows every fork side by side. The presenter
// can then ask the agent which change people asked for most and merge it into
// the main app.
//
// No framework, one dependency for the QR code. Run: node server.mjs

import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data");
const FORKS = path.join(DATA, "forks");
const MAIN = path.join(DATA, "main");
const BASE_HTML = path.join(ROOT, "base", "index.html");
const PUBLIC = path.join(ROOT, "public");
const DECK = path.join(ROOT, "..", "presentacion");
const REPO_URL = "https://github.com/manduks/crea-un-agente-en-20-min";

// API key: from the environment, or (macOS) from the Keychain item "pi-demo-anthropic".
if (!process.env.ANTHROPIC_API_KEY && process.platform === "darwin" && (process.env.ENGINE || "pi") === "pi") {
  try {
    process.env.ANTHROPIC_API_KEY = execFileSync("security", ["find-generic-password", "-s", "pi-demo-anthropic", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {}
}

const cfg = {
  port: Number(process.env.PORT || 4317),
  engine: (process.env.ENGINE || "pi").toLowerCase(), // pi | claude
  piBin: process.env.PI_BIN || path.join(ROOT, "node_modules", ".bin", "pi"),
  piModel: process.env.PI_MODEL || "anthropic/claude-sonnet-5-5",
  piThinking: process.env.PI_THINKING || "low",
  claudeBin: process.env.CLAUDE_BIN || "claude",
  claudeModel: process.env.CLAUDE_MODEL || "sonnet",
  maxParallel: Number(process.env.MAX_PARALLEL || 6),
  maxChangesPerPerson: Number(process.env.MAX_CHANGES || 10),
  budgetUsd: Number(process.env.BUDGET_USD || 25),
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_S || 180) * 1000,
  key: process.env.PRESENTER_KEY || randomBytes(4).toString("hex"),
  publicUrl: process.env.PUBLIC_URL || "",
  tunnel: process.env.TUNNEL === "1",
};

// ---------------------------------------------------------------- state ----

fs.mkdirSync(FORKS, { recursive: true });
const STATE_FILE = path.join(DATA, "state.json");
let state = { forks: {}, totalCost: 0, analysis: null, main: { version: 1, merged: [] } };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) }; } catch {}
for (const f of Object.values(state.forks)) if (f.status !== "idle") f.status = "idle"; // after restart

if (!fs.existsSync(path.join(MAIN, "index.html"))) {
  fs.mkdirSync(MAIN, { recursive: true });
  fs.copyFileSync(BASE_HTML, path.join(MAIN, "index.html"));
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(STATE_FILE + ".tmp", JSON.stringify(state, null, 2));
    fs.renameSync(STATE_FILE + ".tmp", STATE_FILE);
  }, 200);
}

function publicFork(f) {
  const last = f.requests.at(-1);
  return {
    id: f.id, name: f.name, version: f.version, status: f.status, hidden: !!f.hidden,
    lastRequest: last?.text || "", lastSummary: last?.summary || "", lastStatus: last?.status || "",
    lastSource: last?.source || "persona", progress: f.progress || "",
    changes: f.requests.filter(r => r.status === "done").length,
  };
}

// Every suggestion people typed (not the ones the presenter pushed to everyone).
function suggestions() {
  const out = [];
  for (const f of Object.values(state.forks).sort((a, b) => a.createdAt - b.createdAt)) {
    f.requests.forEach((r, idx) => {
      if (r.source === "publico") return;
      out.push({ forkId: f.id, idx, name: f.name, text: r.text, status: r.status, summary: r.summary, accepted: r.accepted !== false && r.status === "done", ts: r.ts });
    });
  }
  return out;
}

function stats() {
  const forks = Object.values(state.forks);
  return {
    people: forks.length,
    changes: forks.reduce((n, f) => n + f.requests.filter(r => r.status === "done").length, 0),
    working: forks.filter(f => f.status === "working").length,
    queued: queue.length,
    cost: Number(state.totalCost.toFixed(3)),
    budget: cfg.budgetUsd,
    engine: cfg.engine === "pi" ? `pi · ${cfg.piModel}` : `claude · ${cfg.claudeModel}`,
  };
}

// ------------------------------------------------------------------ SSE ----

const clients = new Set();
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  const target = typeof event.fork === "string" ? event.fork : event.fork?.id;
  for (const c of clients) if (c.wall || !target || c.fork === target) c.res.write(line);
}
setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 20000);

// --------------------------------------------------------------- engines ----

// Runs one agent turn in `cwd`. mode "edit" = may change index.html, "think" = no tools.
// onLine(text) gets short human-readable progress lines.
function runEngine({ cwd, prompt, mode, onLine }) {
  return new Promise(resolvePromise => {
    let args, bin;
    if (cfg.engine === "claude") {
      bin = cfg.claudeBin;
      args = ["-p", "--output-format", "stream-json", "--verbose", "--model", cfg.claudeModel,
        "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
        ...(mode === "edit" ? ["--tools", "Read,Edit,Write", "--permission-mode", "acceptEdits"] : ["--tools", ""])];
      // prompt goes over stdin: --tools is variadic and would swallow it
    } else {
      bin = cfg.piBin;
      args = ["-p", "--mode", "json", "--no-session", "--no-extensions", "--no-skills",
        "--no-prompt-templates", "--no-context-files", "--no-mcp",
        "--model", cfg.piModel, "--thinking", cfg.piThinking,
        ...(mode === "edit"
          ? ["--tools", "read,edit,write", "-e", path.join(ROOT, "extensions", "fork-guard.ts")]
          : ["--no-tools"]),
        prompt];
    }

    const env = { ...process.env };
    if (cfg.engine === "claude") delete env.ANTHROPIC_API_KEY; // use the signed-in Claude Code login
    const child = spawn(bin, args, { cwd, env, stdio: [cfg.engine === "claude" ? "pipe" : "ignore", "pipe", "pipe"] });
    if (cfg.engine === "claude") child.stdin.end(prompt);
    let buf = "", stderr = "", text = "", cost = 0, error = "";

    const timer = setTimeout(() => { error = "tardó demasiado"; child.kill("SIGKILL"); }, cfg.jobTimeoutMs);

    const handle = ev => {
      if (cfg.engine === "claude") {
        if (ev.type === "assistant") {
          for (const b of ev.message?.content || []) {
            if (b.type === "tool_use") onLine?.(toolLine(b.name, b.input));
            if (b.type === "text" && b.text.trim()) text = b.text;
          }
        } else if (ev.type === "result") {
          cost = Number(ev.total_cost_usd || 0);
          if (ev.result) text = ev.result;
          if (ev.is_error) error = String(ev.result || ev.subtype || "error");
        }
        return;
      }
      if (ev.type === "tool_execution_start") onLine?.(toolLine(ev.toolName, ev.args));
      if (ev.type === "message_end" && ev.message?.role === "assistant") {
        cost += Number(ev.message.usage?.cost?.total || 0);
        const t = (ev.message.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
        if (t) text = t;
        if (ev.message.stopReason === "error") error = ev.message.errorMessage || "error del modelo";
      }
    };

    child.stdout.on("data", chunk => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try { handle(JSON.parse(line)); } catch {}
      }
    });
    child.stderr.on("data", c => { stderr = (stderr + c.toString()).slice(-2000); });
    child.on("error", e => { error = `could not start ${bin}: ${e.message}`; });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0 && !error) error = stderr.trim().split("\n").slice(-3).join(" ") || `exit ${code}`;
      resolvePromise({ ok: !error, text, cost, error });
    });
  });
}

function toolLine(name, input = {}) {
  const n = String(name).toLowerCase();
  if (n === "read") return "Leyendo la app";
  if (n === "write") return "Reescribiendo la app";
  if (n === "edit") {
    const snippet = String(input.newText ?? input.new_string ?? input.edits?.[0]?.newText ?? "")
      .replace(/\s+/g, " ").trim().slice(0, 70);
    return snippet ? `Editando: ${snippet}` : "Editando la app";
  }
  return `Intentó usar ${name} (bloqueado)`;
}

const EDIT_RULES = `Rules:
- The app is the single file ./index.html (inline CSS and JS). Edit only that file.
- No network: no fetch, no external scripts, images or fonts. Use emoji-free text, CSS and inline SVG for visuals.
- localStorage may be unavailable: keep any storage access inside try/catch.
- Keep it working on a phone screen (about 390px wide). Keep the rest of the app working.
- The person must SEE the change as soon as the app reloads, without clicking or setting anything. Example: for "modo oscuro" the app is dark right away (a switch back to light is optional). Never hide the change behind a toggle, setting or system preference. Visible doesn't mean started: a timer, a sound or an animation the person would start stays ready for them to start.
- Make focused edits; be fast.
- Text the user sees stays in Spanish (Mexico), including anything you add, unless the person asks for another language; then translate the whole app fully, with no Spanish left in parentheses.
- If the request is harmful, hateful or explicit, make a harmless playful change instead.
- End your reply with one last line that starts with "RESUMEN:" followed by one short sentence in Spanish (Mexico), max 14 words, plain text, no markdown, telling the person what you changed ("RESUMEN: Le puse modo oscuro a tu app.").`;

// The one-line summary the person sees on their phone.
function summaryOf(text) {
  const m = [...String(text || "").matchAll(/RESUMEN:\s*(.+)/g)].at(-1);
  let line = m ? m[1] : String(text || "").split("\n").map(l => l.trim()).filter(Boolean).at(-1) || "Listo.";
  line = line.replace(/[*_`#>]/g, "").replace(/^[-•]\s*/, "").trim();
  if (line.length > 140) line = line.slice(0, 140).replace(/\s+\S*$/, "") + "…";
  return line || "Listo.";
}

// ------------------------------------------------------------------ jobs ----

const queue = [];
let running = 0;

function pump() {
  while (running < cfg.maxParallel && queue.length) {
    const job = queue.shift();
    running++;
    job().finally(() => { running--; pump(); broadcast({ type: "stats", stats: stats() }); });
  }
  broadcast({ type: "stats", stats: stats() });
}

function validHtml(file) {
  try {
    const s = fs.readFileSync(file, "utf8");
    return s.length > 200 && s.length < 400_000 && /<body|<\/html>/i.test(s);
  } catch { return false; }
}

async function editInPlace({ dir, prompt, onLine }) {
  const file = path.join(dir, "index.html");
  const before = fs.readFileSync(file, "utf8");
  const r = await runEngine({ cwd: dir, prompt, mode: "edit", onLine });
  state.totalCost += r.cost;
  const after = validHtml(file) ? fs.readFileSync(file, "utf8") : null;
  if (!r.ok || !after) {
    fs.writeFileSync(file, before);
    return { ok: false, error: r.error || "la app se rompió, la regresé a como estaba", cost: r.cost };
  }
  if (after === before) return { ok: false, error: "no se hizo ningún cambio", cost: r.cost, text: r.text };
  return { ok: true, text: r.text, cost: r.cost, before };
}

// opts.source: "persona" (they typed it) or "publico" (the presenter pushed the room's favorites).
// opts.prompt overrides the default prompt.
function enqueueChange(fork, text, opts = {}) {
  const req = { text, ts: Date.now(), status: "queued", summary: "", cost: 0, source: opts.source || "persona" };
  fork.requests.push(req);
  fork.status = "queued";
  fork.progress = "En la fila, el agente ya viene";
  save();
  broadcast({ type: "fork", fork: publicFork(fork) });

  queue.push(async () => {
    fork.status = "working"; req.status = "working";
    const dir = path.join(FORKS, fork.id);
    const progress = line => { fork.progress = line; broadcast({ type: "progress", fork: fork.id, line }); };
    progress("Pensando");
    broadcast({ type: "fork", fork: publicFork(fork) });
    const prompt = opts.prompt || `You are editing a tiny web app that belongs to ${fork.name}. They asked:\n\n"${text}"\n\nMake that change.\n\n${EDIT_RULES}`;
    const r = await editInPlace({ dir, prompt, onLine: progress });
    req.cost = r.cost;
    if (r.ok) {
      fs.mkdirSync(path.join(dir, "history"), { recursive: true });
      fs.writeFileSync(path.join(dir, "history", `v${fork.version}.html`), r.before);
      fork.version++;
      req.status = "done";
      req.summary = summaryOf(r.text);
    } else if (req.source === "publico" && r.error === "no se hizo ningún cambio") {
      req.status = "done";
      req.summary = "Tu app ya lo tenía.";
    } else {
      req.status = "failed";
      req.summary = `No funcionó: ${String(r.error).slice(0, 140)}`;
    }
    if (req.source === "publico") globalRun.done++;
    fork.status = "idle";
    fork.progress = "";
    save();
    broadcast({ type: "fork", fork: publicFork(fork), done: { ok: req.status === "done", summary: req.summary } });
    if (req.source === "publico") broadcast({ type: "global", run: globalRun });
    if (fork.pendingGlobal) { const g = fork.pendingGlobal; fork.pendingGlobal = null; enqueueChange(fork, g.text, g); }
  });
  pump();
}

// ------------------------------------------------------- analyze & merge ----

async function analyze() {
  const lines = suggestions().filter(x => x.accepted).map(x => `- ${x.name}: ${x.text}`);
  if (!lines.length) return { error: "Todavía no hay sugerencias aceptadas." };
  broadcast({ type: "analysis", status: "working" });
  const prompt = `${lines.length} people each changed their own copy of a small habit-tracker web app. Here is every change they asked for:\n\n${lines.join("\n")}\n\nGroup them into at most 5 themes, most-requested first; "count" is how many of the lines above belong to the theme. Reply with JSON only, no prose, in this shape:\n{"themes":[{"title":"short theme name","count":3,"examples":["...","..."],"instruction":"one concrete instruction to add this theme to the main app; the feature must be visible and on by default, never an opt-in setting"}],"insight":"one sentence (max 25 words) a product manager should take away"}\nWrite "title", "instruction" and "insight" in Spanish (Mexico). Copy "examples" exactly as people wrote them.`;
  const r = await runEngine({ cwd: DATA, prompt, mode: "think" });
  state.totalCost += r.cost;
  let parsed = null;
  try { parsed = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1)); } catch {}
  if (!parsed?.themes?.length) {
    broadcast({ type: "analysis", status: "failed", error: r.error || "no pude leer la respuesta" });
    return { error: r.error || "no pude leer la respuesta" };
  }
  state.analysis = { ...parsed, total: lines.length, at: Date.now() };
  save();
  broadcast({ type: "analysis", status: "done", analysis: state.analysis, stats: stats() });
  return state.analysis;
}

// Apply the chosen themes everywhere: first the main app (what new people get),
// then every person's own copy, keeping what they already changed.
let globalRun = { status: "idle", themes: [], total: 0, done: 0, mainDone: 0 };

async function applyGlobal(indexes) {
  const themes = indexes.map(i => state.analysis?.themes?.[i]).filter(Boolean);
  if (!themes.length) return { error: "Elige al menos un tema." };
  if (globalRun.status === "working") return { error: "Ya se está aplicando." };
  const forks = Object.values(state.forks).filter(f => !f.hidden);
  globalRun = { status: "working", themes: themes.map(t => t.title), total: forks.length, done: 0, mainDone: 0, mainTotal: 1 };
  broadcast({ type: "global", run: globalRun });

  const list = themes.map((t, n) => `${n + 1}. ${t.title}: ${t.instruction}`).join("\n");
  const text = `Lo más pedido: ${themes.map(t => t.title).join(", ")}`;

  // 1) everyone's own app, in parallel (the queue runs MAX_PARALLEL at a time)
  for (const f of forks) {
    const prompt = `You are editing a tiny web app that belongs to ${f.name}. The audience voted on everyone's suggestions, and these were the most requested:\n\n${list}\n\nAdd them to this app, visible and on by default. Keep every change this person already made; if the app already has one of them, keep theirs and don't add a duplicate.\n\n${EDIT_RULES}`;
    const job = { source: "publico", prompt, text };
    if (f.status === "idle") enqueueChange(f, text, job);
    else f.pendingGlobal = { ...job };
  }

  // 2) the main app (what new people get), one combined pass, at the same time
  (async () => {
    broadcast({ type: "main", status: "working", title: themes.map(t => t.title).join(", ") });
    const progress = line => broadcast({ type: "progress", fork: "main", line });
    const prompt = `This is the main version of a small habit-tracker web app that everyone uses. The audience voted on everyone's suggestions, and these were the most requested:\n\n${list}\n\nAdd all of them to the main app, visible and on by default, as good defaults for everyone.\n\n${EDIT_RULES}`;
    const r = await editInPlace({ dir: MAIN, prompt, onLine: progress });
    if (r.ok) { state.main.version++; state.main.merged.push(...themes.map(t => t.title)); }
    globalRun.mainDone = 1;
    save();
    broadcast({ type: "main", status: r.ok ? "done" : "failed", title: themes.map(t => t.title).join(", "), version: state.main.version, error: r.error, stats: stats() });
    broadcast({ type: "global", run: globalRun });
    waitGlobal();
  })();
  return { ok: true, total: forks.length };
}

function waitGlobal() {
  if (globalRun.status !== "working") return;
  if (globalRun.done >= globalRun.total && globalRun.mainDone >= globalRun.mainTotal) {
    globalRun.status = "done";
    save();
    broadcast({ type: "global", run: globalRun, stats: stats() });
    return;
  }
  setTimeout(waitGlobal, 1000);
}

// ------------------------------------------------------------------ http ----

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise(r => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 10_000) req.destroy(); });
    req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } });
  });
}

// The person's app runs in a sandboxed iframe with no network access.
const APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

function serveApp(res, file) {
  if (!fs.existsSync(file)) return send(res, 404, "not found", "text/plain");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": APP_CSP });
  res.end(fs.readFileSync(file));
}

function servePublic(res, name) {
  const file = path.join(PUBLIC, name);
  send(res, 200, fs.readFileSync(file), name.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain");
}

const isPresenter = url => url.searchParams.get("key") === cfg.key;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (req.method === "GET" && (p === "/" || p.startsWith("/u/"))) return servePublic(res, "phone.html");
    if (req.method === "GET" && p === "/wall") return servePublic(res, "wall.html");
    if (req.method === "GET" && p === "/revision") return servePublic(res, "review.html");
    if (req.method === "GET" && p === "/api/suggestions") {
      return send(res, 200, { suggestions: suggestions(), analysis: state.analysis, global: globalRun, main: state.main, stats: stats(), presenter: isPresenter(url) });
    }

    // the talk's slides, served by the same server
    if (req.method === "GET" && (p === "/charla" || p === "/charla/")) {
      return send(res, 200, fs.readFileSync(path.join(DECK, "index.html")), "text/html; charset=utf-8");
    }
    const font = p.match(/^\/(?:charla\/)?fuentes\/([a-z0-9-]+\.woff2)$/);
    if (req.method === "GET" && font) {
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "max-age=86400" });
      return res.end(fs.readFileSync(path.join(DECK, "fuentes", font[1])));
    }
    if (req.method === "GET" && p === "/qr-repo.svg") {
      const svg = await QRCode.toString(REPO_URL, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      return send(res, 200, svg, "image/svg+xml");
    }

    if (req.method === "GET" && p === "/qr.svg") {
      const svg = await QRCode.toString(joinUrl(), { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      return send(res, 200, svg, "image/svg+xml");
    }

    if (req.method === "GET" && p.startsWith("/app/")) {
      const id = p.slice(5).replace(/[^a-z0-9]/gi, "");
      if (id === "main") return serveApp(res, path.join(MAIN, "index.html"));
      if (id === "base") return serveApp(res, BASE_HTML);
      return serveApp(res, path.join(FORKS, id, "index.html"));
    }

    if (req.method === "GET" && p === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      res.write(`: ${" ".repeat(2048)}\n\n`); // pushes proxies to flush; phones also poll, so nothing depends on this
      const client = { res, fork: url.searchParams.get("fork"), wall: url.searchParams.has("wall") };
      clients.add(client);
      res.write(`data: ${JSON.stringify({ type: "hello", stats: stats(), joinUrl: joinUrl() })}\n\n`);
      req.on("close", () => clients.delete(client));
      return;
    }

    if (req.method === "GET" && p === "/api/state") {
      return send(res, 200, {
        forks: Object.values(state.forks).sort((a, b) => a.createdAt - b.createdAt).map(publicFork),
        stats: stats(), analysis: state.analysis, main: state.main, joinUrl: joinUrl(),
        presenter: isPresenter(url),
      });
    }

    if (req.method === "GET" && p.startsWith("/api/fork/")) {
      const f = state.forks[p.slice(10)];
      if (!f) return send(res, 404, { error: "unknown" });
      return send(res, 200, { fork: publicFork(f), requests: f.requests.map(r => ({ text: r.text, status: r.status, summary: r.summary })) });
    }

    if (req.method === "POST" && p === "/api/join") {
      const body = await readBody(req);
      const name = String(body.name || "").replace(/[<>]/g, "").trim().slice(0, 24) || "Alguien";
      const id = randomBytes(5).toString("hex");
      const dir = path.join(FORKS, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(MAIN, "index.html"), path.join(dir, "index.html"));
      state.forks[id] = { id, name, createdAt: Date.now(), version: 1, status: "idle", requests: [] };
      save();
      broadcast({ type: "fork", fork: publicFork(state.forks[id]), joined: true });
      broadcast({ type: "stats", stats: stats() });
      return send(res, 200, { id });
    }

    if (req.method === "POST" && p === "/api/change") {
      const body = await readBody(req);
      const f = state.forks[body.id];
      const text = String(body.text || "").trim().slice(0, 240);
      if (!f) return send(res, 404, { error: "No encontramos tu app. Recarga la página." });
      if (!text) return send(res, 400, { error: "Escribe qué quieres cambiar." });
      if (f.status !== "idle") return send(res, 409, { error: "Tu app todavía se está cambiando." });
      if (f.requests.filter(r => r.source !== "publico").length >= cfg.maxChangesPerPerson) return send(res, 429, { error: "Llegaste al límite de cambios. ¡Mira la pantalla!" });
      if (state.totalCost >= cfg.budgetUsd) return send(res, 429, { error: "Se acabó el presupuesto del demo. ¡Mira la pantalla!" });
      enqueueChange(f, text);
      return send(res, 200, { ok: true, position: queue.length });
    }

    if (req.method === "POST" && p === "/api/undo") {
      const body = await readBody(req);
      const f = state.forks[body.id];
      if (!f || f.status !== "idle" || f.version <= 1) return send(res, 400, { error: "No hay nada que deshacer." });
      const prev = path.join(FORKS, f.id, "history", `v${f.version - 1}.html`);
      if (!fs.existsSync(prev)) return send(res, 400, { error: "No hay nada que deshacer." });
      fs.copyFileSync(prev, path.join(FORKS, f.id, "index.html"));
      f.version--;
      const last = [...f.requests].reverse().find(r => r.status === "done");
      if (last) last.status = "undone";
      save();
      broadcast({ type: "fork", fork: publicFork(f) });
      return send(res, 200, { ok: true });
    }

    // presenter-only
    if (req.method === "POST" && p.startsWith("/api/presenter/")) {
      if (!isPresenter(url)) return send(res, 403, { error: "falta la clave del presentador" });
      const action = p.slice("/api/presenter/".length);
      const body = await readBody(req);
      if (action === "analyze") return send(res, 200, await analyze());
      if (action === "merge") return send(res, 200, await applyGlobal([Number(body.index || 0)]));
      if (action === "apply") return send(res, 200, await applyGlobal((body.indexes || []).map(Number)));
      if (action === "accept") {
        const r = state.forks[body.forkId]?.requests?.[Number(body.idx)];
        if (r && r.status === "done") { r.accepted = r.accepted === false; save(); broadcast({ type: "suggestions" }); }
        return send(res, 200, { ok: true });
      }
      if (action === "hide") {
        const f = state.forks[body.id];
        if (f) { f.hidden = !f.hidden; save(); broadcast({ type: "fork", fork: publicFork(f) }); }
        return send(res, 200, { ok: true });
      }
      if (action === "reset") {
        queue.length = 0;
        fs.rmSync(FORKS, { recursive: true, force: true });
        fs.mkdirSync(FORKS, { recursive: true });
        fs.copyFileSync(BASE_HTML, path.join(MAIN, "index.html"));
        state = { forks: {}, totalCost: 0, analysis: null, main: { version: 1, merged: [] } };
        globalRun = { status: "idle", themes: [], total: 0, done: 0, mainDone: 0 };
        save();
        broadcast({ type: "reset" });
        return send(res, 200, { ok: true });
      }
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "error del servidor" });
  }
});

// ------------------------------------------------------- urls & tunnel ----

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return "localhost";
}
function joinUrl() { return cfg.publicUrl || `http://${lanIp()}:${cfg.port}`; }

function startTunnel() {
  const t = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${cfg.port}`], { stdio: ["ignore", "pipe", "pipe"] });
  const look = chunk => {
    const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !cfg.publicUrl) {
      cfg.publicUrl = m[0];
      console.log(`\n  Túnel listo: ${cfg.publicUrl}  (el QR ya apunta aquí)\n`);
      broadcast({ type: "hello", stats: stats(), joinUrl: joinUrl() });
    }
  };
  t.stdout.on("data", look);
  t.stderr.on("data", look);
  t.on("error", e => console.error("cloudflared falló:", e.message));
  process.on("exit", () => t.kill());
}

server.listen(cfg.port, () => {
  console.log(`
  Cada quien su app
  -----------------
  Motor:        ${stats().engine}
  Celulares:    ${joinUrl()}
  Presentación: http://localhost:${cfg.port}/charla?key=${cfg.key}
  Pantalla:     http://localhost:${cfg.port}/wall?key=${cfg.key}
  API key:      ${cfg.engine === "claude" ? "sesión de Claude Code" : process.env.ANTHROPIC_API_KEY ? "lista" : "FALTA (exporta ANTHROPIC_API_KEY)"}
  Presupuesto:  $${cfg.budgetUsd} USD  ·  ${cfg.maxParallel} cambios a la vez  ·  ${cfg.maxChangesPerPerson} cambios por persona
`);
  if (cfg.tunnel) startTunnel();
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
