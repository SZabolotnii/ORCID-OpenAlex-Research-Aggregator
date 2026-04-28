# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResearchIQ is a multi-tenant research analytics platform for university administrators. It aggregates faculty data from ORCID, OpenAlex, Scopus, and Web of Science, then uses an AI agent (`pi-agent-core`) with a backend-selected LLM provider (Gemini, OpenRouter, or `auto`) to provide intelligent analytics. The system is a React frontend + Node.js backend deployed on a VPS.

## Commands

```bash
# Frontend (run from repo root)
npm run dev        # Vite dev server (port 3000, proxies /api → :3001)
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm run lint       # ESLint over .ts/.tsx
npm run typecheck  # tsc --noEmit
npm run smoke      # API smoke checks against a running backend (see below)

# Backend (run from server/)
cd server
npm run dev        # tsx watch with hot reload (port 3001, loads server/.env)
npm run build      # tsc → dist/
npm start          # Run compiled server with --env-file=.env

# Data Import
npx tsx scripts/import-csv.ts <csv-file> --tenant <id> --institution "Name"
```

There is no unit/integration test runner. The baseline local verification flow is `npm run lint && npm run typecheck && npm run build`. `npm run smoke` is for live API sanity-checks (see README "Smoke Check" section for required `APP_BASE_URL` / `SMOKE_*` env vars).

## Environment Variables

**Frontend** (`.env`, loaded by Vite): no required runtime AI secret. Chat and report generation proxy through the backend.

**Backend** (`server/.env`):
- `LLM_PROVIDER` — `gemini`, `openrouter`, or `auto`
- `GEMINI_API_KEY` — required for `LLM_PROVIDER=gemini` (and as fallback in `auto`)
- `GEMINI_MODEL` — optional Gemini model override
- `OPENROUTER_API_KEY` — required for `LLM_PROVIDER=openrouter` (and preferred in `auto`)
- `OPENROUTER_MODEL` — global OpenRouter model override
- `OPENROUTER_CHAT_MODEL` / `OPENROUTER_REPORT_MODEL` — per-use-case overrides for chat/tools vs. report generation
- `OPENROUTER_BASE_URL` — default `https://openrouter.ai/api/v1`
- `OPENROUTER_AUTO_DISCOVERY` — toggle free-model auto-discovery
- `OPENROUTER_DISCOVERY_URL` — default `https://shir-man.com/api/free-llm/top-models`
- `OPENROUTER_DISCOVERY_TTL_MS` / `OPENROUTER_DISCOVERY_TIMEOUT_MS` — discovery cache/timeout
- `OPENROUTER_HTTP_REFERER` / `OPENROUTER_APP_TITLE` — optional OpenRouter attribution headers
- `AUTH_TOKEN_SECRET` — token signing secret for tenant auth sessions (required)
- `SCOPUS_API_KEY` — Elsevier API key for Scopus enrichment (required for `/api/enrichment/scopus`; the route returns 503 if unset)
- `SCOPUS_REFERER` — exact `Referer` header sent to Elsevier; must match the URL the key is registered to (default: `https://orcid-csbc.szabolotnii.site/`)
- `PORT` — server port (default: 3001)
- `DATA_DIR` — data storage directory (default: `/opt/orcid-tracker-api/data`)

A reference template lives at `server/.env.production.example`. See `docs/openrouter-deployment.md` for production rollout notes.

## Architecture

```
VPS (srv1437773.hstgr.cloud):
├── Caddy (reverse proxy, SSL)
│   ├── orcid-{tenant}.szabolotnii.site → frontend + API
│   └── /api/* → Node.js backend (port 3001)
├── Node.js backend (pi-agent-core + Express)
│   ├── /api/chat — AI agent with 7 research tools
│   ├── /api/reports/generate — backend-driven report generation
│   ├── /api/enrichment/scopus — admin-only Scopus search proxy (domain-locked Elsevier key)
│   ├── /api/data/:tenantId — per-tenant faculty data (auth-gated for private tenants)
│   ├── /api/tenant/:id/config — tenant configuration
│   └── /api/tenant/:id/verify — server-side auth, issues signed token
├── Static frontend (React SPA, same build for all tenants)
└── Data: /opt/orcid-tracker-api/data/
    ├── tenants.json — tenant registry
    └── {tenantId}.json — faculty data per tenant
```

**Multi-tenant routing**: Frontend detects tenant from subdomain (`orcid-csbc.szabolotnii.site` → tenantId `csbc`). Each tenant has separate data, access control (public/private), and admin password.

**Routing** (React Router v7, HashRouter, defined in `App.tsx`):
- `/` — Dashboard (charts via Recharts, auto-detects earliest publication year)
- `/faculty` — Faculty list (read-only in viewer mode, full CRUD in admin mode)
- `/search` — ORCID affiliation search (admin only)
- `/chat` — AI assistant (pi-agent backend with 7 tools)
- `/reports` — Report generation with standard and custom templates

**Frontend services** (`services/`):
- `geminiService.ts` — frontend client for `/api/chat` and `/api/reports/generate` (no direct Gemini calls).
- `tenantApi.ts` — tenant auth + protected data access helpers (signs requests with backend-issued auth token).
- `facultyDataService.ts` — ORCID/OpenAlex/Scopus/WoS enrichment pipeline for faculty records.
- `orcidService.ts` — ORCID Public API (profiles, publications).
- `openAlexService.ts` — OpenAlex API. Note: `cited_by_count` and `works_count` are read from the top-level response, **not** `summary_stats`.
- `dataMergeService.ts` — Multi-source publication deduplication (DOI → title+year → metadata merge).
- `scopusService.ts` — thin proxy client that POSTs to `/api/enrichment/scopus` (Elsevier key never touches the browser); returns `[]` on any failure so the rest of enrichment still completes.
- `wosService.ts` — returns simulated data unless a real WoS key is wired in (still frontend-only — TODO mirror Scopus pattern when a real key arrives).
- `mcpProcessor.ts` — legacy MCP tool schemas, kept for report generation compatibility.

**Backend** (`server/src/`):
- `index.ts` — Express API: tenant registry, data persistence, auth, chat and report endpoints, rate limiting.
- `agent.ts` — pi-agent configuration: system prompt with full faculty context snapshot + pre-computed aggregates, tool registration.
- `tools.ts` — Implementations of `query_faculty_rankings`, `search_local_publications`, `get_department_comparison`, `get_faculty_detail`, `get_author_metrics_live`, `search_global_works`, `get_current_date`.
- `llmProvider.ts` — Backend LLM resolver for Gemini/OpenRouter, including OpenRouter free-model discovery + per-use-case overrides.
- `reportService.ts` — Backend report generation pipeline (so report LLM calls and templates run server-side).
- `scopusService.ts` — Elsevier Scopus search proxy. Sends `X-ELS-APIKey` + `Referer` (must match the registered domain on the key) to `api.elsevier.com`, normalizes results into `Publication[]`. First tries `ORCID()`; if that returns 0 and the request supplied a `scopusAuthorId`, falls back to `AU-ID()`. Paginates at 25 results/page (Scopus standard tier cap). Throws `ScopusConfigError` (→ 503) if the key is missing.
- `types.ts` — Shared types (Faculty, Publication, TenantConfig, etc.)

**Bilingual support** (EN/UA): `contexts/LanguageContext.tsx` + `utils/translations.ts`.

## Key Types

Core interfaces in `types.ts`: `Faculty`, `Publication` (multi-source with `sources: DataSource[]`), `OpenAlexMetrics` (h-index, citation trends, topics).

Server-side in `server/src/types.ts`: mirrors frontend types + `TenantConfig` (id, subdomain, name, public, adminPasswordHash, viewPasswordHash).

## Important Patterns

- **AI Agent** (`server/src/agent.ts`): pi-agent-core 0.68 with a backend-selected model. The system prompt includes a full faculty data snapshot + pre-computed aggregates, so most questions are answered from context with no tool calls. Tools are invoked only for filtering, ranking, full publication lists, or live OpenAlex lookups.
- **LLM provider selection**: Don't reach for the Gemini SDK directly in new backend code — go through `llmProvider.ts` so OpenRouter and `auto` mode keep working. Frontend code should never hold an LLM key; route through the backend.
- **Multi-tenant**: tenant detected from subdomain (`orcid-{id}.szabolotnii.site` → id). Data stored per-tenant on disk. Tenant role is verified server-side; sessions are issued as backend-signed auth tokens (signed with `AUTH_TOKEN_SECRET`).
- **Admin/Viewer modes**: controlled by `isAdmin` state in `App.tsx`. Admin mode shows: Search ORCID, Add/Edit/Delete faculty, Import/Export, Settings. Viewer mode: read-only dashboard + AI chat + reports.
- **Data persistence**: server is the source of truth for tenant data. The frontend keeps tenant-scoped local/session storage only for cached UI state, auth session, chat history, saved reports, and API settings.
- **Scopus enrichment** is server-side only. The Elsevier key is **domain-locked** — Elsevier validates the `Referer` against the URL the key was registered to. `SCOPUS_REFERER` in `server/.env` must match exactly (incl. trailing slash). If a new tenant comes online, register a separate Elsevier key for its domain (or move the key/referer into per-tenant `TenantConfig`).
- **ORCID ↔ Scopus linkage** is opt-in by the author. When `query=ORCID(...)` returns 0, it usually means the author hasn't claimed their ORCID inside their Scopus profile. `Faculty.scopusAuthorId` is a manually-set fallback (numeric, 6–15 digits) that the proxy uses to retry as `AU-ID(...)`. Editable in the Add and Edit faculty modals.
- **Publication deduplication** (`services/dataMergeService.ts`): 3-level matching (DOI → title+year → metadata merge).
- **File parsing** (`components/ReportGenerator.tsx`): handles DOCX, XLSX, CSV, PDF, Markdown uploads.
- **Import script** (`scripts/import-csv.ts`): CLI that reads CSV, fetches ORCID + OpenAlex data, then uploads to the protected tenant endpoint using either `--admin-password` or `--auth-token`.

## Deployment

- VPS: `srv1437773.hstgr.cloud` (Ubuntu 24.04, Node 22)
- Backend: PM2 process `orcid-api` at `/opt/orcid-tracker-api/`
- Frontend: static files at `/var/www/orcid-tracker/`
- Reverse proxy: Caddy in Docker (`openclaw-4evq-caddy-1`)
- DNS: Hostinger (dns-parking); subdomains need an A-record to the VPS IP

## Reference Docs

- `AGENTS.md` — sibling guide for Codex agents; keep in sync with this file when project structure changes.
- `docs/pi-agent.md` — agent runtime, tool design, system prompt notes.
- `docs/openrouter-deployment.md` — OpenRouter env and rollout.
- `docs/production-smoke-checklist.md` — checks to run after a production deploy.
