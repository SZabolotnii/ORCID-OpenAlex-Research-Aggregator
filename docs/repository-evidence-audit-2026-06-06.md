# Аудит репозиторію для твердження у статті

Дата: 2026-06-06
Репозиторій: `https://github.com/SZabolotnii/ORCID-OpenAlex-Research-Aggregator`
Локальний checkout: `/Users/docua/Project/ORCID-OpenAlex-Research-Aggregator`
Перевірений коміт: `9dcaa82` (`origin/main`)

## Початкове перевірюване твердження

> Повний вихідний код, відтворюваний бенчмарк і модульні тести оприлюднено у відкритому репозиторії під ліцензією MIT: https://github.com/SZabolotnii/ORCID-OpenAlex-Research-Aggregator.

## Короткий висновок

Після правок від 2026-06-06 твердження підтверджується для частин "повний вихідний код", "відтворюваний бенчмарк", "модульні тести", "відкритий репозиторій" і "ліцензія MIT": додано стандартний файл `LICENSE`, а також `license: "MIT"` у `package.json` і `server/package.json`. Водночас точніше формулювання для статті має підкреслювати, що репозиторій містить не лише код експериментів, а повний застосунок ResearchIQ як програмну реалізацію запропонованої TRACE-методології.

## Evidence matrix

| Частина твердження | Статус | Підстава |
| --- | --- | --- |
| Відкритий репозиторій | Підтверджено | `origin` вказує на `https://github.com/SZabolotnii/ORCID-OpenAlex-Research-Aggregator`; `git ls-remote origin refs/heads/main` повертає публічний `main` на `9dcaa822e3cd236a45e384c01660325e791f8c2b`. |
| Повний вихідний код | Підтверджено з застереженням | У репозиторії є React frontend, Node/Express backend, сервіси ORCID/OpenAlex/Scopus, скрипти імпорту, тести, benchmark і paper artifacts. Секрети не відстежуються, `.env` і `server/.env` не в git. |
| Модульні тести | Підтверджено | `npm test` пройшов: 30/30 тестів успішні. Покриті `goldenRecord`, `dataMergeService`, `reportStats`. |
| Відтворюваний benchmark | Підтверджено | Quick benchmark успішно відтворено у `/tmp/researchiq-benchmark-audit`; повний `faculty50` benchmark перегенеровано командою `npm run benchmark -- --researchers 50 --departments 4 --outdir paper/benchmark/faculty50`. |
| Ліцензія MIT | Підтверджено після правки | Додано `LICENSE`; `package.json` і `server/package.json` мають `"license": "MIT"`. |
| Дані benchmark | Підтверджено як synthetic | README і `scripts/synthetic-benchmark.ts` описують synthetic model university без реальних персональних даних. |
| Демонстраційні дані в репозиторії | Потребує пояснення | У git є `csbc_faculty.csv`, `csbc_faculty_data.json`, `load_data.html` з реальноподібними ORCID/OpenAlex даними. Це не спростовує synthetic benchmark, але в README/статті варто явно розділити synthetic benchmark і demo/public ORCID dataset. |

## Запущені перевірки

```bash
git status --short --branch
git remote -v
git ls-remote origin refs/heads/main
npm test
npm run lint
npm run typecheck
npm run build
npm run benchmark -- --quick --researchers 50 --departments 4 --outdir /tmp/researchiq-benchmark-audit
npm run benchmark -- --researchers 50 --departments 4 --outdir paper/benchmark/faculty50
git ls-files LICENSE LICENSE.md COPYING package.json server/package.json
node -e '... package license check ...'
```

Результати:

- `git status --short --branch`: `main...origin/main`, без незакомічених змін на момент перевірки перед створенням цього аудиту.
- `npm test`: усі 30 тестів пройшли.
- `npm run lint`: пройшов.
- `npm run typecheck`: пройшов.
- `npm run build`: пройшов.
- quick benchmark:
  - researchers: 50
  - departments: 4
  - K: 5
  - code: `9dcaa82`
  - Golden Record F1: `76.1 +/- 1.3`
  - B3 F1: `95.7 +/- 0.2`
  - output: `/tmp/researchiq-benchmark-audit/`
- full `faculty50` benchmark:
  - researchers: 50
  - departments: 4
  - K: 30
  - code: `9dcaa82`
  - Golden Record F1: `76.1 +/- 1.0`
  - B3 F1: `95.7 +/- 0.1`
  - artifacts: `paper/benchmark/faculty50/metrics_summary.json`, `metrics_raw.csv`, `config.json`

## Окремі спостереження

1. Трековані benchmark artifacts у `paper/benchmark/faculty50/` перегенеровано на поточному коді `9dcaa82`. Після майбутнього фінального коміту `gitHash` у benchmark artifact закономірно відставатиме на один коміт, якщо не робити ще один post-commit rerun; це нормальна властивість artifact-ів, що фіксують код до внесення самого artifact у git.

2. README вже добре підтримує claims про deterministic core, tests і benchmark:
   - `README.md:245` описує `npm test`;
   - `README.md:296-306` описує test suite;
   - `README.md:312-318` описує reproducible synthetic benchmark;
   - `README.md:423` і `README.md:440` декларують MIT.

3. Ліцензійний claim виправлено технічно:
   - додано стандартний MIT `LICENSE`;
   - додано `"license": "MIT"` у `package.json` і `server/package.json`;
   - після цього фраза у статті формально захищена.

## Рекомендована редакція фрази

> Відкритий репозиторій містить повний вихідний код ResearchIQ як програмної реалізації запропонованої TRACE-методології (вебзастосунок, серверний агентний шар, детермінований рушій Golden Record), а також скрипти відтворюваного синтетичного бенчмарку, модульні тести й артефакти рукопису; матеріали поширюються під ліцензією MIT: https://github.com/SZabolotnii/ORCID-OpenAlex-Research-Aggregator.

## Рекомендовані дії перед подачею

1. Закомітити й опублікувати ліцензійні, README, manuscript і artifact-правки.
2. Перед фінальною подачею за потреби повторити повний benchmark уже після фінального коміту, якщо потрібно, щоб `gitHash` artifact-а збігався саме з submission commit.
