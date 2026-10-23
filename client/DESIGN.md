# Earth Revival Initiative web: design

The Earth Revival Initiative app ("Plant today, revive tomorrow") is **map first and phone first**: a full-screen map with floating pill controls, a bottom sheet on phones that becomes a side panel on desktop, big type, and one clear action per screen. The look is **white with the logo's greens**: every green is measured from the ERI logo (`public/ERI.jpeg`). Light mode is the default; dark mode is opt-in. Keep the Expo app (`mobile/`) on the same tokens and patterns.

## Colour tokens

Defined in `src/index.css` as CSS variables and exposed to Tailwind via `@theme inline` (`bg-primary`, `text-leaf`, …). Colour always means something:

| Token | Light | Dark | Means |
|---|---|---|---|
| `background` / `card` | `#ffffff` white | `#0c1510` / `#142019` | Page, sheets, floating pills |
| `foreground` | `#133c16` logo "EARTH" green | `#eaf0e3` | Text, icons, "you" dot |
| `primary` / `primary-foreground` | `#2c691c` logo globe green / white | `#8fbf5a` / `#0c1f0e` | Main buttons, selected chips, navigation card, banners |
| `leaf` | `#518321` logo leaf green | `#8fbf5a` | Healthy trees, health bar, the walking route, "Initiative" in the lockup |
| `sprout` | `#729537` logo "REVIVAL" green | `#a9c97a` | Spare light accent |
| `secondary` / `accent` | `#e9f2e1` / `#d2e7c8` logo highlight | `#1f2e25` / `#29392f` | Secondary pills and chips, sheet handle, hover |
| `muted` / `input` | `#f5f9f1` / `#f0f6ea` | `#18251d` / `#1f2e25` | Quiet panels, filled inputs |
| `muted-foreground` | `#5b6b55` | `#9dae9f` | Secondary text |
| `thirsty` | `#2f7fb8` water blue | `#6ab0e3` | Trees that need water, always shown with a water-drop icon |
| `warning` | `#e09a1c` amber | `#f0b13e` | Low health on the health bar |
| `water` | `#2f7fb8` | `#6ab0e3` | Water actions, people walking live |
| `bark` | `#7a5638` | `#c49a6c` | Planting drives |
| `you` | `#e53935` red | `#ff6b66` | Your own location on the map: a red dot with a white ring, pulse, accuracy circle and a direction cone. Nothing else on the map is red, so you never mistake yourself for a tree |
| `destructive` | `#c63d21` rust | `#f0714f` | Remove, End, errors |

Shadows: `shadow-float` for floating pills and buttons, `shadow-sheet` for sheets and cards over the map. Nothing else gets a shadow. No gradients.

Theme is **Light by default**. People can pick Dark in the profile menu. `index.html` sets `<html data-theme>` before first paint; `dark:` styles key off `[data-theme="dark"]`.

**Map tiles** are Google Maps (official Map Tiles API), proxied through the backend at `/api/v1/maps/tiles/...` so the API key stays secret. Google's terms require the Google logo and "Map data ©Google" on the map (`GoogleCredit`). If the backend can't serve Google tiles, the map falls back to CARTO (with `VITE_CARTO_API_KEY`) or OpenStreetMap.

## Type

- **Montserrat** (700/800) for headings, the logo lockup and big numbers like "350 m". Its heavy geometric shapes echo the "EARTH" lettering in the logo.
- **DM Sans** (400/500/600) for everything else. Inputs are 16 px so iOS doesn't zoom.
- Sentence case everywhere. The one exception is "INITIATIVE" in the logo lockup, which copies the logo.

## Shape and sizing

- Buttons and chips are pills (`rounded-full`). Cards and alerts `rounded-2xl`, photos `rounded-xl`, the phone sheet `rounded-t-3xl`.
- Main actions on phones are 48 px tall (`size="xl"`). Touch targets are at least 40 px.
- Screen gutter 16 px (`p-4`), sheet padding 20 px (`px-5`).
- Nothing scrolls sideways at 320 px. Chip rows may scroll inside their own pill.

## Components (`src/components/ui/`)

| Component | Use |
|---|---|
| `Button` | `default` globe-green pill, `secondary` pale-leaf pill, `outline`, `ghost`, `destructive` (tinted rust), `danger` (solid rust: End, confirm remove), `floating` (map controls) |
| `Chips` | Single choice: filters, care type, species, theme. Selected = solid globe green |
| `Badge`, `StatusDot` | Healthy (leaf dot) / Needs water (blue water drop) / Planting drive / Sample |
| `Alert` | Inline feedback: `success`, `error`, `thirsty`, `info` |
| `Field`, `Input`, `Textarea` | Label above, filled input, hint below |
| `Page`, `TopBar` | Full-screen pages: back arrow + title, optional sticky footer for the one main action |
| `ConfirmDialog` | Destructive confirmations |
| `Logo`, `LogoMark`, `Sapling` | The ERI emblem (`public/eri-emblem*.webp`, cut from the logo) with the stacked name "Earth Revival / INITIATIVE", and the empty-state drawing. Icons (the emblem): `favicon.ico`, `favicon.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`; full logo: `eri-logo.webp` |

## Home page (`/`)

The bare address is a public landing page (`src/pages/HomePage.tsx`); the map app lives at `/map`, and `/map?open=drives` opens on the Drives page. Phone first: one column that becomes rows from `md` up. Order: header (logo, section links from `md`, **Open the map**, profile menu; fixed over the top of the picture on every screen size with no background and white text, and it turns solid white only once the whole picture has scrolled past it), hero (`public/home.jpg` in responsive sizes `home-640/1280/1920.webp` with a flat dark layer for the white text, no gradient. On phones a wide 3:2 landscape picture across the whole screen with only the small eyebrow and the headline on it, then the description and two 44px buttons below it; from `md` everything sits on the picture, which reaches up behind the header), four impact boxes just below the picture (trees planted, plantation drives, clean-up drives, waste collected: leaf, bark and purple icons and numbers, 2 across on phones and 4 across from `md`; each number counts up from 0 when its box scrolls into view, or shows at once for people who prefer reduced motion), How it works (three cards with a picture across the top: `public/plant-it.webp`, `find-it.webp` and `care-it.webp`, web copies of pictures supplied by the team (`planting tree.jpg`, `findit.png`, `water.jpg`); replace a file to change its picture), Drives (the next three public drives from the API), Get involved, a call to action band in the light-green `secondary` colour and a footer. The numbers come from `GET /api/v1/stats` (while `SHOW_SAMPLE_NUMBERS` in `components/site/ImpactNumbers.tsx` is true they are placeholders instead, on both the home and About pages) (waste collected is typed in by an admin in Settings), and the drives list says so when none are scheduled, so nothing on the page is invented. The header carries the map's profile menu as a compact 36px square button next to a 36px **Open the map** button. Unlike the map, the home page uses squarer shapes: buttons, icon tiles and the profile button are `rounded-lg` (8px, not pills) and cards and pictures `rounded-xl` (12px). Link previews use `public/og-home.jpg` (1200x630). `vercel.json` rewrites every path to `index.html` so `/map` survives a reload.

## About page (`/about`)

Shares the header (an **About** link first; the header's page links show from `lg` up, since five no longer fit at `md`), footer (**About us** under Explore) and the impact numbers (`components/site/ImpactNumbers.tsx`) with the home page. Sections: intro with the team's group photo (`public/about/team-group-photo-in-the-park-800/1600.webp`), **What we do** (plantation drives, clean-up drives, care after planting, with the map's brown, purple and blue), **Our drives in pictures** (`components/site/PhotoSlider.tsx`: ten photos from `public/about` in a strip that scrolls sideways by itself without end, 4 or 5 in view on a laptop and 2 or 3 on a phone; every photo keeps its own shape at one height (176px on phones, 256px from `md`), so nothing is cropped; the strip is drawn twice and slides by one copy so the loop has no seam; it stops while hovered and has a Pause photos button; for people who prefer reduced motion it stands still as a row they scroll by hand), **Our work so far** (the four numbers), **What we believe** (three short points) and a **Join us** band (Open the tree map, Join the team when its link is set, Donate).

## Donate page (`/donate`)

Shares the home page's header (solid, with a **Donate** link) and footer (`src/components/site/SiteChrome.tsx`). A short intro with `plant-it.webp`, **Where your donation goes** (four cards: saplings and guards, water and care, tools for drives, the tree map), **How to give** in three steps, and a note that every drive gets a public summary and pictures. **Donate on WhatsApp** opens `https://wa.me/<number>?text=…` in a new tab; with no number set it is shown switched off with "Donations on WhatsApp will open soon".

## Suggest a place (`/map?open=places`)

A full-screen page like Drives. The list shows each form as a card with an **Open** (green) or **Closed** (outlined) badge and what it is for (brown for planting, purple for clean-up, plain for either), open forms first, 10 to a page, with an empty state when there are none. A form's page has its badges, title and description, then the form: the planting / clean-up chips (only for "either" forms), the same search box and pin-in-the-middle map as the drive form, an optional Google Maps link, the landmark, one text box per question and a picture grid (3 across on phones, 5 from `sm`) with a dashed **Add pictures** tile and a remove button on each picture. The send button names what is still missing ("Add a landmark") until the form is complete; signed-out visitors get **Sign in to send this place** instead. After sending, a thank-you with **Send another place**. A closed form shows a note instead of the form.

Admin → **Places** lists the forms (All / Open / Closed chips, 10 to a page, with how many places came in). A form opens on its own page: badges, title, its questions, then **Close the form / Open the form**, **Edit**, **Copy link** and **Delete** (tinted red, with a confirmation that suggests closing instead), and the places sent, newest first, 10 to a page. Each place is a card: planting or clean-up badge, the landmark, when it came, the pictures in a row of five (tap one for a full-screen view), **Show on the map** (a small map with the pin, opened only when asked so a page of places stays light) and **Open in Google Maps**, the answers under their questions, and who sent it at the bottom.

## Map screen

```
Phone                                   Desktop (md+)
┌──────────────────────────────┐       ┌──────────┬────────────────────────────┐
│ (Logo)          [+ Plant] (👤)│       │ Logo     │ [All|Needs water|Healthy]  │
│ [All|Needs water|Healthy]     │       │ sheet    │          [+ Plant a tree](👤)│
│                          (◎) │       │ content  │                         (◎) │
│            map                │       │          │           map              │
│╭────────────────────────────╮│       │          │                            │
││ ═══ handle                  ││       └──────────┴────────────────────────────┘
││ Trees near you / tree / nav ││
│╰────────────────────────────╯│
```

- **Sheet** (`MapSheet`): drag or tap the handle between one line, 46% and 88% of the screen. Shows trees near you (search, distance chips, list), a selected tree, a drive, or directions.
- **Pins**: healthy trees are 36 px leaf-green circles; trees that need water are a **blue water drop** with the tree inside; drives are bark circles. A selected pin grows and gets a foreground outline.
- **Navigation**: globe-green card on top ("131 m · Walk to …"), sheet with minutes in leaf green, End (solid rust) and Google Maps.
- **Choosing a location**: the pin stays in the middle and the map moves under it ("Where is the tree?").
- **Pages** (Plant, Edit, My trees, Account, Admin) are full screen and live in browser history, so the phone's back button closes them.

## Writing

- Say what happens: "Plant tree", "Log care", "Confirm location", "Remove tree".
- A disabled main button says why: "Give it a name to continue".
- Errors say what to do: "Location is off. Turn it on to see the trees nearest you."
- Empty states invite action: "No trees mapped here yet. Spotted one worth caring for? Add it to the map."
- Metric units ("350 m", "1.2 km"), walking at about 80 m a minute.
