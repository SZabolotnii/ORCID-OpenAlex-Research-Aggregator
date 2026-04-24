# Короткий Checklist Тестування ResearchIQ

Дата: 2026-04-24

Повний план: [test-plan-2026-04-24.md](/Users/docua/Project/Research/ORCID-OpenAlex-Research-Aggregator/docs/test-plan-2026-04-24.md:1)

## 1. Базові технічні перевірки

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `cd server && npm run build`

## 2. API smoke

### Локально або на VPS

- [ ] `GET /api/health` повертає `{ "status": "ok" }`
- [ ] `GET /api/tenant/:id/config` повертає коректний `id`, `name`, `public`
- [ ] `npm run smoke` проходить без помилок

### Для private tenant

- [ ] без токена `GET /api/data/:tenantId` повертає `401`
- [ ] viewer token читає дані
- [ ] admin token зберігає дані

## 3. Авторизація

- [ ] public tenant відкривається без логіну
- [ ] private tenant просить пароль
- [ ] viewer login працює
- [ ] admin login працює
- [ ] logout очищає доступ коректно

## 4. Faculty CRUD

- [ ] add faculty працює
- [ ] edit faculty зберігається після refresh
- [ ] delete faculty зберігається після refresh
- [ ] bulk update / bulk delete працюють

## 5. Імпорт та експорт

- [ ] batch CSV import не падає
- [ ] CLI import через `scripts/import-csv.ts` працює
- [ ] JSON export працює
- [ ] CSV export працює
- [ ] report download працює

## 6. Навігація та UI

- [ ] dashboard відкривається
- [ ] faculty list відкривається
- [ ] chat відкривається
- [ ] reports відкривається
- [ ] `/search` доступний лише для admin

## 7. Chat

- [ ] chat відповідає на запит
- [ ] chat history зберігається після reload
- [ ] chat export працює
- [ ] clear chat повертає welcome state

## 8. Reports

- [ ] standard report генерується
- [ ] custom template report генерується
- [ ] report history зберігається
- [ ] preview працює
- [ ] download у потрібному форматі працює

## 9. OpenRouter / LLM

- [ ] при `LLM_PROVIDER=openrouter` chat працює
- [ ] при `LLM_PROVIDER=openrouter` reports працюють
- [ ] при `LLM_PROVIDER=auto` provider обирається коректно
- [ ] fallback працює, якщо discovery endpoint недоступний

## 10. Production sanity check

- [ ] tenant data читаються після деплою
- [ ] CRUD працює після деплою
- [ ] chat працює після деплою
- [ ] reports працюють після деплою
- [ ] `pm2 logs orcid-api` не показує критичних помилок

## 11. Мінімальний release gate

Реліз вважається придатним, якщо:

- [ ] `lint`, `typecheck`, frontend build і backend build зелені
- [ ] `smoke` зелений
- [ ] private tenant auth працює
- [ ] admin save працює
- [ ] chat працює
- [ ] report generation працює
