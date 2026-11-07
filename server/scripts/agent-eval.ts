/**
 * Agent-layer evaluation harness for ResearchIQ (preliminary technical run, not a validation).
 *
 * Runs the production agent (same system prompt, same tool registry, same model resolution as
 * POST /api/chat) on a fixed set of natural-language management queries whose reference answers
 * are computed deterministically from a local data snapshot, and records per query:
 *   - answer correctness against the deterministic oracle (strict and lenient),
 *   - tool calls: count, success (no tool error), argument validity against the declared schema,
 *     calls to external (network) tools that the system prompt reserves for missing data,
 *   - tokens, cost (as reported by pi-ai) and wall-clock latency.
 *
 * The HTTP endpoint returns only the final text, so the harness builds the Agent directly and
 * reads agent.state.messages to observe the tool-call trace.
 *
 * Usage (from server/):
 *   npx tsx --env-file=.env scripts/agent-eval.ts --dry-run            # write the query set only, no API calls
 *   npx tsx --env-file=.env scripts/agent-eval.ts --limit 5            # smoke run
 *   npx tsx --env-file=.env scripts/agent-eval.ts --max-cost 1.00      # full run, stops before exceeding the budget
 *
 * Options: --data <path> (default ../csbc_faculty_data.json), --out <dir> (default ../docs/agent-eval),
 *          --limit N, --max-cost USD (default 1.00), --lang ua|en (default ua).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { Agent } from "@mariozechner/pi-agent-core";
import { Value } from "@sinclair/typebox/value";
import { Kind } from "@sinclair/typebox";
import { buildSystemPrompt, createTools } from "../src/agent.js";
import { getChatModel } from "../src/llmProvider.js";
import type { Faculty } from "../src/types.js";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const DRY = argv.includes("--dry-run");
const DATA = opt("data", "../csbc_faculty_data.json")!;
const OUT = opt("out", "../docs/agent-eval")!;
const LIMIT = Number(opt("limit", "0")) || Infinity;
const MAX_COST = Number(opt("max-cost", "1.00"));
const LANG = (opt("lang", "ua") as "ua" | "en");

const EXTERNAL_TOOLS = new Set(["get_author_metrics_live", "search_global_works", "find_collaboration_network"]);

// ---------------------------------------------------------------- query set with deterministic oracles
type Oracle = { kind: "number"; value: number; year?: number } | { kind: "name"; value: string };
type Query = { id: string; template: string; query: string; oracle: Oracle };

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQueries(fac: Faculty[]): Query[] {
  const rnd = mulberry32(20261107);
  const q: Query[] = [];
  const withPubs = fac.filter((f) => f.publications.length > 0);
  for (const f of withPubs) {
    const p = f.publications;
    q.push({ id: `total:${f.orcidId}`, template: "total", query: `Скільки всього публікацій має ${f.name}?`,
      oracle: { kind: "number", value: p.length } });
    q.push({ id: `scopus:${f.orcidId}`, template: "scopus", query: `Скільки публікацій ${f.name} індексовано в Scopus?`,
      oracle: { kind: "number", value: p.filter((x) => x.sources.includes("scopus")).length } });
    const years = [...new Set(p.map((x) => x.year).filter((y) => y > 0))].sort();
    const y = years[Math.floor(rnd() * years.length)];
    q.push({ id: `year:${f.orcidId}:${y}`, template: "year", query: `Скільки публікацій ${f.name} вийшло у ${y} році?`,
      oracle: { kind: "number", value: p.filter((x) => x.year === y).length, year: y } });
    q.push({ id: `oa:${f.orcidId}`, template: "open_access", query: `Скільки публікацій ${f.name} у відкритому доступі?`,
      oracle: { kind: "number", value: p.filter((x) => x.isOa).length } });
  }
  const all = fac.flatMap((f) => f.publications);
  const top = [...fac].sort((a, b) => b.publications.length - a.publications.length)[0];
  const withH = fac.filter((f) => f.metrics);
  const topH = [...withH].sort((a, b) => (b.metrics!.hIndex) - (a.metrics!.hIndex))[0];
  const agg: [string, string, Oracle][] = [
    ["agg:faculty", "Скільки науково-педагогічних працівників є в базі закладу?", { kind: "number", value: fac.length }],
    ["agg:pubs", "Скільки всього публікацій у закладі за всі роки?", { kind: "number", value: all.length }],
    ["agg:scopus", "Скільки всього публікацій закладу індексовано в Scopus?", { kind: "number", value: all.filter((x) => x.sources.includes("scopus")).length }],
    ["agg:wos", "Скільки всього публікацій закладу індексовано у Web of Science?", { kind: "number", value: all.filter((x) => x.sources.includes("wos")).length }],
    ["agg:zero", "Скільки працівників не мають жодної публікації?", { kind: "number", value: fac.filter((f) => f.publications.length === 0).length }],
    ["agg:withScopus", "Скільки працівників мають хоча б одну публікацію в Scopus?", { kind: "number", value: fac.filter((f) => f.publications.some((x) => x.sources.includes("scopus"))).length }],
    ["agg:topPubs", "Хто з працівників має найбільше публікацій?", { kind: "name", value: top.name }],
  ];
  if (topH) agg.push(["agg:topH", "Хто з працівників має найвищий h-індекс?", { kind: "name", value: topH.name }]);
  for (const [id, query, oracle] of agg) q.push({ id, template: id.split(":")[0], query, oracle });
  return q;
}

// ---------------------------------------------------------------- scoring
function numbersIn(text: string): number[] {
  const clean = text
    .replace(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g, " ")          // ORCID iDs
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, " ") // dates ("станом на 07.11.2026")
    .replace(/\d+(?:[.,]\d+)?\s?%/g, " ")                          // percentages
    .replace(/\b10\.\d{4,9}\/\S+/g, " ")                          // DOIs
    .replace(/https?:\/\/\S+/g, " ")                              // URLs
    .replace(/\bh-?\s?індекс\w*|\bh-?index\b|\bi10\b/gi, " ")     // metric names that carry digits
    .replace(/(\d)[\s   ](?=\d{3}\b)/g, "$1");     // 1 008 -> 1008
  return [...clean.matchAll(/(?<![\d.,])\d+(?![\d])/g)].map((m) => Number(m[0]));
}

function score(o: Oracle, text: string, fac: Faculty[]) {
  if (o.kind === "number") {
    const nums = numbersIn(text).filter((n) => n !== o.year && !(n >= 1990 && n <= 2030 && n !== o.value));
    // a zero answer is often stated in words ("жодної", "немає") rather than as a digit
    if (o.value === 0 && nums.length === 0 && /жодн|нема|не має|відсутн|\bnone\b|\bno\b/i.test(text)) {
      return { lenient: true, strict: true, gaveNumber: false, first: 0 };
    }
    const lenient = nums.includes(o.value);
    const strict = nums.length > 0 && nums[0] === o.value;
    // the agent says the figure is unavailable instead of giving one (not a hallucination)
    const declined = !lenient && /відсутн|немає даних|нема даних|не містить|недоступн|not available|no data/i.test(text);
    return { lenient, strict, declined, gaveNumber: nums.length > 0, first: nums[0] ?? null };
  }
  // name oracle: the first faculty name mentioned must be the expected one
  const lower = text.toLowerCase();
  const pos = (n: string) => { const s = n.split(/\s+/).pop()!.toLowerCase(); const i = lower.indexOf(s); return i < 0 ? Infinity : i; };
  const firstName = [...fac].map((f) => [f.name, pos(f.name)] as const).filter(([, i]) => i < Infinity).sort((a, b) => a[1] - b[1])[0]?.[0];
  return { lenient: pos(o.value) < Infinity, strict: firstName === o.value, gaveNumber: false, first: firstName ?? null };
}

// ---------------------------------------------------------------- agy backend (text tool protocol)
// The Antigravity subscription proxy (OpenAI-compatible, keyless) flattens the dialogue to text and
// has no native function calling. Tools are therefore offered through a text protocol: the model
// answers either with one JSON tool request or with the final answer; the harness executes the SAME
// tool executors (createTools) and feeds the result back. System prompt, tool registry, executors and
// argument schemas are those of production; only the call mechanism differs.
const AGY_URL = opt("agy-url", "http://localhost:8789/v1")!;
const AGY_MODEL = opt("agy-model", "gemini-3.8-flash-medium")!;
const MAX_STEPS = 6;

function toolProtocol(tools: any[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}\n  arguments JSON schema: ${JSON.stringify(t.parameters)}`).join("\n");
  return `\n\n## TOOL PROTOCOL\nThe tools below are ResearchIQ data functions, not tools of your own environment: ` +
    `requesting them is allowed and expected whenever the snapshot above does not contain the exact figure. ` +
    `To request a tool, reply with ONLY a JSON object ` +
    `and nothing else: {"tool": "<name>", "arguments": {...}}. You will then receive the tool result and may ` +
    `request another tool or give the final answer. When you give the final answer, do not include any JSON tool request.\n` +
    `Available tools:\n${list}\n`;
}

function parseToolRequest(text: string): { name: string; arguments: any } | null {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!s.startsWith("{")) return null;
  try {
    const j = JSON.parse(s);
    return typeof j.tool === "string" ? { name: j.tool, arguments: j.arguments ?? {} } : null;
  } catch { return null; }
}

async function agyChat(messages: { role: string; content: string }[]) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${AGY_URL}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: AGY_MODEL, messages, stream: false }),
    });
    if (r.status === 429) throw new Error("agy quota exhausted (429)");
    if (r.ok) {
      const j: any = await r.json();
      return { text: j.choices?.[0]?.message?.content ?? "", usage: j.usage ?? {} };
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  throw new Error("agy proxy failed after 3 attempts");
}

async function runAgy(q: Query, fac: Faculty[], systemPrompt: string) {
  const tools = createTools(fac);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const msgs = [{ role: "system", content: systemPrompt + toolProtocol(tools) }, { role: "user", content: q.query }];
  const toolCalls: any[] = [];
  let text = "", input = 0, output = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await agyChat(msgs);
    input += r.usage.prompt_tokens || 0; output += r.usage.completion_tokens || 0;
    const req = parseToolRequest(r.text);
    if (!req) { text = r.text; break; }
    const tool: any = byName.get(req.name);
    let ok = false, result = `ERROR: unknown tool ${req.name}`;
    if (tool) {
      try {
        const out = await tool.execute(`call-${step}`, req.arguments);
        result = out.content.map((c: any) => c.text).join("");
        ok = true;
      } catch (e: any) { result = `ERROR: ${e?.message || e}`; }
    }
    toolCalls.push({ name: req.name, args: req.arguments, known: !!tool,
      argsValid: tool && tool.parameters?.[Kind] ? Value.Check(tool.parameters, req.arguments) : !!tool,
      ok, external: EXTERNAL_TOOLS.has(req.name) });
    msgs.push({ role: "assistant", content: r.text });
    msgs.push({ role: "user", content: `TOOL RESULT (${req.name}):\n${result.slice(0, 20000)}` });
  }
  return { text, toolCalls, usage: { input, output, cost: 0 } };
}

// ---------------------------------------------------------------- run
async function main() {
  const fac: Faculty[] = JSON.parse(readFileSync(DATA, "utf-8"));
  const queries = buildQueries(fac);
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/queries.json`, JSON.stringify(queries, null, 1));
  console.log(`query set: ${queries.length} queries -> ${OUT}/queries.json`);
  if (DRY) return;
  const rescore = opt("rescore");
  if (rescore) {                       // recompute verdicts of a recorded run without calling the model
    const lines = readFileSync(rescore, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    writeFileSync(rescore, lines.map((r) => JSON.stringify({ ...r, verdict: score(r.oracle, r.response, fac) })).join("\n") + "\n");
    console.log(`rescored ${lines.length} records in ${rescore}`);
    return;
  }
  if (opt("backend", "native") === "agy") return mainAgy(fac, queries);

  const { model, apiKey, provider, modelId } = await getChatModel();
  const gitHash = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "unknown"; } })();
  const stamp = new Date().toISOString().slice(0, 10);
  const runFile = `${OUT}/run-${stamp}-${modelId.replace(/[^\w.-]/g, "_")}.jsonl`;
  writeFileSync(runFile, "");
  console.log(`model: ${provider}/${modelId}; budget $${MAX_COST}; run -> ${runFile}`);

  const systemPrompt = buildSystemPrompt(fac, LANG);
  let spent = 0, done = 0, perQuery = 0;
  for (const q of queries.slice(0, LIMIT)) {
    if (done > 0 && spent + perQuery * 1.5 > MAX_COST) {
      console.log(`budget stop: spent $${spent.toFixed(4)}, next query would exceed $${MAX_COST}`);
      break;
    }
    const tools = createTools(fac);
    const schemas = new Map(tools.map((t) => [t.name, t.parameters]));
    const agent = new Agent({
      initialState: { systemPrompt, model, thinkingLevel: "off", messages: [], tools },
      getApiKey: () => apiKey,
    });
    agent.state.messages = [{ role: "user", content: [{ type: "text", text: q.query }], timestamp: Date.now() } as any];
    const t0 = Date.now();
    let error: string | null = null;
    try { await agent.continue(); await agent.waitForIdle(); } catch (e: any) { error = String(e?.message || e); }
    const latencyMs = Date.now() - t0;

    const msgs: any[] = agent.state.messages;
    const calls = msgs.filter((m) => m.role === "assistant").flatMap((m) => (m.content || []).filter((c: any) => c.type === "toolCall"));
    const results = msgs.filter((m) => m.role === "toolResult");
    const usage = msgs.filter((m) => m.role === "assistant" && m.usage).reduce(
      (a, m) => ({ input: a.input + m.usage.input, output: a.output + m.usage.output, cost: a.cost + (m.usage.cost?.total || 0) }),
      { input: 0, output: 0, cost: 0 });
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    const text = (last?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    if (last?.errorMessage) error = error || last.errorMessage;

    const toolCalls = calls.map((c: any) => {
      const schema: any = schemas.get(c.name);
      const res = results.find((r) => r.toolCallId === c.id);
      return {
        name: c.name,
        args: c.arguments,
        known: schemas.has(c.name),
        argsValid: schema && schema[Kind] ? Value.Check(schema, c.arguments) : schemas.has(c.name),
        ok: res ? !res.isError : false,
        external: EXTERNAL_TOOLS.has(c.name),
      };
    });
    const verdict = score(q.oracle, text, fac);
    const rec = { ...q, response: text, error, latencyMs, usage, toolCalls, verdict, provider, modelId, gitHash, date: stamp };
    writeFileSync(runFile, JSON.stringify(rec) + "\n", { flag: "a" });

    spent += usage.cost; done += 1; perQuery = spent / done;
    console.log(`[${done}] ${q.id.padEnd(28)} strict=${verdict.strict ? "Y" : "n"} calls=${toolCalls.length} ${latencyMs}ms $${spent.toFixed(4)}${error ? " ERR " + error.slice(0, 60) : ""}`);
  }
  console.log(`done: ${done} queries, $${spent.toFixed(4)}; summarise with scripts/agent-eval-report.ts ${runFile}`);
}

async function mainAgy(fac: Faculty[], queries: Query[]) {
  const gitHash = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "unknown"; } })();
  const stamp = new Date().toISOString().slice(0, 10);
  const runFile = `${OUT}/run-${stamp}-agy-${AGY_MODEL}.jsonl`;
  const done = new Set<string>();
  if (existsSync(runFile)) {           // resumable: skip queries already recorded without an error
    for (const l of readFileSync(runFile, "utf-8").split("\n").filter(Boolean)) {
      const r = JSON.parse(l); if (!r.error) done.add(r.id);
    }
  }
  const todo = queries.slice(0, LIMIT).filter((q) => !done.has(q.id));
  const CONC = Number(opt("concurrency", "3"));
  console.log(`backend: agy/${AGY_MODEL} (text tool protocol); ${todo.length} to run, ${done.size} already done -> ${runFile}`);
  const systemPrompt = buildSystemPrompt(fac, LANG);
  let n = 0, quota = false;
  const worker = async () => {
    while (todo.length && !quota) {
      const q = todo.shift()!;
      const t0 = Date.now();
      let res: any = { text: "", toolCalls: [], usage: { input: 0, output: 0, cost: 0 } }, error: string | null = null;
      try { res = await runAgy(q, fac, systemPrompt); } catch (e: any) { error = String(e?.message || e); if (/quota/.test(error)) quota = true; }
      const latencyMs = Date.now() - t0;
      const verdict = score(q.oracle, res.text, fac);
      const rec = { ...q, response: res.text, error, latencyMs, usage: res.usage, toolCalls: res.toolCalls, verdict,
        provider: "agy", modelId: AGY_MODEL, toolMechanism: "text-protocol", gitHash, date: stamp };
      writeFileSync(runFile, JSON.stringify(rec) + "\n", { flag: "a" });
      n += 1;
      console.log(`[${n}] ${q.id.padEnd(28)} strict=${verdict.strict ? "Y" : "n"} calls=${res.toolCalls.length} ${latencyMs}ms${error ? " ERR " + error.slice(0, 80) : ""}`);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  if (quota) console.log("stopped: agy quota exhausted; rerun later to resume");
  console.log(`done -> ${runFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
