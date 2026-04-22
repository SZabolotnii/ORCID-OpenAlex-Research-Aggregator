# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResearchIQ is a multi-tenant research analytics platform for university administrators. It aggregates faculty data from ORCID, OpenAlex, Scopus, and Web of Science, then uses an AI agent (pi-agent-core + Gemini) to provide intelligent analytics. The system consists of a React frontend and a Node.js backend deployed on VPS.

## Commands

```bash
# Frontend
npm run dev       # Start frontend dev server (port 3000, proxies /api to :3001)
npm run build     # Production build to dist/
npm run preview   # Preview production build

# Backend
cd server
npm run dev       # Start backend dev server (port 3001, with hot reload)
npm run build     # Compile TypeScript to dist/
npm start         # Run compiled server

# Data Import
npx tsx scripts/import-csv.ts <csv-file> --tenant <id> --institution "Name"
```

No test runner or linter is configured.

## Environment Variables

**Frontend** (`.env`, loaded by Vite):
- `GEMINI_API_KEY` — used only for report generation (client-side Gemini calls)

**Backend** (`server/.env`):
- `GEMINI_API_KEY` — required, used by pi-agent for AI chat
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
- `geminiService.ts` — Chat: proxies to `/api/chat` backend. Reports: direct Gemini API calls (`generateReportContent()`, `fillReportTemplate()`).
- `mcpProcessor.ts` — Legacy MCP tool schemas (kept for report generation compatibility).
- `orcidService.ts` — ORCID Public API. Fetches profiles and publications.
- `openAlexService.ts` — OpenAlex API. Fetches h-index, citations, topics, yearly trends. `cited_by_count` and `works_count` read from top-level response (not `summary_stats`).
- `dataMergeService.ts` — Multi-source publication deduplication (DOI → title+year → metadata merge).
- `scopusService.ts` / `wosService.ts` — Return simulated data unless real API keys provided.

**Backend** (`server/src/`):
- `index.ts` — Express API with tenant management, data persistence, AI chat endpoint.
- `agent.ts` — pi-agent configuration: system prompt with full faculty context snapshot, 7 custom research tools, aggregate statistics.
- `tools.ts` — Tool implementations: `query_faculty_rankings`, `search_local_publications`, `get_department_comparison`, `get_faculty_detail`, `get_author_metrics_live`, `search_global_works`, `get_current_date`.
- `types.ts` — Shared types (Faculty, Publication, TenantConfig, etc.)

**Bilingual support** (EN/UA): `contexts/LanguageContext.tsx` + `utils/translations.ts`.

## Key Types

Core interfaces in `types.ts`: `Faculty`, `Publication` (multi-source with `sources: DataSource[]`), `OpenAlexMetrics` (h-index, citation trends, topics).

Server-side in `server/src/types.ts`: mirrors frontend types + `TenantConfig` (id, subdomain, name, public, adminPasswordHash, viewPasswordHash).

## Important Patterns

- **AI Agent** (backend `agent.ts`): pi-agent-core with Gemini 2.5 Flash. System prompt includes full faculty data snapshot + pre-computed aggregates. 7 tools for local queries + external OpenAlex. The AI answers most questions from context without tool calls.
- **Multi-tenant**: tenant detected from subdomain (`orcid-{id}.szabolotnii.site` → id). Data stored per-tenant on disk. Auth verified server-side (SHA-256).
- **Admin/Viewer modes**: controlled by `isAdmin` state in `App.tsx`. Admin mode shows: Search ORCID, Add/Edit/Delete faculty, Import/Export, Settings. Viewer mode: read-only dashboard + AI chat + reports.
- **Data persistence**: localStorage (per-tenant key) with server fallback (`GET /api/data/:tenantId`). Initial mount skip via `isInitialMount` ref prevents overwriting.
- **Publication deduplication** in `dataMergeService.ts`: 3-level matching (DOI → title+year → metadata merge).
- **File parsing** in `ReportGenerator.tsx`: Handles DOCX, XLSX, CSV, PDF, Markdown uploads.
- **Import script** (`scripts/import-csv.ts`): CLI tool that reads CSV, fetches ORCID+OpenAlex data, uploads to server per-tenant.

## Deployment

- VPS: `srv1437773.hstgr.cloud` (Ubuntu 24.04, Node 22)
- Backend: PM2 process `orcid-api` at `/opt/orcid-tracker-api/`
- Frontend: static files at `/var/www/orcid-tracker/`
- Reverse proxy: Caddy in Docker (`openclaw-4evq-caddy-1`)
- DNS: Hostinger (dns-parking), subdomains need A-record to VPS IP
