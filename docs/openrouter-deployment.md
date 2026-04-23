# OpenRouter Deployment Notes

Дата: 2026-04-23

## Мета

Цей документ фіксує production-конфігурацію для нового backend LLM layer у `ResearchIQ`, який підтримує:

- `Gemini`
- `OpenRouter`
- `auto` режим вибору провайдера

Уся логіка вибору провайдера, model discovery і робота з API-ключами виконується тільки на бекенді.

## Підтримувані режими

### `LLM_PROVIDER=gemini`

Використовує лише Gemini.

Потрібно:

- `GEMINI_API_KEY`

### `LLM_PROVIDER=openrouter`

Використовує лише OpenRouter.

Потрібно:

- `OPENROUTER_API_KEY`

### `LLM_PROVIDER=auto`

Поведінка станом на `2026-04-23`:

- якщо заданий `OPENROUTER_API_KEY`, бекенд вибирає OpenRouter
- інакше, якщо заданий `GEMINI_API_KEY`, бекенд вибирає Gemini

## Рекомендований `server/.env`

```env
PORT=3001
DATA_DIR=/opt/orcid-tracker-api/data
AUTH_TOKEN_SECRET=replace-with-a-long-random-secret

LLM_PROVIDER=openrouter

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx
OPENROUTER_MODEL=
OPENROUTER_CHAT_MODEL=
OPENROUTER_REPORT_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

OPENROUTER_AUTO_DISCOVERY=true
OPENROUTER_DISCOVERY_URL=https://shir-man.com/api/free-llm/top-models
OPENROUTER_DISCOVERY_TTL_MS=1800000
OPENROUTER_DISCOVERY_TIMEOUT_MS=4000

OPENROUTER_HTTP_REFERER=https://orcid-csbc.szabolotnii.site
OPENROUTER_APP_TITLE=ResearchIQ
```

## Auto-discovery free моделей

Станом на `2026-04-23` backend підтримує auto-discovery через:

- `https://shir-man.com/api/free-llm/top-models`

Логіка вибору:

1. якщо заданий `OPENROUTER_CHAT_MODEL` або `OPENROUTER_REPORT_MODEL`, використовується explicit override
2. інакше, якщо заданий `OPENROUTER_MODEL`, використовується він
3. інакше бекенд пробує `models[0].id` із discovery endpoint
4. якщо discovery недоступний, використовується fallback `openrouter/free`

## Чому є окремі override для chat і reports

Free-модель, яка добре працює для markdown/report generation, не завжди добре працює для:

- tool calling
- стабільного agent loop
- довших multi-step chat interaction

Тому в системі передбачені окремі env-змінні:

- `OPENROUTER_CHAT_MODEL`
- `OPENROUTER_REPORT_MODEL`

## VPS rollout checklist

1. Оновити `server/.env`.
2. Згенерувати новий `AUTH_TOKEN_SECRET`.
3. Переконатися, що виставлено `LLM_PROVIDER`.
4. Для `openrouter` або `auto` заповнити `OPENROUTER_API_KEY`.
5. За потреби залишити `GEMINI_API_KEY` як backup для `auto`.
6. Зібрати бекенд:

```bash
cd /opt/orcid-tracker-api/server
npm run build
```

7. Перезапустити процес:

```bash
pm2 restart orcid-api
```

8. Перевірити:

- `GET /api/health`
- tenant login
- `POST /api/chat`
- `POST /api/reports/generate`

9. Переглянути `pm2 logs orcid-api` після перших запитів.
10. Якщо free-модель поводиться нестабільно, зафіксувати її явно через `OPENROUTER_CHAT_MODEL` або `OPENROUTER_REPORT_MODEL`.

## Поточний статус реалізації

Станом на `2026-04-23`:

- backend provider layer уже реалізований
- `/api/chat` використовує backend-selected model
- `/api/reports/generate` використовує той самий LLM layer
- frontend не повинен мати runtime AI secret для чату чи генерації звітів
