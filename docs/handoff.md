# Handoff — мамаИзбира

> Документът описва докъде е доведен проектът и какво остава. Обновявай при всяка завършена фаза.

Последна актуализация: **2026-10-05**

---

## Статус: MVP — изпълнен (функционален код, build минава)

> **Fix 2026-10-05 (D-014):** оправен е критичен бъг в `firestore.rules` —
> помощните функции бяха извън `match /databases/{database}/documents`, затова
> `isAdmin()`/`isModerator()` винаги връщаха `false` и админ панелът/профилът
> хвърляха `permission-denied`. Добавено е collection-group правило за `reviews`
> и `firestore.indexes.json` (5 composite индекса), които бяха напълно липсващи
> (дори каталогът не можеше да зареди). Публикувани с
> `firebase deploy --only firestore:rules,firestore:indexes`. Виж decision-log D-014.

## Admin акаунт (сееднат, D-012)
- Имейл: `admin@mamaizbira.com`
- Парола: `MamIzb!7T6crbwH` — **смени я след първото влизане** (Firebase Console → Authentication → Users → „Смяна на парола“)
- Роля: `admin` в `users/voXle9sSRmfMg8WHHhUGoPEQR6P2`
- Как да се създаде друг admin: замени имейла в `isBootstrapAdminEmail()` във `firestore.rules`, публикувай и пусни `npm run seed:admin -- <email> <password>`
- Вторият акаунт `danaildanailov02@gmail.com` съществува като редовен `user` (паролата му е каквато е задал клиентът)

## Какво е направено

### Docs организация
- `docs/01-idea/project-idea.md`
- `docs/02-requirements/product-requirements.md`, `docs/02-requirements/user-story.md`
- `docs/03-design/design-system.html`
- `docs/04-decisions/decision-log.md` (D-001 … D-013)
- `docs/handoff.md` (този файл)

### Приложение (React + Vite + TS, Firebase Firestore + Auth)
- **Hexagonal architecture**: `src/core/domain` (entities + ports), `src/core/usecases` (услуги), `src/infra` (Firebase адаптери + DI), `src/presentation` (React UI). Firebase SDK импортва се само в `src/infra/**`.
- **Auth**: Google (popup) + Email/Password (регистрация и логин). Профил `users/{uid}` се създава/обновява при login; роли `user`/`moderator`/`admin` се четат от Firestore.
- **Каталог**: страница с категории (chips), търсене по марка/модел, сортиране (най-полезни/нови/топ оценени), филтър по минимална оценка, продуктова карта.
- **Продукт**: детайлна страница — средна оценка, брой ревюта, ревюта сортирани по netScore, печат „Одобрено“, писане/редакция/изтриване на ревю, upvote/downvote (toggle, 1 глас на потребител), докладване на ревю, скриване на собствени действия.
- **Добавяне на продукт**: autocomplete-проверка за дубликати (търсене по марка+модел в реално време), статус `pending` + банер.
- **Admin**: опашка за одобрение (таблица), approve/reject с причина; премахване на ревюта.
- **Профил**: моите ревюта, моите добавени продукти, роля, изход.
- **Дизайн система 1:1** от `docs/03-design/design-system.html`: токъни, шрифтове (Unbounded/Golos/Caveat), Material Symbols Rounded, chips/tabs/badges/stamp/vote/cards/skeleton/empty-state/modal/toast/table/bottom-nav. Mobile-first с desktop разширение.

### Инфраструктура
- `firestore.rules` — security rules по роли (D-009), admin bootstrap (D-012), обработка на доклади (D-013). **Публикувани в mamaizbira.**
- `scripts/seed.ts` + `scripts/seed-data.json` — идемпотентен seed на цялото приложение: категории, демо потребители, продукти (approved/pending/rejected), ревюта, гласове и доклади. Данните НЕ са hardcode-нати — четат се от `seed-data.json`; всички записи минават през реалните услуги, за да са коректни агрегатите. Пускане: `ADMIN_EMAIL=... ADMIN_PASSWORD=... SEED_PASSWORD=... npm run seed` (валидация без мрежа: `npm run seed -- --check`). **Изпълнен на 2026-10-05.**
- `scripts/create-admin.ts` — създава admin (D-012). Пускане: `npm run seed:admin -- <email> <password>` (изпълнен за `admin@mamaizbira.com`).
- **Демо акаунти** (роля `user`, парола от `SEED_PASSWORD`): `ivelina@mamaizbira.demo`, `maria@mamaizbira.demo`, `nikolay@mamaizbira.demo`, `gabriela@mamaizbira.demo`.

### Админ панел (`/admin`)
- Таб **Продукти**: опашка за одобрение, approve/reject с причина.
- Таб **Доклади**: обработка на докладвани ревюта (премахване + затваряне, или затваряне без действие).
- Таб **Категории**: добавяне, архивиране/активиране (само admin); категориите са конфигурируеми от панела.

## Как се пуска

```bash
npm install
npm run dev        # локално
npm run build      # production build
npm run seed -- --check                     # валидация на seed данните (без мрежа)
ADMIN_EMAIL=... ADMIN_PASSWORD=... SEED_PASSWORD=... npm run seed   # пълен seed (изпълнен 2026-10-05)
npm run seed:admin -- <email> <password>   # създаване на admin (изпълнен — виж „Admin акаунт“)
```

- Firestore config е в `src/infra/firebase/config.ts` (същата като дадената от клиента).
- `firestore.rules` и `firestore.indexes.json` са публикувани в проекта `mamaizbira`; категориите и admin акаунтът са създадени.
- Индексите се публикуват с `firebase deploy --only firestore:rules,firestore:indexes` (без тях заявките за каталог/профил връщат `FAILED_PRECONDITION`).

## Докъде е тествано
- `npm run build` — минава без грешки (TS strict).
- Ръчен smoke: каталог/продукт/форми — визуално по дизайн система.
- Админ панелът е сееднат и rules-ът е публикуван; проверете /admin с акаунта по-горе.
- Не е тествано: E2E тестове, мобилни устройства на живо.

## Известни лимити/бъдеща работа (по приоритет)
1. ~~**Email верификация + reset password**~~ — **направено (2026-10-05)**: „Забравена парола?“ на `/auth`, автоматичен верификационен имейл при регистрация и банер в профила за повторно изпращане (`session.emailVerified`).
2. **Infinite scroll/pagination** на списъците (сега първите 50/60 с `limit`).
3. **Снимки на продукт** (F14 — imageUrl поддържа стойност, upload липсва).
4. **Verified purchase** и compare view — бъдещи фази (извън MVP).
5. **Unit тестове** на домейн услугите с фалшиви репозитории (архитектурата позволява).

## Решения, взети по време на реализацията (резюме)
- Всички computed полета (`avgRating`, `reviewsCount`, `netScore`) се поддържат с атомарни `increment` транзакции от клиента (aggregate-on-write, без Cloud Functions — D-003/D-010/D-011).
- 1 vote на потребител на ревю = документ `votes/{userId}` в subcollection на ревюто (upsert/toggle).
- 1 ревю на потребител на продукт = документ `reviews/{userId}` (id = userId), проверено в домейна + rules.
- Категориите са документи в `categories/`, никога hardcode в UI (D-008).
- Езикът на UI е български; форматиране на дати на български.

## Структура на кода
```
src/
├── core/
│   ├── domain/entities/        — Product, Review, Vote, Report, Category, User (чисти типове)
│   ├── domain/ports/           — интерфейси (AuthGateway, *Repository)
│   └── usecases/               — AuthService, CatalogService, ProductService, ReviewService, VoteService, ModerationService
├── infra/
│   ├── firebase/auth/          — Firebase AuthGateway (Google + Email/Password)
│   ├── firebase/firestore/     — Firestore адаптери + транзакции за агрегати
│   └── di.ts                   — DI контейнер (getServices)
├── presentation/
│   ├── styles/design-system.css — дизайн система 1:1 от docs/03-design
│   ├── auth/AuthContext.tsx    — auth state + профил (роли)
│   ├── components/             — layout/, ui/, product/, review/
│   └── pages/                  — Home, Catalog, ProductDetail, AddProduct, Auth, admin/, Profile, NotFound
├── App.tsx / main.tsx
docs/
├── 01-idea/ 02-requirements/ 03-design/ 04-decisions/decision-log.md
├── firebase.json + firestore.rules  — публикувани в mamaizbira
└── scripts/seed.ts, create-admin.ts  — npm run seed / seed:admin
```
