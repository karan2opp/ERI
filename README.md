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
│   │   │   ├── drive/          # Plantation and clean-up drives (admin-created)
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
> Client running on [https://localhost:5173](https://localhost:5173).

**Trusted dev certificate (recommended).** The dev server uses HTTPS (the camera and location need it). With the default self-signed certificate Chrome caches nothing, so every reload downloads all the map tiles again. A locally trusted certificate fixes that:

```bash
winget install FiloSottile.mkcert     # or: choco install mkcert / brew install mkcert
mkcert -install                       # trust mkcert's local authority (Windows asks you to confirm)
cd client && mkdir .cert
mkcert -cert-file .cert/localhost.pem -key-file .cert/localhost-key.pem localhost 127.0.0.1 ::1
```

Restart `npm run dev` and it picks the certificate up from `client/.cert` (git-ignored). Without it, the dev server falls back to the self-signed one. Phones opening the dev site by your computer's IP still see a certificate warning unless you also install mkcert's authority on the phone.

---

## 🏠 Pages

| Address | What |
|---|---|
| `/` | The public home page: hero photo, how it works, upcoming public drives and how to join in |
| `/map` | The tree map and the app (`/map?open=drives` opens on the Drives page) |
| `/?drive=<id>` | A drive's own page (the link people share) |

The home page has four number boxes: **trees planted**, **plantation drives**, **clean-up drives** and **waste collected**. The server counts the first three (`GET /api/v1/stats`, public: verified trees, and drives that have passed or been marked completed, by type); **waste collected** is a number admins keep up to date in **Admin → Settings → Waste collected** (kilograms), since nothing else records it. The header has the same profile menu as the map (sign in, or your avatar with My trees, Drives, Account and Admin, which open inside the app at `/map?open=…`). On Vercel, `client/vercel.json` sends every path to the app so `/map` works after a reload.

**Join the team.** Admins paste the link to a Google Form in **Admin → Settings → Join the team form** (it must start with `https://`). While a link is set, the home page shows a **Join the team** button beside **Open the tree map** at the top, a **Join the team** card in Get involved and a button in the closing banner, all opening the form in a new tab; with no link, neither shows. The link is public (`GET /api/v1/site`) and stored in `app_settings`, so nothing needs a migration.

**Donate page, footer and contact details.** `/donate` explains what donations pay for and has a **Donate on WhatsApp** button that opens a chat with the team (with a message ready to send). The footer of the home and Donate pages has Instagram, YouTube, a contact email and phone. Admins fill these in under **Admin → Socials**. Until each one is set, the footer shows it greyed out as "coming soon" and the Donate button stays switched off. Links must start with `https://`, and phone numbers are tidied to `+91…` form. They are public through `GET /api/v1/site` and stored in `app_settings`, so nothing needs a migration.

## 🔔 The bell (in-app notifications)

Signed-in people have a bell on the map and in the home page header, with how many notifications they haven't read and the list (10 at a time from the server). New ones arrive live over the app's socket connection, the bell swings and a soft chime plays (made in the browser; it can be switched off per device in the list, and browsers only allow sound after the first tap on the page). Tapping one marks it read and opens it.

| What | Who gets it | Tapping it opens |
|---|---|---|
| A drive is scheduled | The people the admin chose to tell (team, or everyone; nobody for "Don't send"), not the admin who scheduled it | The drive's page |
| Someone new signs up ("Karan joined") | Admins and super admins | That person's profile in Admin |
| A tree is planted ("Karan planted a new tree") | Admins and super admins, not the planter | The tree on the map, or Admin → Review if it is waiting for review |

Routes: `GET /api/v1/notifications/inbox?page=`, `GET …/inbox/unread-count`, `POST …/inbox/:id/read`, `POST …/inbox/read-all` (your own only). Each signed-in socket joins the room `user:<id>`. Needs the new `notifications` table (`npm run db:push`).

## 🔐 Authentication & Admins

- **Clerk is the only way to sign in.** The API identifies users exclusively from the verified Clerk session token; headers like `x-user-id` are ignored. Without `CLERK_*` keys every protected route returns 401.
- **Four roles, stored in the database** (`users.role`) and checked by the server on every request:

  | Role | Can do |
  |---|---|
  | `USER` (default) | Plant trees, log every kind of care, see the map and trees |
  | `TEAM_MEMBER` | Everything a user can, plus **see team-only drives** (drives page, map pins, shared drive links, live walks) |
  | `ADMIN` | Everything a team member can, plus the Admin area: users, trees, reviewing photos, scheduling drives, changing a drive's type or visibility, **Settings**, and moving people between user and team member. **Admins see every drive.** |
  | `SUPER_ADMIN` | Everything an admin can, plus making someone an admin or super admin and changing or demoting admins |

- **Changing roles:** admins use **Admin → Users** and pick a role for each person; only a super admin can make or change an admin. You can't change your own role, so there is always someone at the top. The first super admin has to be set once in the database:
  ```sql
  UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'you@example.com';
  ```
- **Names are unique** (capital letters and extra spaces don't count). When someone signs up with a name that is taken, they become "Name 2", "Name 3" and so on, and that name is saved in Clerk too. Changing a name goes through the server (`PUT /api/v1/users/me/name`), which refuses a taken name with a 409, and a unique index on `lower(name)` backs it up in the database. Run `npm run db:push` for the index; if two existing users share a name, rename one first.
- **Admins see a user's sign-in ID only if they are a super admin** (the User ID line on a profile in Admin → Users).
- **Phone numbers:** anyone can add an optional phone number on their Account page. It is **not verified** (no code is sent) and is only visible to the person and to admins; it never appears in public tree, care or drive data. Admins can open any user's profile from **Admin → Users** (details, phone, role, trees planted, care activity) and search users by name, email or phone.
- Admin routes (`/api/v1/admin/*`) and drive creation (`POST /api/v1/drives`) require `ADMIN`. Reading drives (`GET /api/v1/drives…`) is open to anyone but filtered by who is asking (see below).

## 🌳 Drives: types and visibility

Every drive has a **type** and a **visibility**, both set by an admin when scheduling it and changeable later (`PATCH /api/v1/drives/:id` with `{ type?, visibility? }`).

| | Values |
|---|---|
| Type | `PLANTATION` (tree plantation drive, brown sprout pin) or `CLEANUP` (clean-up drive, purple bin pin) |
| Visibility | `ALL` (everyone, including signed-out visitors) or `TEAM` (team members and admins only). New drives default to `TEAM` so nothing is public by accident. |

Signed-out visitors and normal users see only `ALL` drives; team members see `ALL` and `TEAM`; admins see everything. The server applies this to the list, the calendar, a single drive (a `TEAM` drive answers 401 signed out and 403 for a normal user) and the live-walk socket rooms.

## 🔔 Drive notifications

Admins can **edit and delete drives** (open a drive from Admin → Drives → Edit drive / Delete drive). Scheduling, editing and deleting a drive can tell people about it by **email** and **push notification**. You choose who: *Team members* (team members and admins), *Everyone* (every user; only offered for drives visible to everyone, so a team-only drive can't leak), or *Don't send*. Editing a drive's date, time or place suggests telling team members by default.

- People manage this themselves in **Account → Notifications**: turn drive emails off, and turn push on or off for each device. Opting out is always respected.
- **Email** goes through [Resend](https://resend.com): set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain you verified in Resend). Without them nothing is emailed and the rest keeps working.
- **Push** uses Web Push: make keys with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Tapping a notification opens the drive. On iPhones push only works once the app is added to the Home Screen.
- Set `APP_URL` to the public address so links in emails are right (it defaults to the first `CLIENT_ORIGIN`).
- Sending happens in the background after the admin's save, so a big audience never makes the page wait. Push subscriptions the browser reports as gone are removed automatically.

## ✅ Completing a drive: summary and pictures

After a drive, an admin opens it (Admin → Drives, or the Drives page) and uses **Wrap up this drive**: write a **summary** of how it went, add **pictures** from the phone or computer, and tap **Mark as completed**. Until then the summary and pictures are a draft that only admins can see; the drive stays in the normal list.

- **Who sees the result:** everyone who can see the drive, once it is completed. A drive for everyone shows its summary and pictures to anyone (even signed out, including on its share link); a team-only drive shows them only to team members and admins. The server enforces this for the drive, the list and the pictures route, so a team-only drive's pictures never reach anyone else.
- **How many pictures:** admins choose in **Admin → Settings → Drive pictures** (1 to 50, default 10). The server refuses a picture past the limit, even for several uploads at once. If the limit is lowered below what a drive already has, it keeps its pictures but can't get more until some are removed.
- **Changing pictures:** each picture has a **replace** button (swap it for another, keeping its place) and a **remove** button (asks first); only admins see them, and the server refuses anyone else (`PUT` and `DELETE /api/v1/drives/:id/photos/:photoId`).
- **After completing:** the drive moves from *Upcoming* to *Past* (history) and gets a *Completed* badge. An admin can still rewrite the summary, add or remove pictures, or **Reopen** the drive, which hides the summary and pictures from everyone but admins again. A completed drive can't have its summary emptied.
- Pictures are JPG, PNG or WEBP up to 10 MB, stored in Cloudinary (`plantree/drives`) and removed from there when a picture or the drive is deleted. They are not sent to the AI photo check, since only admins add them.

| Route | What |
|---|---|
| `PATCH /api/v1/drives/:id` `{ summary }` | Admin: save the summary (a draft until completed) |
| `POST /api/v1/drives/:id/photos` (multipart `photo`) | Admin: add a picture, up to the limit |
| `DELETE /api/v1/drives/:id/photos/:photoId` | Admin: remove a picture |
| `POST /api/v1/drives/:id/complete` `{ summary? }` and `/reopen` | Admin: complete a drive (needs a summary) or undo it |
| `GET /api/v1/drives/:id/photos?page=&limit=` | Pictures, 10 per page (up to 50), if you may see the drive and it is completed (admins always) |

New drive columns (`status`, `summary`, `completed_at`, `completed_by`) and the `drive_photos` table need `npm run db:push`.

## 🔑 Passwords

Account → **Change password** is only shown to people who have a password. Someone who signs in with Google alone has none, so they see no password section. People with a password can change it with their current one, or choose **Forgot your password? → Email me a code**: a 6-digit code is emailed to their address (it works for 10 minutes, is stored only as a hash, is used up once, and stops working after 5 wrong tries; a new code can be requested once a minute and 10 requests an hour are allowed). Clerk won't start its own email reset for someone who is already signed in, so the server sends and checks the code (`POST /users/me/password-reset` and `/confirm`) and sets the new password through Clerk. This needs email set up (`RESEND_API_KEY` and `EMAIL_FROM`); other devices are signed out afterwards. Run `npm run db:push` for the new `password_reset_codes` table.

## 🌳 Tree categories

The "kind of tree" people pick when planting is a **category that admins manage** (Admin → Categories: add, rename, delete; the list pages 10 at a time with search). Planting and editing use a searchable select box that loads 10 at a time from the server. Renaming a category updates the trees in it. Deleting one leaves its trees on the map with the name they had, but no longer listed under a category.

Anyone (signed out too) can read them, all paged on the server (10 per page, up to 50):

| Route | What |
|---|---|
| `GET /api/v1/categories?page=&limit=&search=` | The categories, A to Z, each with its verified tree count |
| `GET /api/v1/categories/:id` | One category |
| `GET /api/v1/categories/:id/trees?page=&limit=` | Verified trees in it, with the same filters as `/trees/browse` (search, distance, status, sort). `/trees/browse?categoryId=` works too |

Admins change them with `POST /categories`, `PATCH /categories/:id` and `DELETE /categories/:id`. The first time the server starts it adds the 8 starting categories (Neem, Peepal, Banyan, Mango, Jamun, Ashoka, Gulmohar, Jacaranda) and links existing trees to the one with their name. That happens once, so categories an admin deletes don't come back. After pulling this change run `npm run db:push` (new `tree_categories` table and `category_id` column).

## 📸 Photo check and planting rules

A tree is only registered when two things hold, both checked **on the server**:

1. **You are at the tree.** There is no map to set a location on: you stand next to the tree and tap **Confirm location**, and the tree is registered exactly where you are standing. The app listens to your GPS for a few seconds and averages the readings (trusting the accurate ones more), so the spot is as close as the phone can manage. The location has to be accurate to 20 m or better, and if you walk more than 15 m away after confirming you are asked to confirm again. The app sends that reading with the tree and the server checks it again (`deviceLatitude`, `deviceLongitude`, `deviceAccuracy`; limits in `server/src/common/utils/treePolicy.ts`). Phone GPS is typically good to 3 to 5 m in the open, and worse under trees or near buildings.
2. **The photo shows a tree or plant.** A photo is required and is checked by an OpenAI vision model (`server/src/common/services/treeVerifier.ts`), which can only answer one of three things:

   | Answer | What happens |
   |---|---|
   | `true` | It is a tree or plant: registered and on the map straight away |
   | `false` | It is not: the photo is rejected (HTTP 422) and nothing is saved or uploaded |
   | `pending` | The model is not sure: the tree is saved as `PENDING` and stays off the map until an admin approves or rejects it in **Admin → Review** |

   A missing `OPENAI_API_KEY`, a timeout, an API error or an unexpected answer all count as `pending`, so a tree is never approved by accident. Pending trees are visible only to their owner (My trees → "Awaiting review") and admins, and can't be cared for until approved. Replacing a tree's photo runs the same check. Each person can send 30 photos an hour, since every check costs money.

**Whose photos are checked** is a setting in **Admin → Settings** (admins and super admins only; nobody else sees it): *check users* (on by default) and *check team members* (off by default). Admins and super admins are never checked. A photo that isn't checked is accepted as it is and costs nothing. The 15 m rule always applies.

Set it up with `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`) in `server/.env`, then run `npm run db:push` for the new `verification_status` columns and the `app_settings` table.

## 🌱 Care schedules

Each tree has three schedules, set when it is planted and editable later: **water every N days** (default 7), **fertilise every N days** (default 60) and **remove the grass every N days** (default 30). A tree "needs water" once it is past its own watering interval. Every care action (watered, fertilised, grass removed, pruned, checked) is logged with its date, time and who did it, and the tree shows when each task is next due.
- Live location: anyone can watch a tracking room, but only signed-in sockets can broadcast, and the broadcaster's identity comes from their token.

**Editing a tree.** The person who planted a tree (a normal user or a team member) can edit its details from **My trees → Edit** or from the tree on the map: photo, name, kind, address, notes, health, planting date and care intervals, including while it is waiting for review. Admins and super admins can edit or remove any tree. **Photos can only be changed by the tree's owner or an admin** (the server checks it, so team members and other users get a 403): the tree's main photo is replaced in **Edit** (a tree always has one, so to get rid of it the whole tree is deleted), and the photo on any care entry in the tree's history can be **retaken** with the camera or **removed** (`PUT` and `DELETE /api/v1/trees/:treeId/care/:logId/photo`; the entry itself stays). Replacing a tree's photo also clears the copy of the old photo on its planting entry, so no broken picture is left behind.

**When care can be logged.** Watering, fertilising and removing grass are locked until **one day before they are due**: a tree watered every 5 days can be watered again from day 4, so tapping Water over and over can't log it repeatedly. The buttons show when they open ("Water in 4 d"). The interval is set by whoever plants the tree (and can be changed later in Edit); **admins and super admins can change any tree's schedule, edit or remove any tree, and log care at any time**. Pruning and checking have no schedule, so they are never locked. The server enforces this (a locked request gets a 409 `TOO_SOON` with when it opens), and two taps at the same moment can't both get through. Nothing needs `db:push` for this.

