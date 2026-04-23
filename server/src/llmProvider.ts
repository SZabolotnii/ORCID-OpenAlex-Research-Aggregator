import { GoogleGenAI } from "@google/genai";
import { getModel, getModels, type Model } from "@mariozechner/pi-ai";

export type LlmProviderId = "gemini" | "openrouter";

type ResolvedLlmConfig = {
  provider: LlmProviderId;
  apiKey: string;
  modelId: string;
};

type LlmUseCase = "chat" | "report";

type OpenRouterDiscoveryResult = {
  primaryId?: string;
  fallbackId?: string;
};

type GenerateTextOptions = {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
};

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_DISCOVERY_URL = "https://shir-man.com/api/free-llm/top-models";
const DEFAULT_DISCOVERY_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 4000;
const DEFAULT_OPENROUTER_CONTEXT_WINDOW = 131072;
const DEFAULT_OPENROUTER_MAX_TOKENS = 8192;

let discoveryCache:
  | {
      expiresAt: number;
      result: OpenRouterDiscoveryResult;
    }
  | null = null;

function getConfiguredProvider(): string {
  return (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
}

function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function getOpenRouterBaseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL).replace(
    /\/+$/,
    ""
  );
}

function getDiscoveryUrl(): string {
  return process.env.OPENROUTER_DISCOVERY_URL?.trim() || DEFAULT_DISCOVERY_URL;
}

function isOpenRouterDiscoveryEnabled(): boolean {
  return (process.env.OPENROUTER_AUTO_DISCOVERY || "true").trim().toLowerCase() !== "false";
}

function getDiscoveryTtlMs(): number {
  const value = Number(process.env.OPENROUTER_DISCOVERY_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DISCOVERY_TTL_MS;
}

function getDiscoveryTimeoutMs(): number {
  const value = Number(process.env.OPENROUTER_DISCOVERY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DISCOVERY_TIMEOUT_MS;
}

function getOpenRouterHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();

  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  return Object.keys(headers).length > 0 ? headers : undefined;
}

async function fetchOpenRouterDiscovery(): Promise<OpenRouterDiscoveryResult> {
  if (!isOpenRouterDiscoveryEnabled()) {
    return {};
  }

  if (discoveryCache && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.result;
  }

  try {
    const response = await fetch(getDiscoveryUrl(), {
      signal: AbortSignal.timeout(getDiscoveryTimeoutMs()),
    });

    if (!response.ok) {
      throw new Error(`Discovery request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      models?: Array<{ id?: string }>;
      fallback?: { id?: string };
    };

    const result: OpenRouterDiscoveryResult = {
      primaryId: payload.models?.[0]?.id?.trim(),
      fallbackId: payload.fallback?.id?.trim(),
    };

    discoveryCache = {
      expiresAt: Date.now() + getDiscoveryTtlMs(),
      result,
    };

    return result;
  } catch (error) {
    console.warn("[llmProvider] OpenRouter discovery failed:", error);
    return {};
  }
}

async function getOpenRouterModelId(useCase: LlmUseCase): Promise<string> {
  const explicitModel =
    (useCase === "chat"
      ? process.env.OPENROUTER_CHAT_MODEL?.trim()
      : process.env.OPENROUTER_REPORT_MODEL?.trim()) ||
    process.env.OPENROUTER_MODEL?.trim();
  if (explicitModel) return explicitModel;

  const discovered = await fetchOpenRouterDiscovery();
  if (discovered.primaryId) return discovered.primaryId;
  if (discovered.fallbackId) return discovered.fallbackId;

  return DEFAULT_OPENROUTER_MODEL;
}

export async function resolveLlmConfig(useCase: LlmUseCase = "report"): Promise<ResolvedLlmConfig> {
  const configuredProvider = getConfiguredProvider();

  if (configuredProvider === "gemini") {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    return {
      provider: "gemini",
      apiKey,
      modelId: getGeminiModelId(),
    };
  }

  if (configuredProvider === "openrouter") {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    return {
        provider: "openrouter",
        apiKey,
        modelId: await getOpenRouterModelId(useCase),
      };
  }

  if (configuredProvider === "auto") {
    const openRouterKey = getOpenRouterApiKey();
    if (openRouterKey) {
      return {
        provider: "openrouter",
        apiKey: openRouterKey,
        modelId: await getOpenRouterModelId(useCase),
      };
    }

    const geminiKey = getGeminiApiKey();
    if (geminiKey) {
      return {
        provider: "gemini",
        apiKey: geminiKey,
        modelId: getGeminiModelId(),
      };
    }

    throw new Error(
      "No LLM provider is configured. Set LLM_PROVIDER=gemini|openrouter|auto with the matching API key."
    );
  }

  throw new Error(`Unsupported LLM_PROVIDER value: ${configuredProvider}`);
}

function buildCustomOpenRouterModel(modelId: string): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: getOpenRouterBaseUrl(),
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: DEFAULT_OPENROUTER_CONTEXT_WINDOW,
    maxTokens: DEFAULT_OPENROUTER_MAX_TOKENS,
    headers: getOpenRouterHeaders(),
  };
}

function getGeminiChatModel(modelId: string): Model<any> {
  if (modelId === DEFAULT_GEMINI_MODEL) {
    return getModel("google", "gemini-2.5-flash");
  }

  const model = getModels("google").find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Unsupported Gemini model: ${modelId}`);
  }

  return model;
}

export async function getChatModel(): Promise<{
  provider: LlmProviderId;
  apiKey: string;
  modelId: string;
  model: Model<any>;
}> {
  const config = await resolveLlmConfig("chat");

  if (config.provider === "gemini") {
    return {
      ...config,
      model: getGeminiChatModel(config.modelId),
    };
  }

  const predefinedModel = getModels("openrouter").find((candidate) => candidate.id === config.modelId);

  return {
    ...config,
    model: predefinedModel || buildCustomOpenRouterModel(config.modelId),
  };
}

function extractOpenRouterText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "type" in part && "text" in part) {
        const textPart = part as { type?: string; text?: string };
        return textPart.type === "text" ? (textPart.text ?? "") : "";
      }
      return "";
    })
    .join("");
}

async function generateWithOpenRouter(
  apiKey: string,
  modelId: string,
  options: GenerateTextOptions
): Promise<string> {
  const response = await fetch(`${getOpenRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...getOpenRouterHeaders(),
    },
    body: JSON.stringify({
      model: modelId,
      temperature: options.temperature ?? 0.2,
      messages: [
        ...(options.systemPrompt
          ? [{ role: "system", content: options.systemPrompt }]
          : []),
        { role: "user", content: options.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const text = extractOpenRouterText(payload.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error("OpenRouter returned an empty response");
  }

  return text;
}

async function generateWithGemini(
  apiKey: string,
  modelId: string,
  options: GenerateTextOptions
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: modelId,
    config: options.systemPrompt
      ? {
          systemInstruction: options.systemPrompt,
        }
      : undefined,
    contents: options.prompt,
  });

  return response.text ?? "No content returned.";
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
  const config = await resolveLlmConfig("report");

  if (config.provider === "openrouter") {
    return generateWithOpenRouter(config.apiKey, config.modelId, options);
  }

  return generateWithGemini(config.apiKey, config.modelId, options);
}

export async function getResolvedLlmSummary(): Promise<{
  provider: LlmProviderId;
  modelId: string;
}> {
  const config = await resolveLlmConfig("report");
  return {
    provider: config.provider,
    modelId: config.modelId,
  };
}
