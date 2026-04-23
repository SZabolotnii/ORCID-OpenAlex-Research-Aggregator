# AGENTS.md — ResearchIQ (Gemini / OpenRouter)

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

ResearchIQ is a multi-tenant research analytics platform for university administrators. It aggregates faculty data from ORCID, OpenAlex, Scopus, and Web of Science, then uses an AI agent (`pi-agent-core`) with a backend-selected LLM provider (`Gemini`, `OpenRouter`, or `auto` selection) to provide intelligent analytics. The system consists of a React frontend and a Node.js backend deployed on VPS.

## Commands

```bash
# Frontend
npm run dev       # Start frontend dev server (port 3000, proxies /api to :3001)
npm run build     # Production build to dist/
npm run lint      # ESLint for frontend/shared code
npm run typecheck # TypeScript type check without emit
npm run smoke     # API smoke checks against a running backend
npm run preview   # Preview production build

# Backend
cd server
npm run dev       # Start backend dev server (port 3001, with hot reload)
npm run build     # Compile TypeScript to dist/
npm start         # Run compiled server

# Data Import
npx tsx scripts/import-csv.ts <csv-file> --tenant <id> --institution "Name"
```

## Environment Variables

**Frontend** (`.env`, loaded by Vite):
- no required runtime AI secret; chat and report generation proxy through the backend

**Backend** (`server/.env`):
- `LLM_PROVIDER` — `gemini`, `openrouter`, or `auto`
- `GEMINI_API_KEY` — Gemini key, required only for `LLM_PROVIDER=gemini` or as fallback in `auto`
- `GEMINI_MODEL` — optional Gemini model override
- `OPENROUTER_API_KEY` — OpenRouter key, required for `LLM_PROVIDER=openrouter` or for preferred OpenRouter use in `auto`
- `OPENROUTER_MODEL` — global OpenRouter model override
- `OPENROUTER_CHAT_MODEL` — optional dedicated OpenRouter model override for chat/tool-calling
- `OPENROUTER_REPORT_MODEL` — optional dedicated OpenRouter model override for report generation
- `OPENROUTER_BASE_URL` — OpenRouter API base URL (default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_AUTO_DISCOVERY` — enable or disable free-model discovery
- `OPENROUTER_DISCOVERY_URL` — free-model discovery endpoint (default: `https://shir-man.com/api/free-llm/top-models`)
- `OPENROUTER_DISCOVERY_TTL_MS` — cache TTL for discovered free model
- `OPENROUTER_DISCOVERY_TIMEOUT_MS` — HTTP timeout for discovery request
- `OPENROUTER_HTTP_REFERER` — optional attribution header for OpenRouter
- `OPENROUTER_APP_TITLE` — optional attribution title for OpenRouter
- `AUTH_TOKEN_SECRET` — token signing secret for tenant auth sessions
- `PORT` — server port (default: 3001)
- `DATA_DIR` — data storage directory (default: /opt/orcid-tracker-api/data)

## Architecture

```
VPS (srv1437773.hstgr.cloud):
├── Caddy (reverse proxy, SSL)
│   ├── orcid-{tenant}.szabolotnii.site → frontend + API
│   └── /api/* → Node.js backend (port 3001)
├── Node.js backend (pi-agent-core + Express)
│   ├── /api/chat — AI agent with 7 research tools
│   ├── /api/data/:tenantId — per-tenant faculty data
│   ├── /api/tenant/:id/config — tenant configuration
│   └── /api/tenant/:id/verify — server-side auth
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

**Services layer** (`services/`):
- `geminiService.ts` — frontend API client for `/api/chat` and `/api/reports/generate`
- `tenantApi.ts` — tenant auth and protected data access helpers
- `facultyDataService.ts` — ORCID/OpenAlex/Scopus/WoS enrichment pipeline for faculty records
- `mcpProcessor.ts` — Legacy MCP tool schemas (kept for report generation compatibility).
- `orcidService.ts` — ORCID Public API. Fetches profiles and publications.
- `openAlexService.ts` — OpenAlex API. Fetches h-index, citations, topics, yearly trends. `cited_by_count` and `works_count` read from top-level response (not `summary_stats`).
- `dataMergeService.ts` — Multi-source publication deduplication (DOI → title+year → metadata merge).
- `scopusService.ts` / `wosService.ts` — Return simulated data unless real API keys provided.

**Backend** (`server/src/`):
- `index.ts` — Express API with tenant management, data persistence, AI chat endpoint.
- `agent.ts` — pi-agent configuration: system prompt with full faculty context snapshot, 7 custom research tools, aggregate statistics.
- `tools.ts` — Tool implementations: `query_faculty_rankings`, `search_local_publications`, `get_department_comparison`, `get_faculty_detail`, `get_author_metrics_live`, `search_global_works`, `get_current_date`.
- `llmProvider.ts` — backend LLM resolver for Gemini/OpenRouter, including OpenRouter free-model discovery and per-use-case overrides
- `types.ts` — Shared types (Faculty, Publication, TenantConfig, etc.)

**Bilingual support** (EN/UA): `contexts/LanguageContext.tsx` + `utils/translations.ts`.

## Key Types

Core interfaces in `types.ts`: `Faculty`, `Publication` (multi-source with `sources: DataSource[]`), `OpenAlexMetrics` (h-index, citation trends, topics).

Server-side in `server/src/types.ts`: mirrors frontend types + `TenantConfig` (id, subdomain, name, public, adminPasswordHash, viewPasswordHash).

## Important Patterns

- **AI Agent** (backend `agent.ts`): pi-agent-core with a backend-selected model. Gemini remains supported, and OpenRouter can be selected via `LLM_PROVIDER`, including auto-discovery of a current free model on the backend.
- **Multi-tenant**: tenant detected from subdomain (`orcid-{id}.szabolotnii.site` → id). Data stored per-tenant on disk. Auth is verified server-side and role sessions are issued as backend-signed auth tokens.
- **Admin/Viewer modes**: controlled by `isAdmin` state in `App.tsx`. Admin mode shows: Search ORCID, Add/Edit/Delete faculty, Import/Export, Settings. Viewer mode: read-only dashboard + AI chat + reports.
- **Data persistence**: server is the source of truth for tenant data. The frontend keeps tenant-scoped local/session storage only for cached UI state, auth session, chat history, saved reports, and API settings.
- **Quality gates**: `npm run lint`, `npm run typecheck`, and `npm run build` are the baseline local verification flow. `npm run smoke` is available for live API sanity-checks against a running backend or VPS deployment.
- **Publication deduplication** in `dataMergeService.ts`: 3-level matching (DOI → title+year → metadata merge).
- **File parsing** in `ReportGenerator.tsx`: Handles DOCX, XLSX, CSV, PDF, Markdown uploads.
- **Import script** (`scripts/import-csv.ts`): CLI tool that reads CSV, fetches ORCID+OpenAlex data, then uploads to the protected tenant endpoint using either `--admin-password` or `--auth-token`.

## Deployment

- VPS: `srv1437773.hstgr.cloud` (Ubuntu 24.04, Node 22)
- Backend: PM2 process `orcid-api` at `/opt/orcid-tracker-api/`
- Frontend: static files at `/var/www/orcid-tracker/`
- Reverse proxy: Caddy in Docker (`openclaw-4evq-caddy-1`)
- DNS: Hostinger (dns-parking), subdomains need A-record to VPS IP
