/**
 * Summarise an agent-eval run (JSONL from scripts/agent-eval.ts) into docs/agent-eval-report.md.
 *
 * Usage (from server/):  npx tsx scripts/agent-eval-report.ts ../docs/agent-eval/run-<...>.jsonl [--out ../docs/agent-eval-report.md]
 *
 * Metrics follow the protocol announced in the ITLT article (section 5, prospects):
 *   - tool-call success rate (tool executed without error),
 *   - argument validity against the declared TypeBox schema,
 *   - share of answers whose figure contradicts the snapshot (operational hallucination: a number
 *     was given and it is not the deterministic reference value),
 *   - accuracy of numeric answers (strict: the first reported figure equals the reference;
 *     lenient: the reference figure appears in the answer),
 *   - latency.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const argv = process.argv.slice(2);
const file = argv.find((a) => a.endsWith(".jsonl"));
if (!file) { console.error("usage: agent-eval-report.ts <run.jsonl> [--out file]"); process.exit(1); }
const oi = argv.indexOf("--out");
const OUT = oi >= 0 ? argv[oi + 1] : "../docs/agent-eval-report.md";

const rows = readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = rows.filter((r) => !r.error);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)} %` : "—");
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const p90 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.9)] : 0; };

// manual adjudication of every strict-score disagreement (docs/agent-eval/adjudication-<run>.json)
const adjFile = file.replace(/run-([^/]+)\.jsonl$/, "adjudication-$1.json");
const adj: Record<string, { verdict: string; note: string }> = existsSync(adjFile)
  ? Object.fromEntries(Object.entries(JSON.parse(readFileSync(adjFile, "utf-8"))).filter(([k]) => !k.startsWith("_"))) as any
  : {};
const unreviewed = ok.filter((r) => !r.verdict.strict && !adj[r.id]).length;
const verified = (r: any) => (adj[r.id] ? adj[r.id].verdict === "correct" : r.verdict.strict);
for (const r of ok) r.verdict.verified = verified(r);

const calls = ok.flatMap((r) => r.toolCalls);
// operational hallucination: a figure is stated and it is not the reference value (after manual review)
const halluc = (r: any) => !r.verdict.verified && !r.verdict.declined && (r.verdict.gaveNumber || r.oracle.kind === "name");
const templates = [...new Set(ok.map((r) => r.template))];

const byTemplate = templates.map((t) => {
  const g = ok.filter((r) => r.template === t);
  return `| ${t} | ${g.length} | ${pct(g.filter((r) => r.verdict.verified).length, g.length)} | ${pct(g.filter((r) => r.verdict.strict).length, g.length)} | ${pct(g.filter((r) => r.verdict.declined).length, g.length)} | ${pct(g.filter(halluc).length, g.length)} | ${pct(g.filter((r) => r.toolCalls.length > 0).length, g.length)} |`;
}).join("\n");

const toolNames = [...new Set(calls.map((c: any) => c.name))].sort();
const byTool = toolNames.map((n) => {
  const g = calls.filter((c: any) => c.name === n);
  return `| \`${n}\` | ${g.length} | ${pct(g.filter((c: any) => c.ok).length, g.length)} | ${pct(g.filter((c: any) => c.argsValid).length, g.length)} |`;
}).join("\n");

const lat = ok.map((r) => r.latencyMs / 1000);
const r0 = rows[0] || {};
const md = `# Оцінювання агентного шару ResearchIQ — попередній технічний прогін

> **Статус:** попередній технічний прогін на знімку даних **одного закладу**, а не валідація.
> Результати не входять до статті ІТЗН № 6755 і не є підставою для висновку про практичну перевагу
> агентного шару; вони ілюструють, що заявлений у статті протокол оцінювання виконуваний.

## Конфігурація

| Параметр | Значення |
|---|---|
| Дата прогону | ${r0.date} |
| Коміт коду | \`${r0.gitHash}\` |
| Модель | ${r0.provider}/${r0.modelId} |
| Механізм виклику інструментів | ${r0.toolMechanism === "text-protocol" ? "текстовий протокол (JSON-запит інструмента), див. «Обмеження»" : "нативний виклик функцій провайдера (pi-agent-core)"} |
| Системний промпт, реєстр інструментів, виконавці | ті самі, що в \`POST /api/chat\` (\`server/src/agent.ts\`, \`server/src/tools.ts\`) |
| Дані | \`csbc_faculty_data.json\`: 35 НПП, 1008 записів (публічні профілі ORCID) |
| Запити | ${rows.length} (${ok.length} виконано без помилки транспорту); набір і еталони — \`docs/agent-eval/queries.json\` |

Еталонні відповіді обчислюються детерміновано зі знімка (\`buildQueries\` у \`server/scripts/agent-eval.ts\`);
імена в запитах обрано з усіх НПП, що мають публікації, рік — генератором із фіксованим початковим значенням.

## Підсумкові показники

| Показник | Значення |
|---|---|
| **Точність відповіді після ручної перевірки розбіжностей** | **${pct(ok.filter((r) => r.verdict.verified).length, ok.length)}** (${ok.filter((r) => r.verdict.verified).length} з ${ok.length}) |
| Точність, автоматична строга оцінка (перше назване значення = еталон) | ${pct(ok.filter((r) => r.verdict.strict).length, ok.length)} |
| Відмова з поясненням «даних немає» | ${pct(ok.filter((r) => r.verdict.declined).length, ok.length)} |
| **Операційна галюцинація** (назване значення не збігається з еталоном) | **${pct(ok.filter(halluc).length, ok.length)}** (${ok.filter(halluc).length} з ${ok.length}) |
| Розбіжностей без ручної перевірки | ${unreviewed} |
| Запитів із викликом інструментів | ${pct(ok.filter((r) => r.toolCalls.length > 0).length, ok.length)} |
| Викликів інструментів усього | ${calls.length} |
| Успішних викликів (без помилки виконавця) | ${pct(calls.filter((c: any) => c.ok).length, calls.length)} |
| Аргументи відповідають оголошеній схемі | ${pct(calls.filter((c: any) => c.argsValid).length, calls.length)} |
| Виклики невідомих інструментів | ${calls.filter((c: any) => !c.known).length} |
| Виклики зовнішніх (мережевих) інструментів | ${calls.filter((c: any) => c.external).length} |
| Час відповіді: медіана / 90-й процентиль | ${median(lat).toFixed(1)} с / ${p90(lat).toFixed(1)} с |
| Помилки транспорту | ${rows.length - ok.length} |

## За типами запитів

| Тип | n | Після перевірки | Строга автоматична | Відмова | Галюцинація | З інструментом |
|---|---|---|---|---|---|---|
${byTemplate}

## Ручна перевірка розбіжностей

Кожну відповідь, де автоматична строга оцінка не збіглася з еталоном, переглянуто вручну
(\`${adjFile.split("/").pop()}\`):

| Запит | Вердикт | Пояснення |
|---|---|---|
${Object.entries(adj).map(([id, a]) => `| \`${id}\` | ${a.verdict === "correct" ? "правильно" : "**хибно**"} | ${a.note} |`).join("\n") || "| — | — | — |"}

## За інструментами

| Інструмент | Викликів | Успішних | Аргументи за схемою |
|---|---|---|---|
${byTool || "| — | 0 | — | — |"}

## Обмеження

1. **Один заклад, 35 НПП.** Більшість відповідей можна отримати безпосередньо зі знімка в системному
   промпті; інструменти потрібні переважно для запитів про окремий рік поза останніми п'ятьма роками.
2. **Шаблонні запити.** Набір перевіряє фактологічні наукометричні запити з однозначним еталоном;
   аналітичні й пояснювальні відповіді керівникові він не оцінює.
3. **Автоматичне оцінювання.** Строга оцінка — евристика видобування першого числа з тексту. Вручну
   переглянуто лише відповіді, де вона розійшлася з еталоном; відповіді, які вона визнала правильними,
   вручну не перевірялися.
${r0.toolMechanism === "text-protocol" ? `4. **Механізм виклику.** Прогін виконано через проксі підписки Antigravity, який не підтримує нативного
   виклику функцій. Інструменти подано моделі текстовим протоколом (відповідь — один JSON-запит
   інструмента), а каркас виконує ті самі детерміновані виконавці. Оцінено ланку «модель + реєстр +
   виконавці», а не нативний механізм function calling, який використовує продакшен; повторний прогін
   із \`--backend native\` потребує робочого ключа провайдера.
` : ""}
## Відтворення

\`\`\`bash
cd server
npx tsx --env-file=.env scripts/agent-eval.ts --dry-run                 # лише набір запитів
npx tsx --env-file=.env scripts/agent-eval.ts --max-cost 1.00           # нативний виклик функцій (Gemini/OpenRouter)
npx tsx --env-file=.env scripts/agent-eval.ts --backend agy             # проксі Antigravity, текстовий протокол
npx tsx scripts/agent-eval-report.ts ../docs/agent-eval/run-<дата>-<модель>.jsonl
\`\`\`
`;
writeFileSync(OUT, md);
console.log(`written ${OUT}`);
