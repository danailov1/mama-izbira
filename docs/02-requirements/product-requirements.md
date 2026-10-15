# Product Requirements Document (PRD) — мамаИзбира

## 1. Резюме

мамаИзбира е платформа за ревюта на детски продукти, изградена по модел каталог → продукт → ревюта → гласуване (подобно на Reddit за оценяване на полезността на ревютата).

## 2. Цели

- Родителите да намират бързо надеждни, реални мнения за детски продукти преди покупка.
- Изграждане на модериран, но общностно-захранван каталог (crowdsourced, но с admin gate за нови продукти).
- Мобилно-първо изживяване (повечето родители browse-ват от телефон).

## 3. Обхват на MVP

### 3.1 Категории продукти (dropdown при добавяне)

- Бебешки колички
- Столчета за хранене
- Кошчета за кола (автокошове)
- Други кошчета/шезлонги
- Шишета за хранене
- Бебешка формула (мляко)
- Пюрета и друга бебешка храна
- Играчки
- Друго

*(списъкът е конфигурируем от admin панел, не hardcode-нат в UI)*

### 3.2 Модел на данните (на високо ниво)

**Product**
- id
- brand (марка) — string
- model (модел) — string
- category — enum/reference към категория
- imageUrl — string (по избор)
- status — `pending` | `approved` | `rejected`
- createdBy — userId
- createdAt
- avgRating — computed
- reviewsCount — computed

**Review**
- id
- productId — reference
- userId — reference
- rating — integer 1-5
- text — string (детайлно описание)
- upvotes — count
- downvotes — count
- netScore — computed (upvotes - downvotes)
- createdAt / updatedAt
- status — `visible` | `removed`

**Vote**
- id
- reviewId — reference
- userId — reference
- type — `up` | `down`
- *(ограничение: 1 vote на user на review — upsert/toggle)*

**User**
- id
- displayName
- email
- role — `user` | `moderator` | `admin`
- createdAt

### 3.3 Функционални изисквания

| # | Изискване | Приоритет |
|---|---|---|
| F1 | Разглеждане на каталог по категории | Must |
| F2 | Търсене по марка/модел | Must |
| F3 | Страница на продукт с ревюта, средна оценка, сортиране по net score | Must |
| F4 | Регистрация/логин (email+парола; social login по избор) | Must |
| F5 | Добавяне на нов продукт → влиза в опашка `pending` | Must |
| F6 | Admin панел за одобрение/отхвърляне на продукти | Must |
| F7 | Писане на ревю (1 на потребител на продукт) | Must |
| F8 | Редакция/изтриване на собствено ревю | Must |
| F9 | Upvote/downvote на ревюта (само логнати) | Must |
| F10 | Докладване (report) на ревю | Should |
| F11 | Admin премахване на ревю | Should |
| F12 | Autocomplete/търсене за дубликати при добавяне на продукт | Should |
| F13 | Профил на потребител (мои ревюта, мои добавени продукти) | Should |
| F14 | Снимки на продукт (upload) | Could |
| F15 | Филтриране по оценка | Could |

### 3.4 Извън обхвата на MVP (бъдещи фази)

- Сравнение на продукти един до друг (compare view)
- Модериране с ML/AI филтър за спам
- Партньорски линкове/monetization (afiliate links към магазини)
- Push нотификации
- Многоезичност (само български за MVP)

## 4. Нефункционални изисквания

- **Mobile-first**: дизайнът се проектира първо за мобилен viewport, после се разширява за desktop.
- **Архитектура**: Hexagonal / Clean Architecture — domain логиката (продукти, ревюта, гласуване, правила за одобрение) е изолирана от Firebase SDK, за да може backend-ът да се смени в бъдеще без пренаписване на бизнес логиката. Firebase (Firestore/Auth) се третира като "adapter"/infrastructure слой зад portове (interfaces).
- **Backend**: Firebase (Firestore за данни, Firebase Auth за автентикация, Cloud Functions за server-side логика като преизчисляване на avgRating/netScore).
- **Frontend**: React (компонентна структура, ясно разделение на presentation vs. domain логика).
- **Сигурност**: Firestore Security Rules — само logged-in потребители пишат ревюта/гласове; само admin роля пише в `status` полето на продукт.
- **Performance**: pagination/infinite scroll на списъци с продукти и ревюта.
- **Достъпност**: базови a11y стандарти (контраст, alt текстове, keyboard navigation).

## 5. Роли и права

| Действие | Гост | User | Moderator/Admin |
|---|---|---|---|
| Разглежда каталог | ✅ | ✅ | ✅ |
| Търси/филтрира | ✅ | ✅ | ✅ |
| Регистрация | ✅ | — | — |
| Пише ревю | ❌ | ✅ | ✅ |
| Гласува (up/down) | ❌ | ✅ | ✅ |
| Добавя продукт (pending) | ❌ | ✅ | ✅ |
| Одобрява/отхвърля продукт | ❌ | ❌ | ✅ |
| Премахва ревю | ❌ | само своето | всяко |

## 6. Метрики за успех (KPIs)

- Брой одобрени продукти в каталога
- Брой ревюта на продукт (средно)
- Retention на регистрирани потребители (връщат ли се да пишат второ ревю)
- % на нови продукти, одобрени в рамките на 48 часа
