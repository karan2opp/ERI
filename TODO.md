# Earth Revival Initiative: plan and to-do list

Last updated 2026-10-19. Hosting plan: client on Vercel, server on Render, Postgres on a managed host.

## Done recently

- [x] Roles: user, team member, admin, super admin (server-enforced)
- [x] Plantation and clean-up drives, with visibility (everyone / team only)
- [x] Edit and delete drives (admins)
- [x] Email (Resend) and push (Web Push) notifications for new, changed and cancelled drives, with a choice of audience: don't send / team members / everyone. People can turn emails off and manage push in Account > Notifications
- [x] Photo check with OpenAI, planting within 15 m, admin review queue, settings for whose photos are checked

## Needs you (keys and accounts)

- [ ] **Cloudinary keys** in `server/.env` (until then every tree photo is a random stock image)
- [ ] **Resend**: create an account, verify your domain, set `RESEND_API_KEY` and `EMAIL_FROM` (until then no email is sent; push still works)
- [ ] **Push keys for production**: run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on Render (the keys in your local `.env` are for development only)
- [ ] **Clerk production instance** keys (the current ones are development keys)

---

## Plan: the map loads every tree at once

### What happens today

| Part | How it loads | Problem |
|---|---|---|
| The list in the bottom sheet / side panel | `GET /trees/browse`: 10 per page, nearest first, 100 m / 500 m / 1 km / any distance, all on the server | Already fine |
| The pins on the map | `GET /trees`: **every** tree, with owner and last care log joined | Slow and heavy once there are thousands of trees |
| Pin filters (needs water / healthy / mine / distance) | Done in the browser on the full list | Only works because the browser has everything |

So the list is already the design you described. Only the **map pins** need to change.

### Can we serve tree locations from a CDN, or cache them in Redis?

- **Allowed?** Yes. Tree data is ours, so the Google Map Tiles restrictions don't apply to it.
- **CDN:** it only helps when many people request the *same URL*. A URL like "all trees near my GPS point" is different for everyone, so a CDN would cache nothing. Fix: use **tile-shaped URLs**, `/trees/pins/{z}/{x}/{y}`, so everyone looking at the same part of the city asks for the same URL, and the CDN (Cloudflare in front of Render, or Vercel rewrites) answers it. A tree planted now shows up for others within about a minute (`s-maxage=60`). The person who planted it sees it immediately from their own state.
- **Redis:** not needed to start. With the right index, Postgres answers "pins in this tile" in a few milliseconds. Add Redis later only if monitoring shows the database is the bottleneck (Render sells it as "Key Value"). Reasonable uses then: per-tile cache with invalidation when a tree is added, approved or deleted, and counters for a public stats page.
- **Browser cache:** the same `Cache-Control` also lets each phone reuse pins it already downloaded.

### Steps, in order (each one is shippable on its own)

1. **Stop loading everything for the map.** New endpoint `GET /trees/pins?bbox=west,south,east,north&zoom=Z`: returns only what's in view and a slim row per tree (`id, lat, lng, needsWater`; no owner, no care logs), capped at about 500. Verified trees only, as today.
2. **Database index.** Add an index for location queries (a btree on latitude and longitude with a bounding-box prefilter is enough up to about 100k trees; PostGIS only if we later need polygons). Make it partial: `WHERE verification_status = 'VERIFIED'`.
3. **Clustering on the server at low zoom.** When zoomed out (below about 14), return grid clusters `{lat, lng, count}` instead of individual trees; tapping a cluster zooms in. This keeps the response small at any city size.
4. **Move the pin filters to the server.** Needs water / healthy / mine / distance become query parameters on the pins endpoint, so the browser no longer needs every tree to filter.
5. **Client:** load pins on map move (debounced about 300 ms), keep the old pins on screen while new ones load, fetch a single tree by id when its pin is tapped (already works). The list keeps using `/trees/browse`.
6. **Caching:** switch pins to tile-shaped URLs, add `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=300` and an `ETag`, then put a CDN in front. Measure first; add Redis only if the numbers say so.
7. **Tests and a load check:** seed 50,000 trees (the demo seeder can do it) and check pin responses stay under about 100 ms and under about 50 KB.

---

## To-do: improvements, by area

### Map and trees (the items you pasted; for later)
- [ ] Map: load only what's in view, with clustering (the plan above)
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
- [ ] Vercel: set `VITE_API_URL` (the Render address plus `/api/v1`) and `VITE_CLERK_PUBLISHABLE_KEY`; add a rewrite so deep links like `/?drive=...` open the app; `sw.js` must be served from the site root
- [ ] Render: set every variable from `server/.env.example`; set `CLIENT_ORIGIN` to your real domain(s) (comma-separated) and `APP_URL` to the public address so links in emails are right; set `TRUST_PROXY=1`
- [ ] Render free web services go to sleep when idle: use a paid instance, or the first request after a quiet period will be slow (and the live-walk sockets drop)
- [ ] Managed Postgres with daily backups; run `npm run db:push` against it once
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
