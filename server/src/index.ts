import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { buildSystemPrompt, createTools } from "./agent.js";
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

function tenantDataPath(tenantId: string): string {
  return `${DATA_DIR}/${tenantId}.json`;
}

function loadTenantData(tenantId: string): Faculty[] {
  const path = tenantDataPath(tenantId);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

// --- Express app ---

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

app.post("/api/tenant/:id/verify", (req, res) => {
  const tenant = getTenant(req.params.id);
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

  if (tenant.adminPasswordHash && hash === tenant.adminPasswordHash) {
    res.json({ role: "admin" });
    return;
  }
  if (tenant.viewPasswordHash && hash === tenant.viewPasswordHash) {
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
    if (sha256(currentAdminPassword) !== tenant.adminPasswordHash) {
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
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/data/:tenantId", (req, res) => {
  const facultyList = req.body as Faculty[];
  if (!Array.isArray(facultyList)) {
    res.status(400).json({ error: "Expected an array of faculty" });
    return;
  }

  // Auto-create tenant if it doesn't exist
  const tenants = loadTenants();
  if (!tenants.find((t) => t.id === req.params.tenantId)) {
    tenants.push({
      id: req.params.tenantId,
      subdomain: req.params.tenantId,
      name: req.params.tenantId,
      public: true,
      adminPasswordHash: "",
    });
    saveTenants(tenants);
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

// --- AI Chat ---

app.post("/api/chat", async (req, res) => {
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
