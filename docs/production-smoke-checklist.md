# Production Smoke Checklist

Use this after a VPS deploy or any backend/auth/LLM provider change.

## Preconditions

- frontend and backend are deployed
- `server/.env` is updated on the server
- PM2 process is restarted
- at least one tenant is reachable
- for private-tenant checks, you have viewer/admin passwords

## Recommended Local Command

```bash
APP_BASE_URL=https://orcid-tracker.szabolotnii.site \
SMOKE_TENANT_ID=default \
SMOKE_PRIVATE_TENANT_ID=your-private-tenant \
SMOKE_VIEWER_PASSWORD=viewer-password \
SMOKE_ADMIN_PASSWORD=admin-password \
npm run smoke
```

If you only want public/basic checks:

```bash
APP_BASE_URL=https://orcid-tracker.szabolotnii.site \
SMOKE_TENANT_ID=default \
npm run smoke
```

## Manual Browser Sanity Check

1. Open a public tenant and confirm dashboard data loads.
2. Open a private tenant and confirm unauthenticated access asks for a password.
3. Log in as viewer and confirm dashboard, chat, and reports are readable.
4. Log in as admin and confirm faculty CRUD persists after refresh.
5. Generate one chat response and one report.
6. If `LLM_PROVIDER=openrouter` or `auto`, inspect backend logs for provider/model selection on the first AI request.

## Server-Side Checks

```bash
pm2 status
pm2 logs orcid-api --lines 100
curl -fsSL https://orcid-tracker.szabolotnii.site/api/health
```

## Success Criteria

- `npm run smoke` exits with code `0`
- `/api/health` returns `{ "status": "ok" }`
- private tenant rejects unauthenticated data access with `401`
- viewer token can read private data
- admin token can save private data
- chat and report generation succeed with the configured LLM provider
