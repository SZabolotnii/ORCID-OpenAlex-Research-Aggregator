import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createHash, timingSafeEqual } from "crypto";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { buildSystemPrompt, createTools } from "./agent.js";
import { generateReport, fillTemplate } from "./reportService.js";
import type { ChatRequest, Faculty, TenantConfig } from "./types.js";

const DATA_DIR = process.env.DATA_DIR || "/opt/orcid-tracker-api/data";
const TENANTS_FILE = `${DATA_DIR}/tenants.json`;

// Ensure data dir exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// --- Tenant helpers ---

function loadTenants(): TenantConfig[] {
  if (!existsSync(TENANTS_FILE)) return [];
  return JSON.parse(readFileSync(TENANTS_FILE, "utf-8"));
}

function saveTenants(tenants: TenantConfig[]) {
  writeFileSync(TENANTS_FILE, JSON.stringify(tenants, null, 2), "utf-8");
}

function getTenant(id: string): TenantConfig | undefined {
  return loadTenants().find((t) => t.id === id);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function safeCompareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function sanitizeTenantId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
    throw new Error("Invalid tenantId");
  }
  return id;
}

function tenantDataPath(tenantId: string): string {
  return `${DATA_DIR}/${sanitizeTenantId(tenantId)}.json`;
}

function loadTenantData(tenantId: string): Faculty[] {
  const path = tenantDataPath(tenantId);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

// --- Express app ---

const app = express();
const PORT = process.env.PORT || 3001;

// Allow requests from the production domain, any subdomains, and localhost for dev
const allowedOrigins = /^(https?:\/\/localhost(:\d+)?|https?:\/\/.*\.szabolotnii\.site)$/;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "10mb" }));

// Rate limiters
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait." },
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Please wait." },
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Tenant Management ---

app.get("/api/tenants", (_req, res) => {
  const tenants = loadTenants().map((t) => ({
    id: t.id,
    subdomain: t.subdomain,
    name: t.name,
    public: t.public,
  }));
  res.json(tenants);
});

app.get("/api/tenant/:id/config", (req, res) => {
  const tenant = getTenant(req.params.id);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json({
    id: tenant.id,
    subdomain: tenant.subdomain,
    name: tenant.name,
    public: tenant.public,
    hasAdminPassword: !!tenant.adminPasswordHash,
    hasViewPassword: !!tenant.viewPasswordHash,
  });
});

app.post("/api/tenant/:id/verify", authLimiter, (req, res) => {
  const tenant = getTenant(req.params.id as string);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }

  const hash = sha256(password);

  if (tenant.adminPasswordHash && safeCompareHashes(hash, tenant.adminPasswordHash)) {
    res.json({ role: "admin" });
    return;
  }
  if (tenant.viewPasswordHash && safeCompareHashes(hash, tenant.viewPasswordHash)) {
    res.json({ role: "viewer" });
    return;
  }

  res.json({ role: "denied" });
});

app.post("/api/tenant/:id/set-password", (req, res) => {
  const { adminPassword, viewPassword, currentAdminPassword } = req.body;
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.id === req.params.id);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  // If admin password already set, require current password
  if (tenant.adminPasswordHash && currentAdminPassword) {
    if (!safeCompareHashes(sha256(currentAdminPassword), tenant.adminPasswordHash)) {
      res.status(403).json({ error: "Wrong current admin password" });
      return;
    }
  }

  if (adminPassword) tenant.adminPasswordHash = sha256(adminPassword);
  if (viewPassword !== undefined) {
    tenant.viewPasswordHash = viewPassword ? sha256(viewPassword) : undefined;
  }

  saveTenants(tenants);
  res.json({ status: "ok" });
});

// --- Faculty Data (per-tenant) ---

app.get("/api/data/:tenantId", (req, res) => {
  try {
    res.json(loadTenantData(req.params.tenantId));
  } catch (e: any) {
    const status = e.message === "Invalid tenantId" ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

app.post("/api/data/:tenantId", (req, res) => {
  try {
    sanitizeTenantId(req.params.tenantId);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  const facultyList = req.body as Faculty[];
  if (!Array.isArray(facultyList)) {
    res.status(400).json({ error: "Expected an array of faculty" });
    return;
  }

  // Auto-create tenant only if tenantId already exists in registry
  // (prevents arbitrary tenant creation by anyone)
  const tenants = loadTenants();
  if (!tenants.find((t) => t.id === req.params.tenantId)) {
    res.status(403).json({ error: "Tenant not found. Create tenant via admin interface." });
    return;
  }

  try {
    writeFileSync(
      tenantDataPath(req.params.tenantId),
      JSON.stringify(facultyList, null, 2),
      "utf-8"
    );
    res.json({ status: "ok", count: facultyList.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Backward compat: /api/data without tenantId → "default"
app.get("/api/data", (_req, res) => {
  try {
    res.json(loadTenantData("default"));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/data", (req, res) => {
  const facultyList = req.body as Faculty[];
  if (!Array.isArray(facultyList)) {
    res.status(400).json({ error: "Expected an array of faculty" });
    return;
  }
  try {
    writeFileSync(
      tenantDataPath("default"),
      JSON.stringify(facultyList, null, 2),
      "utf-8"
    );
    res.json({ status: "ok", count: facultyList.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Report Generation ---

const reportLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many report requests. Please wait." },
});

app.post("/api/reports/generate", reportLimiter, async (req, res) => {
  const { facultyList, type, department, facultyId, lang, templateContent, fileType, additionalInstructions } = req.body;

  if (!facultyList || !Array.isArray(facultyList)) {
    res.status(400).json({ error: "Missing or invalid facultyList" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
    return;
  }

  try {
    let result: string;
    if (templateContent) {
      result = await fillTemplate(
        facultyList,
        templateContent,
        fileType || "text",
        lang || "ua",
        additionalInstructions || "",
        department || "All",
        facultyId || "All",
        apiKey
      );
    } else {
      result = await generateReport(
        facultyList,
        type || "general",
        department || "All",
        facultyId || "All",
        lang || "ua",
        apiKey
      );
    }
    res.json({ content: result });
  } catch (error: any) {
    console.error("Report endpoint error:", error);
    res.status(500).json({ error: error.message || "Report generation failed" });
  }
});

// --- AI Chat ---

app.post("/api/chat", chatLimiter, async (req, res) => {
  const { query, facultyList, history, lang } = req.body as ChatRequest;

  if (!query || !facultyList) {
    res.status(400).json({ error: "Missing query or facultyList" });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      return;
    }

    const systemPrompt = buildSystemPrompt(facultyList, lang || "ua");
    const tools = createTools(facultyList);

    const messages: any[] = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.id === "welcome") continue;
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: [{ type: "text", text: msg.content }],
        });
      }
    }
    messages.push({ role: "user", content: [{ type: "text", text: query }] });

    const model = getModel("google", "gemini-2.5-flash");
    const agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        thinkingLevel: "off",
        messages: [],
        tools,
      },
      getApiKey: () => apiKey,
    });

    agent.state.messages = messages;
    await agent.continue();
    await agent.waitForIdle();

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((m: any) => m.role === "assistant");

    let responseText = "";
    if (lastAssistant?.content) {
      for (const part of lastAssistant.content as any[]) {
        if (part.type === "text") responseText += part.text;
      }
    }

    res.json({ response: responseText || "No response generated." });
  } catch (error: any) {
    console.error("Agent error:", error);
    res.status(500).json({
      error:
        lang === "ua"
          ? "Помилка агента. Спробуйте пізніше."
          : "Agent error. Please try again.",
      details: error.message,
    });
  }
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`ResearchIQ Agent Server running on 0.0.0.0:${PORT}`);
});
