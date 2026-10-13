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
| `destructive` | `#c63d21` rust | `#f0714f` | Remove, End, errors |

Shadows: `shadow-float` for floating pills and buttons, `shadow-sheet` for sheets and cards over the map. Nothing else gets a shadow. No gradients.

Theme is **Light by default**. People can pick Dark or Device on the Account page. `index.html` sets `<html data-theme>` before first paint; `dark:` styles key off `[data-theme="dark"]`.

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
