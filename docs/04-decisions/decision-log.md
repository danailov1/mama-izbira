# Decision Log — мамаИзбира

Формат: всяко проектно/дизайнерско решение се записва тук с дата, контекст, самото решение и последствия. Обновява се при всяка значима промяна.

---

## D-001 · Технологичен стек — React + Vite + TypeScript

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: PRD §4 изисква React frontend, Firebase backend (Firestore + Auth), mobile-first. Нужна е бърза и проста среда за SPA.
- **Решение**: Vite (dev server + build) с React 18 + TypeScript. Routing чрез `react-router-dom`.
- **Последствия**: Бърз HMR, стабилен TS за домейн слой; build → статичен хостинг (Firebase Hosting в бъдеще).

## D-002 · Автентикация — Google + Email/Password

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: F4 — регистрация/логин е Must. Клиентът изрично изисква Google и email/парола.
- **Решение**: Firebase Auth с два провайдъра: `GoogleAuthProvider` и `EmailAuthProvider` (createUserWithEmailAndPassword / signInWithEmailAndPassword). Регистриран само в потребителските портове на домейна (AuthGateway порт).
- **Последствия**: И двата провайдъра дават uid; профилът (displayName/email) се синхронизира в колекция `users` при login/register — дори и Google без custom claims, ролите живеят в Firestore (`users/{uid}` → `role`).

## D-003 · Backend — само Firestore (без Cloud Functions)

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: Клиентът: „use only firebase firestore“. PRD §3.3 изисква `avgRating`, `reviewsCount`, `netScore` като computed полета.
- **Решение**: Няма Cloud Functions. Изчислените полета се поддържат от клиента с атомарни транзакции (batched writes):
  - `avgRating`/`reviewsCount` на продукт — при добавяне/редакция/изтриване на ревю (транзакция пресмята нови стойности).
  - `netScore` на ревю — при upvote/downvote (transactional increment).
- **Последствия**: Единствен източник на истина е Firestore; редуциран vendor lock. Клиентът пази консистентност, което за MVP е приемливо (Firestore транзакции гарантират атомарност). В бъдеще лесно се мигрира към Cloud Functions/triggers без промяна в домейна.

## D-004 · Модел на данните във Firestore

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: PRD §3.2 задава Product, Review, Vote, User. PRD §3.1: категориите са конфигурируеми от admin панел, не hardcode.
- **Решение**: Колекции:
  - `users/{uid}` — displayName, email, role (`user`|`moderator`|`admin`), createdAt
  - `categories/{id}` — name, slug, icon (Material Symbol), order, status (`active`|`archived`)
  - `products/{id}` — brand, model, categoryId, imageUrl?, status (`pending`|`approved`|`rejected`), rejectionReason?, createdBy, createdAt, avgRating, reviewsCount
  - `products/{id}/reviews/{reviewId}` — subcollection: userId, rating (1–5), text, upvotes, downvotes, netScore, status (`visible`|`removed`), createdAt, updatedAt
  - `reviews/{reviewId}/votes/{userId}` — subcollection: type (`up`|`down`), createdAt (1 vote per user per review — id = userId)
  - `reports/{id}` — reviewId, productId, userId, reason, status, createdAt (F10)
- **Последствия**: Subcollection за ревюта пази продукта самочетим в списъци; votes са 1-на-1 с userId (upsert = toggle). Няма лимитиране до 1 ревю на потребител в схемата — ограничението се валидира в домейна (ReviewService) и се обезпечава от Security Rules по `request.resource` + съществуващ документ на потребителя.

## D-005 · Архитектура — Hexagonal / Clean Architecture

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: PRD §4 — домейн логиката трябва да е изолирана от Firebase SDK.
- **Решение**: Три слоя:
  1. `src/core/domain` — entities (чисти TS типове), ports (интерфейси за репозитории/auth gateway)
  2. `src/core/usecases` — application services (CatalogService, ProductService, ReviewService, VoteService, AuthService, ModerationService) — само домейн, без Firebase imports
  3. `src/infra` — адаптери (Firestore репозитории, Firebase Auth gateway), DI контейнер `src/infra/di.ts`
  4. `src/presentation` — React компоненти/страници, използват само услугите през DI
- **Последствия**: Firebase е заменяем адаптер; тестовете могат да inject-ват фалшиви репозитории. Цената: малко повече boilerplate.

## D-006 · Дизайн система

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: `docs/03-design/design-system.html` (v2.0) задава пълна система.
- **Решение**: Прилагам токъните 1:1: палитра (oat/berry/carrot/sage/rose), шрифтове (Unbounded display, Golos Text body, Caveat accent), Material Symbols Rounded (без емоджита), радиус-система, сенки, всички компоненти (chips, tabs, badges, stamp, vote, cards, skeleton, empty state, modal, toasts, bottom nav, таблици).
- **Последствия**: Единен `design-system.css` с CSS custom properties; компонентите в React използват само тези класове/токъни.

## D-007 · Управление на състоянието

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: Изисква се auth state + данни от Firestore; PRD: pagination/infinite scroll.
- **Решение**: React Context за auth (`AuthProvider`) + персонализирани hooks за данни (`useProducts`, `useProduct`, `useReviews`...), използващи onSnapshot/query през услугите. Без външна state библиотека (Redux/Zustand) за MVP — слойът на услугите дава точка на миграция.
- **Последствия**: По-малко зависимости; streaming updates от Firestore.

## D-008 · Категории — конфигурируеми от admin

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: PRD §3.1 — категориите са dropdown, конфигурируеми от admin панел, не hardcode.
- **Решение**: Категориите са документи в `categories/{id}`. Seed скрипт (`scripts/seed.ts`) създава първоначалните категории. Admin панел (F6) показва само продукти за одобрение за MVP; CRUD на категории остава през seed/бъдеща фаза (записано в PRD като конфигурируемо).
- **Последствия**: Каталогът никога не ползва захардадени стрингове за категория — винаги `categoryId` → документ.

## D-009 · Сигурност — Firestore Security Rules

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: PRD §4 сигурност + таблица с роли (§5).
- **Решение**: Правила в `firestore.rules`:
  - Четене на продукти: само `status == 'approved'` за гости; модератор/админ вижда всичко.
  - Запис на продукт: логнат потребител, `status` винаги `pending` (полето се forbids за клиент); само admin пише `status`.
  - Ревюта: 1 на потребител на продукт (проверка `!exists(/databases/$(database)/documents/products/$(pid)/reviews/$(uid))`), само `visible` за клиент, само автор редактира.
  - Гласове: само логнати, документ = userId, `type` ∈ {up, down}.
  - Потребители: само собствения си документ, `role` не може да се променя от клиент.
- **Последствия**: Двустепенна защита — домейн + rules.

## D-010 · Изчислителни полета (avgRating / netScore) — aggregate-on-write с транзакции

- **Дата**: 2026-08-18
- **Статус**: Прието (ревизирано)
- **Контекст**: D-003. Първоначално планирах read-then-recompute транзакции, но Firebase web SDK v11 поддържа само `tx.get(documentRef)` — няма `tx.get(query)`, което би означавало неатомарни read+write.
- **Решение**: Дернвирани полета се поддържат с атомарни increments в самите writes:
  - `products/{id}.ratingSum` + `.reviewsCount` — при create/update/delete на ревю (transaction: `increment(rating)` / `increment(-rating)`).
  - `avgRating` се изчислява при четене в mapper-а: `ratingSum / reviewsCount` (закръглено до 0.1).
  - `reviews.upvotes` / `.downvotes` / `.netScore` — при cast/toggle/clear на глас (transaction с `increment`, делтите се изчисляват от предишния глас на същия потребител).
- **Последствия**: Без гонки между няколко потребители (всеки пише само своя глас/ревю), пълен атомизъм, без read-ahead. Сортиранията работят по полетата.

## D-011 · Сигурност — компромис за агрегати в Security Rules

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: Транзакциите на ревю/глас обновяват агрегатни полета (ratingSum/reviewsCount/upvotes/downvotes/netScore). Rules-ът не може да провери дали update-ът идва заедно с ревю запис в същата транзакция.
- **Решение**: Rules позволяват на всеки логнат потребител да променя само агрегатните полета (проверка `affectedKeys().hasOnly([...])` + типове). Всички останали полета на продукти/ревюта остават строго ограничени.
- **Последствия**: Малък риск от манипулация на числата от злонамерен потребител; приет за MVP. Миграция в бъдеще: Cloud Functions trigger, който да премахне клиентския достъп до агрегатите.

## D-012 · Admin provisioning — self-promotion за конкретен имейл

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: Трябва да има admin акаунт (email+парола). Ролите са защитени от промяна от клиента (D-009), а първият потребител вече съществуваше като `user`.
- **Решение**: Два механизма в `firestore.rules`:
  1. Bootstrap — първият документ в празна `users` колекция може да е `admin`.
  2. `isBootstrapAdminEmail()` — хардкоднат имейл (`admin@mamaizbira.com`) може да си създаде/промени собствената роля до `admin`.
- **Инструмент**: `npm run seed:admin -- <email> <password>` (`scripts/create-admin.ts`) — регистрира през Auth REST API (само с web API key), влиза с web SDK и записва `users/{uid}` с role `admin`. Паролата се генерира при липса на подадена.
- **Последствия**: Замяната на имейла в rules-а е единствената стъпка за нов admin. Админът с данни: `admin@mamaizbira.com` (виж handoff.md за паролата).

## D-013 · Разширен админ панел — продукти, доклади, категории

- **Дата**: 2026-08-18
- **Статус**: Прието
- **Контекст**: F6 (одобрение) беше покрито, но F10 (доклади) създаваше документи без обработка, а PRD §3.1 изисква категориите да са конфигурируеми от admin панел.
- **Решение**: `/admin` вече е панел с три таба:
  - **Продукти** — опашка за одобрение (approve/reject с причина).
  - **Доклади** — live опашка от `reports/`, преглед на причина + цитат от ревюто, действия „Премахни ревюто“ (setRemoved + markHandled) или „Без действие“ (markHandled). Четене/обработка — модератори.
  - **Категории** — списък с икона/статус/ред + добавяне на категория и архивиране/активиране (само admin; `isAdmin` в домейна + rules).
- **Нови компоненти**: `ReportRepository`, `ModerationService`, табове в `src/presentation/pages/admin/`.
- **Последствия**: Докладите имат статус `new`/`handled`; правилата позволяват update на `status/handledBy/handledAt` от модератор.

## D-014 · Fix на Firestore rules — scope на `$(database)`, collection group и индекси

- **Дата**: 2026-10-05
- **Статус**: Прието
- **Контекст**: При вход като admin приложението хвърляше `permission-denied` + `INTERNAL ASSERTION FAILED` от Firestore SDK. Rules Test API показа: `Call to service function 'get' occurs outside of defining scope` и `Invalid variable name: database`. Помощните функции (`isRole`, `isModerator`, `isAdmin`) бяха дефинирани **извън** `match /databases/{database}/documents`, затова `$(database)` беше невалидна → `get()` винаги гърмеше → `isAdmin()`/`isModerator()` винаги `false`. Допълнително липсваха всички composite индекси, така че дори разрешените заявки (каталог, профил, pending) връщаха `FAILED_PRECONDITION`.
- **Решение**:
  1. Функциите са преместени **вътре** в `match /databases/{database}/documents` (валиден scope за `$(database)`).
  2. Добавено е правило `match /{path=**}/reviews/{reviewId}` за collection group заявки (Firestore изисква изричен recursive wildcard — иначе `collectionGroup('reviews')` се отказва).
  3. `products` list и `reviews` read вече позволяват на собственика (`resource.data.createdBy/userId == request.auth.uid`) — заявките в профила филтрират по тези полета, така че правилата са изпълними.
  4. Добавен е `firestore.indexes.json` (5 индекса: products по status/createdBy + createdAt; reviews по status + createdAt и collection group по userId + createdAt).
  5. `onSnapshot` слушателите имат error callbacks, за да не чупи SDK-то при евентуален отказ.
- **Последствия**: Admin панелът (продукти/доклади/категории) и профилът вече работят; каталогът/ревютата връщат данни. Правилата и индексите се публикуват с `firebase deploy --only firestore:rules,firestore:indexes`.

## D-015 · Seed данни за цялото приложение (data-driven)

- **Дата**: 2026-10-05
- **Статус**: Прието
- **Контекст**: Приложението беше празно (само категории) и не можеше да се демонстрира. Клиентът поиска seed на цялото приложение без hardcode-нати данни.
- **Решение**:
  - Цялото съдържание живее в `scripts/seed-data.json` (категории, потребители, продукти, ревюта, гласове, доклади). В кода няма литерални продуктови/ревю данни.
  - `scripts/seed.ts` е идемпотентен и минава през реалните услуги (`getServices()`), за да се поддържат агрегатите `ratingSum/reviewsCount/netScore` и да се спазват правилата. Не създава `DEFAULT_CATEGORIES` — списъкът е премахнат от `entities/category.ts` и е в JSON.
  - Демо акаунти (роля `user`) се регистрират през Auth REST (без верификационни имейли), паролата идва от `SEED_PASSWORD`; admin — от `ADMIN_EMAIL/ADMIN_PASSWORD`. Няма hardcode-нати пароли.
  - `npm run seed -- --check` валидира данните без мрежови заявки.
- **Придружаващ fix**: при създаване на ревю транзакцията чете още несъздадения `reviews/{uid}` документ. Правилото достъпваше `resource.data` при `resource == null`, което отказваше операцията за обикновени потребители. Коригирано е на `reviewUserId == request.auth.uid` (първи клон) + `resource != null` guards.
- **Последствия**: 16 одобрени + 2 pending + 1 отказан продукт, 28 ревюта, 52 гласа, 2 доклада, 6 users. Всички екрани имат реалистично съдържание.

---

## Отхвърлени алтернативи

- **Backend-as-code (Node/Express + PostgreSQL)**: извън изискването на клиента (Firebase).
- **Cloud Functions за преизчисляване**: изискването „only firebase firestore“ ги изключва за MVP.
- **MongoDB/друга DB**: противоречи на заданието.
- **Emoji за икони**: дизайн системата изрично забранява.
