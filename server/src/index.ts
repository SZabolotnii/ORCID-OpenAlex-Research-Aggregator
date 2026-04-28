import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Agent } from "@mariozechner/pi-agent-core";
import { buildSystemPrompt, createTools } from "./agent.js";
import { getChatModel, getResolvedLlmSummary } from "./llmProvider.js";
import { generateReport, fillTemplate } from "./reportService.js";
import { searchScopusForAuthor, ScopusConfigError, ScopusUpstreamError } from "./scopusService.js";
import type { ChatRequest, Faculty, TenantConfig, TenantRole } from "./types.js";

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

const AUTH_SECRET =
  process.env.AUTH_TOKEN_SECRET || process.env.GEMINI_API_KEY || "researchiq-dev-secret";
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

type AuthContext = {
  tenantId: string;
  role: TenantRole;
  exp: number;
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signAuthToken(tenantId: string, role: TenantRole): string {
  const payload: AuthContext = {
    tenantId,
    role,
    exp: Date.now() + AUTH_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token: string): AuthContext | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) return null;
  if (
    !timingSafeEqual(
      Buffer.from(signature, "utf-8"),
      Buffer.from(expectedSignature, "utf-8")
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AuthContext;
    if (!payload.tenantId || !payload.role || !payload.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthContext(req: express.Request): AuthContext | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAuthToken(header.slice("Bearer ".length));
}

function hasTenantReadAccess(
  tenant: TenantConfig,
  auth: AuthContext | null,
  tenantId: string
): boolean {
  if (tenant.public) return true;
  return !!auth && auth.tenantId === tenantId && (auth.role === "viewer" || auth.role === "admin");
}

function hasTenantAdminAccess(auth: AuthContext | null, tenantId: string): boolean {
  return !!auth && auth.tenantId === tenantId && auth.role === "admin";
}

function requireTenant(req: express.Request, res: express.Response, tenantId: string): TenantConfig | null {
  const tenant = getTenant(tenantId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return null;
  }
  return tenant;
}

// --- Express app ---

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first hop (Caddy) so req.ip resolves to the real client address
// for express-rate-limit. Without this, the limiter sees Caddy's IP for every
// request and ERR_ERL_UNEXPECTED_X_FORWARDED_FOR is thrown.
app.set("trust proxy", 1);

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
    res.json({ role: "admin", token: signAuthToken(tenant.id, "admin") });
    return;
  }
  if (tenant.viewPasswordHash && safeCompareHashes(hash, tenant.viewPasswordHash)) {
    res.json({ role: "viewer", token: signAuthToken(tenant.id, "viewer") });
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

  if (!adminPassword && viewPassword === undefined) {
    res.status(400).json({ error: "No password changes provided" });
    return;
  }

  if (tenant.adminPasswordHash) {
    const auth = getAuthContext(req);
    if (!hasTenantAdminAccess(auth, tenant.id)) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    if (!currentAdminPassword) {
      res.status(400).json({ error: "Current admin password required" });
      return;
    }
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
    const tenantId = sanitizeTenantId(req.params.tenantId);
    const tenant = requireTenant(req, res, tenantId);
    if (!tenant) return;

    const auth = getAuthContext(req);
    if (!hasTenantReadAccess(tenant, auth, tenantId)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    res.json(loadTenantData(tenantId));
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

  const auth = getAuthContext(req);
  if (!hasTenantAdminAccess(auth, req.params.tenantId)) {
    res.status(401).json({ error: "Admin authentication required" });
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
    const tenant = getTenant("default");
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    const auth = getAuthContext(_req);
    if (!hasTenantReadAccess(tenant, auth, "default")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json(loadTenantData("default"));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/data", (req, res) => {
  const auth = getAuthContext(req);
  if (!hasTenantAdminAccess(auth, "default")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
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
  const { tenantId, type, department, facultyId, lang, templateContent, fileType, additionalInstructions } = req.body;

  if (!tenantId) {
    res.status(400).json({ error: "Missing tenantId" });
    return;
  }

  const tenant = getTenant(tenantId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const auth = getAuthContext(req);
  if (!hasTenantReadAccess(tenant, auth, tenantId)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const facultyList = loadTenantData(tenantId);

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
        facultyId || "All"
      );
    } else {
      result = await generateReport(
        facultyList,
        type || "general",
        department || "All",
        facultyId || "All",
        lang || "ua"
      );
    }
    const llm = await getResolvedLlmSummary();
    res.json({ content: result, provider: llm.provider, modelId: llm.modelId });
  } catch (error: any) {
    console.error("Report endpoint error:", error);
    res.status(500).json({ error: error.message || "Report generation failed" });
  }
});

// --- External enrichment proxies ---

const scopusLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many Scopus requests. Please wait." },
});

app.post("/api/enrichment/scopus", scopusLimiter, async (req, res) => {
  const { tenantId, orcidId, scopusAuthorId } = req.body ?? {};

  if (!tenantId || typeof tenantId !== "string") {
    res.status(400).json({ error: "Missing tenantId" });
    return;
  }
  if (!orcidId || typeof orcidId !== "string" || !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
    res.status(400).json({ error: "Invalid orcidId" });
    return;
  }
  let normalizedScopusAuthorId: string | undefined;
  if (scopusAuthorId !== undefined && scopusAuthorId !== null && scopusAuthorId !== "") {
    if (typeof scopusAuthorId !== "string" || !/^\d{6,15}$/.test(scopusAuthorId.trim())) {
      res.status(400).json({ error: "Invalid scopusAuthorId" });
      return;
    }
    normalizedScopusAuthorId = scopusAuthorId.trim();
  }

  try {
    sanitizeTenantId(tenantId);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  const tenant = requireTenant(req, res, tenantId);
  if (!tenant) return;

  const auth = getAuthContext(req);
  if (!hasTenantAdminAccess(auth, tenantId)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  try {
    const publications = await searchScopusForAuthor(orcidId, normalizedScopusAuthorId);
    res.json({ status: "ok", publications });
  } catch (error: any) {
    if (error instanceof ScopusConfigError) {
      res.status(503).json({ error: "Scopus integration not configured" });
      return;
    }
    if (error instanceof ScopusUpstreamError) {
      console.error("[scopus] upstream error:", error.message);
      res.status(502).json({ error: "Scopus upstream error", details: error.message });
      return;
    }
    console.error("[scopus] unexpected error:", error);
    res.status(500).json({ error: error?.message || "Scopus request failed" });
  }
});

// --- AI Chat ---

app.post("/api/chat", chatLimiter, async (req, res) => {
  const { tenantId, query, history, lang } = req.body as ChatRequest;

  if (!query || !tenantId) {
    res.status(400).json({ error: "Missing query or tenantId" });
    return;
  }

  try {
    const tenant = getTenant(tenantId);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const auth = getAuthContext(req);
    if (!hasTenantReadAccess(tenant, auth, tenantId)) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const facultyList = loadTenantData(tenantId);

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

    const { model, apiKey, provider, modelId } = await getChatModel();
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

    res.json({
      response: responseText || "No response generated.",
      provider,
      modelId,
    });
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
