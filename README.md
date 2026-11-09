# мамаИзбира

Каталог с честни ревюта на детски продукти от реални родители. React + TypeScript + Vite,
Firebase Auth/Firestore, изградено с ports & adapters (domain → usecases → infra → presentation).

## Изисквания

- Node.js 20+
- Firebase проект с включени Authentication (Email/Password + Google) и Firestore

## Стартиране

```bash
npm install
npm run dev
```

Firebase конфигурацията е в `src/infra/firebase/config.ts`.

## Скриптове

| Команда | Описание |
| --- | --- |
| `npm run dev` | Vite dev сървър |
| `npm run build` | Type-check (TS strict) + production build |
| `npm run preview` | Преглед на production build |
| `npm run test` | Unit тестове (`node:test` през `tsx`) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run seed` | Демо данни в Firestore |
| `npm run seed:admin` | Създаване на admin акаунт |

## Структура

```
src/
  core/          # domain entities, ports и use cases (без Firebase)
  infra/         # Firebase adapters + DI контейнер
  presentation/  # React компоненти, страници, стилове
tests/           # unit тестове за domain services
```

## Деплой

- **Firebase Hosting:** `npm run build && firebase deploy --only hosting,firestore:rules,firestore:indexes`
- **Vercel:** проектът е SPA; `vercel.json` пренасочва всички пътища към `index.html`.

Правилата и индексите са във `firestore.rules` и `firestore.indexes.json`.

## Известни компромиси (MVP)

- Агрегатите (`ratingSum`, `reviewsCount`, `netScore`) се обновяват от клиентски транзакции.
  Всеки влязъл потребител технически може да ги промени с директен запис (виж D-011).
  Дългосрочното решение е миграция към Cloud Functions.
- При добавяне на нови продукти се записва `searchName`; по-стари документи без него
  няма да се появяват в резултатите от търсенето, докато не бъдат обновени.
