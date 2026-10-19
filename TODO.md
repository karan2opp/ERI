# Earth Revival Initiative: plan and to-do list

Last updated 2026-10-19. Hosting plan: client on Vercel, server on Render, Postgres on a managed host.

## Done recently

- [x] Roles: user, team member, admin, super admin (server-enforced)
- [x] Plantation and clean-up drives, with visibility (everyone / team only)
- [x] Edit and delete drives (admins)
- [x] Email (Resend) and push (Web Push) notifications for new, changed and cancelled drives, with a choice of audience: don't send / team members / everyone. People can turn emails off and manage push in Account > Notifications
- [x] Photo check with OpenAI, planting within 15 m, admin review queue, settings for whose photos are checked
- [x] Map loads only what's in view: `GET /trees/pins` (pins in view, clusters when zoomed out or past 500 trees, every tree within 100 m / 500 m / 1 km), filters on the server, location indexes, 30-second browser caching. The old `GET /trees` (every tree) is removed. Tested with 50,000 trees: 4 to 13 ms and a few KB per answer, against 31.6 MB before

## Needs you (keys and accounts)

- [ ] **Cloudinary keys** in `server/.env` (until then every tree photo is a random stock image)
- [ ] **Resend**: create an account, verify your domain, set `RESEND_API_KEY` and `EMAIL_FROM` (until then no email is sent; push still works)
- [ ] **Push keys for production**: run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on Render (the keys in your local `.env` are for development only)
- [ ] **Clerk production instance** keys (the current ones are development keys)

---

## Map loading: done, and what's left

Built (see "Done recently"). Still open, only when traffic needs it (not needed for 20 to 40 users):
- [ ] Tile-shaped pin URLs plus a CDN (Cloudflare in front of Render), so people in the same area share cached answers
- [ ] Redis, only if monitoring shows the database is the bottleneck

---

## To-do: improvements, by area

### Map and trees (the items you pasted; for later)
- [ ] Share a single tree: a link and a printable QR tag for the trunk that opens the tree's page (`/?tree=<id>`)
- [ ] Public home for visitors: live totals ("2,431 trees planted"), species counts, a leaderboard
- [ ] Tree life events: mark a tree dead or replaced, and a growth photo timeline
- [ ] Report a wrong tree or a bad photo; ban a bad user; an admin activity log (who did what, when)

### Drives (waiting on your first real drives)
- [ ] Store results: for a clean-up, kilograms collected, bags filled and before/after photos; for planting, how many trees. Waiting until you've run a real one so we record the right things
- [ ] Impact summary and downloadable report (not needed for now)
- [ ] Check-in on the day, and linking trees to drives (not needed for now)
- [ ] Sign-up ("I'm coming"), attendee list and capacity limit
- [ ] Reminders the day before a drive (needs a scheduled job; Render cron job)

### Notifications
- [ ] Tell a person when their pending tree is approved or rejected
- [ ] "Your tree needs water" reminders from the care schedules
- [ ] Mobile app push (Expo) when the mobile app is built
- [ ] Notification history for admins (who was told what, how many emails failed)
- [ ] Unsubscribe link inside emails that works without signing in

### Hosting (Vercel for the client, Render for the server)
- [ ] Vercel: set `VITE_API_URL` (the Render address plus `/api/v1`; live walking also connects there, since Vercel can't forward WebSockets) and `VITE_CLERK_PUBLISHABLE_KEY`; add a rewrite so deep links like `/?drive=...` open the app; `sw.js` must be served from the site root
- [ ] Render: set every variable from `server/.env.example`; set `CLIENT_ORIGIN` to your real domain(s) (comma-separated) and `APP_URL` to the public address so links in emails are right; set `TRUST_PROXY=1`
- [ ] **First month on Render's free plan:** keep it awake with a free outside pinger (cron-job.org or UptimeRobot) calling `GET https://<your-render-app>.onrender.com/api/v1/health` every **10 minutes** (free services sleep after 15 minutes idle). The health check doesn't touch the database, so Neon can still sleep. Keep only this one free service in the Render workspace: a service awake all month uses about 744 of the 750 free hours
- [ ] **After the first month:** move the server to Render's paid instance or your own VM (free services can be restarted at any time, which drops live walks)
- [ ] Neon Postgres: on Render set `DATABASE_URL` to Neon's **pooled** address (host has `-pooler`, add `?sslmode=require`); for schema changes set `DATABASE_URL_DIRECT` to the **direct** address and run `npm run db:push` once from your machine. Turn on Neon's backups/branching retention
- [ ] A real domain with HTTPS on both sides, and your domain verified in Resend
- [ ] Error tracking (for example Sentry) and uptime monitoring

### Quality
- [ ] Automated tests and CI: the checks I run by hand (roles, drive visibility, photo check, notifications) should become real test files that run on every push
- [ ] Privacy policy and terms (the app stores names, emails, phone numbers and live locations)
- [ ] Offline-friendly planting (queue a planting when signal drops) and "install the app" support
- [ ] Hindi and other languages
- [ ] Per-tree "adopt" so neighbours can share care

### Performance
- [ ] Map tiles: a per-person service-worker cache with a 24-hour expiry (allowed by Google's rules; no shared cache)
- [ ] Trusted dev certificate is set up (`client/.cert`, see the README), so browser caching works in development
