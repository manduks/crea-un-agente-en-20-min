// Mock OpenAI-compatible model for testing the pi engine without a real key.
// Script per request (counted by tool results already in the conversation):
//   0 → read index.html
//   1 → write ../../state.json   (fork-guard must block this)
//   2 → edit index.html (title)
//   3 → final text
import http from "node:http";
const port = Number(process.argv[2] || 4399);
http.createServer((req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const tools = (j.messages || []).filter(m => m.role === "tool");
    const n = tools.length;
    if (n >= 2) console.error("tool result before step", n, ":", JSON.stringify(tools.at(-1).content).slice(0, 160));
    const steps = [
      { name: "read", args: { path: "index.html" } },
      { name: "write", args: { path: "../../state.json", content: "pwned" } },
      { name: "edit", args: { path: "index.html", edits: [{ oldText: "<title>Hábitos</title>", newText: "<title>Hábitos (mock)</title>" }] } },
    ];
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const base = { id: "x", object: "chat.completion.chunk", created: 0, model: "mock" };
    if (n < steps.length) {
      const s = steps[n];
      send({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_" + n, type: "function", function: { name: s.name, arguments: JSON.stringify(s.args) } }] }, finish_reason: null }] });
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
    } else {
      send({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Le cambié el título a Hábitos (mock)." }, finish_reason: null }] });
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
    }
    res.end("data: [DONE]\n\n");
  });
}).listen(port, () => console.error("mock model on", port));
