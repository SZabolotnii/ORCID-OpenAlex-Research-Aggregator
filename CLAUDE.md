# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResearchIQ is a client-side React application that aggregates faculty research data from ORCID, OpenAlex, Scopus, and Web of Science, then uses Gemini AI to generate insights and reports. It runs entirely in the browser with localStorage for persistence — there is no backend server or database.

## Commands

```bash
npm run dev       # Start dev server (port 3000)
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

No test runner or linter is configured.

## Environment Variables

Set in `.env.local` (loaded by Vite at build time):
- `GEMINI_API_KEY` — required for AI features
- `SCOPUS_API_KEY` — optional, for real Scopus integration (currently simulated)
- `WOS_API_KEY` — optional, for real Web of Science integration (currently simulated)

## Architecture

**Pure client-side SPA:** React 19 + TypeScript + Vite. TailwindCSS loaded via CDN (not bundled). Data persisted in browser localStorage.

**Routing** (React Router v7, defined in `App.tsx`):
- `/` — Dashboard (charts via Recharts)
- `/faculty` — Faculty list management
- `/search` — ORCID affiliation search to discover/add faculty
- `/chat` — AI conversational analysis (Gemini with MCP function calling)
- `/reports` — Report generation with standard and custom templates

**Services layer** (`services/`):
- `geminiService.ts` — Gemini API integration. Uses MCP function calling: Gemini autonomously selects tools (`get_author_metrics`, `search_scientific_works`, `get_current_date`) in a multi-turn loop (max 5 turns). Report generation uses `fillReportTemplate()` for uploaded templates and `generateReportContent()` for standard reports.
- `mcpProcessor.ts` — Defines MCP tool schemas and `executeMcpTool()` dispatcher.
- `orcidService.ts` — ORCID Public API. Fetches profiles and publications; parses ORCID's nested JSON structure.
- `openAlexService.ts` — OpenAlex API. Fetches h-index, citations, topics, yearly trends. Requires `mailto` parameter for polite pool.
- `dataMergeService.ts` — Multi-source publication deduplication: DOI match first, then fuzzy title+year match (1-year tolerance), then metadata enrichment (max citations, fill missing fields).
- `scopusService.ts` / `wosService.ts` — Currently return simulated data with 800ms delay unless real API keys are provided.

**Bilingual support** (EN/UA): `contexts/LanguageContext.tsx` + `utils/translations.ts`. Language selection propagates to all components and Gemini responses.

## Key Types

Core interfaces in `types.ts`: `Faculty` (ORCID profile + publications + metrics), `Publication` (multi-source with `sources: DataSource[]`), `OpenAlexMetrics` (h-index, citation trends, topics).

## Important Patterns

- **MCP function calling loop** in `geminiService.ts`: Gemini decides which tools to call; results are fed back until it produces a final text response. Changes here affect all AI features.
- **Publication deduplication** in `dataMergeService.ts`: 3-level matching strategy (DOI → title+year → metadata merge). Order matters — DOI matching must run before fuzzy matching.
- **File parsing** in `ReportGenerator.tsx`: Handles DOCX (Mammoth.js), XLSX (SheetJS), CSV (PapaParse), PDF (PDF.js), and Markdown uploads for template-based report generation.
- State managed in `App.tsx` via hooks; faculty list synced to localStorage on every change.
