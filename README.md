# 🌿 PlanTree Platform

**PlanTree** is a community-driven urban forestry platform built with **React**, **Node.js + Express**, **PostgreSQL + Drizzle ORM**, **Clerk Authentication**, and **Cloudinary**.

---

## 🏗️ Architecture Design (Feature/Module-Based)

```text
PlanTree/
├── client/                      # React Frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/         # Map (CARTO Voyager tiles), Header, Tree Drawers & Modals
│   │   ├── services/           # Axios API client
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── server/                      # Express Backend (Modular Domain Architecture)
│   ├── src/
│   │   ├── common/             # Cross-cutting concerns & shared utilities
│   │   │   ├── config/         # Environment variables validation
│   │   │   ├── db/             # Drizzle PostgreSQL schema & connection pool
│   │   │   ├── middlewares/    # Clerk authentication & Multer upload
│   │   │   └── services/       # Cloudinary file storage service
│   │   │
│   │   ├── module/             # Feature Modules (Domain Driven)
│   │   │   ├── user/           # User Module (sync, profile)
│   │   │   ├── tree/           # Tree Module (register, update, delete, map queries)
│   │   │   ├── care/           # Care Module (watering logs, care history timeline)
│   │   │   ├── drive/          # Community planting drives (admin-created)
│   │   │   ├── admin/          # Admin stats & listings (admin-only)
│   │   │   └── maps/           # Rate-limited geocoding / places proxy
│   │   │
│   │   └── server.ts           # Express Application Entrypoint
│   ├── drizzle.config.ts
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## 🚀 How to Run

### 1. Backend (`/server`)

```bash
docker compose up -d        # Postgres on :5555 (repo root)
cd server
cp .env.example .env        # fill in the Clerk keys
npm install
npm run db:push             # create/update tables
npm run dev
```
> Server running on [http://localhost:5000](http://localhost:5000).

### 2. Frontend (`/client`)

```bash
cd client
npm install
npm run dev
```
> Client running on [http://localhost:5173](http://localhost:5173).

---

## 🔐 Authentication & Admins

- **Clerk is the only way to sign in.** The API identifies users exclusively from the verified Clerk session token; headers like `x-user-id` are ignored. Without `CLERK_*` keys every protected route returns 401.
- **Three roles, stored in the database** (`users.role`) and checked by the server on every request:

  | Role | Can do |
  |---|---|
  | `USER` (default) | Plant trees, log every kind of care, see the map and trees |
  | `TEAM_MEMBER` | Everything a user can, plus **see the planting drive schedule** (drives page, map pins, shared drive links, live walks) |
  | `ADMIN` | Everything a team member can, plus the Admin area: users, trees, scheduling drives, and changing people's roles |

- **Changing roles:** admins use **Admin → Users** and pick a role for each person (you can't change your own, so there is always an admin). The first admin has to be set once in the database:
  ```sql
  UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
  ```
- **Phone numbers:** anyone can add an optional phone number on their Account page. It is **not verified** (no code is sent) and is only visible to the person and to admins; it never appears in public tree, care or drive data. Admins can open any user's profile from **Admin → Users** (details, phone, role, trees planted, care activity) and search users by name, email or phone.
- Admin routes (`/api/v1/admin/*`) and drive creation (`POST /api/v1/drives`) require `ADMIN`. Reading drives (`GET /api/v1/drives…`) requires `TEAM_MEMBER` or `ADMIN`.

## 🌱 Care schedules

Each tree has three schedules, set when it is planted and editable later: **water every N days** (default 7), **fertilise every N days** (default 60) and **remove the grass every N days** (default 30). A tree "needs water" once it is past its own watering interval. Every care action (watered, fertilised, grass removed, pruned, checked) is logged with its date, time and who did it, and the tree shows when each task is next due.
- Live location: anyone can watch a tracking room, but only signed-in sockets can broadcast, and the broadcaster's identity comes from their token.
