import { useEffect, useMemo, useState } from 'react';

/**
 * Page-load intro. Two large trees lean in from the bottom corners and their canopies cover the
 * whole screen. They shake in a gust, leaves come loose and flutter down, then both trees swing
 * out to the sides to uncover the app underneath.
 *
 * Timeline (about 4.3 s): still 0–0.25 s → shake 0.25–1.35 s → leaves fall from 1.15 s →
 * open 2.7–4.2 s → removed at 4.3 s.
 * Plays once per browser tab session. Any tap or key skips to the opening. People who ask their
 * device for reduced motion don't see it.
 *
 * On wide screens the trees come from the photo in public/tree.jpg (mirrored for the right side).
 * On tall phone screens, or if the photo can't load, drawn trees are used instead: generated (seeded, so they look the same every time) in real
 * screen pixels, so leaves are never stretched on tall phones or wide monitors.
 */

type Phase = 'loading' | 'still' | 'shake' | 'drop' | 'open' | 'done';

const SEEN_KEY = 'eri.introSeen';
// If drawing the trees takes longer than this, start anyway
const MAX_WAIT_FOR_IMAGES = 1500;
const SHAKE_AT = 250;
const DROP_AT = 1150;
const OPEN_AT = 2700;
const DONE_AT = 4300;

const shouldPlay = () => {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
};

// ---------- Geometry helpers ----------

type Pt = { x: number; y: number };

/** Small seeded random generator, so the trees are identical on every visit. */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

const f = (n: number) => n.toFixed(1);

/** A branch as a filled shape that tapers from w0 to w1 along a curve. */
function taperedPath(a: Pt, c: Pt, b: Pt, w0: number, w1: number, steps = 18) {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = quad(a, c, b, t);
    const dx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
    const dy = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: p.x - (dy / len) * w, y: p.y + (dx / len) * w });
    right.push({ x: p.x + (dy / len) * w, y: p.y - (dx / len) * w });
  }
  const pts = [...left, ...right.reverse()];
  return `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`;
}

/** A leaf pointing along +x, `len` long: two curves meeting at the tip. */
const leafPath = (len: number) => {
  const w = len * 0.42;
  return `M0 0C${f(len * 0.3)} ${f(-w)} ${f(len * 0.75)} ${f(-w * 0.85)} ${f(len)} 0C${f(len * 0.75)} ${f(w * 0.85)} ${f(len * 0.3)} ${f(w)} 0 0Z`;
};

/** An irregular blob (the shadowed mass inside the canopy that stops gaps showing through). */
function blobPath(c: Pt, r: number, rand: () => number) {
  const n = 12;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.82 + rand() * 0.3);
    pts.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr });
  }
  // Smooth closed curve through the points
  let d = `M${f((pts[0].x + pts[n - 1].x) / 2)} ${f((pts[0].y + pts[n - 1].y) / 2)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    d += `Q${f(p.x)} ${f(p.y)} ${f((p.x + q.x) / 2)} ${f((p.y + q.y) / 2)}`;
  }
  return `${d}Z`;
}

// Leaf colours by depth, all from the logo's greens (shadowed at the back, sunlit at the front)
const BACK = ['#0d2b10', '#113513', '#133c16', '#18451a'];
const MID = ['#1f5219', '#245c1b', '#2c691c', '#35721f', '#3c7a22'];
const FRONT = ['#457c22', '#518321', '#5b8c27', '#66912e', '#729537', '#83a446'];
const LOOSE = ['#7fa443', '#8fb04f', '#9cbc5a', '#a9c97a', '#b7cf6a'];

interface TreeGeometry {
  /** Picture size: the screen box plus margins, so the tree's edges are ragged leaves, not a straight cut */
  width: number;
  height: number;
  /** Where the screen box starts inside the picture */
  offset: Pt;
  blobs: string[];
  back: string[];
  bark: string[];
  barkLight: string[];
  mid: string[];
  front: string[];
  blur: number;
}

/**
 * One tree, drawn for the LEFT side: trunk rising from below the bottom-left corner and leaning
 * in, branches fanning out, and foliage covering a box `width` × `height` (the right tree is the
 * same idea with another seed, mirrored).
 */
function buildTree(width: number, height: number, unit: number, seed: number): TreeGeometry {
  const rand = seeded(seed);
  const r = (min: number, max: number) => min + rand() * (max - min);

  const W = width;
  const H = height;
  // Margins around the screen box: the inner side and the bottom show as the tree swings away,
  // so the canopy and trunk carry on past the screen edge and end raggedly instead of in a straight line
  const padL = unit * 0.12;
  const padR = unit * 0.4;
  const padT = unit * 0.12;
  const padB = unit * 0.6;

  // Trunk: from below the corner, leaning towards the centre of the screen
  const base: Pt = { x: W * 0.02, y: H + padB * 0.55 };
  const trunkCtrl: Pt = { x: W * 0.12, y: H * 0.58 };
  const trunkTop: Pt = { x: W * 0.46, y: H * 0.2 };
  const bark: string[] = [taperedPath(base, trunkCtrl, trunkTop, unit * 0.15, unit * 0.05)];
  const barkLight: string[] = [];

  // Main branches reach the far side, the top and the bottom so the canopy can fill the screen
  const targets: Pt[] = [
    { x: 0.98, y: 0.04 }, { x: 1.02, y: 0.28 }, { x: 0.94, y: 0.52 },
    { x: 0.66, y: -0.04 }, { x: 0.34, y: -0.03 }, { x: 0.08, y: 0.16 },
  ].map((p) => ({ x: p.x * W, y: p.y * H }));

  const tips: Pt[] = [];
  targets.forEach((target, i) => {
    const t = 0.45 + (i / targets.length) * 0.5 + r(-0.04, 0.04);
    const start = quad(base, trunkCtrl, trunkTop, Math.min(t, 0.98));
    const ctrl = {
      x: (start.x + target.x) / 2 + r(-0.12, 0.12) * W,
      y: (start.y + target.y) / 2 + r(-0.1, 0.06) * H,
    };
    const w0 = unit * r(0.04, 0.06);
    bark.push(taperedPath(start, ctrl, target, w0, unit * 0.012));
    barkLight.push(taperedPath(start, ctrl, target, w0 * 0.25, unit * 0.003));
    tips.push(target);
    // Two or three side branches off each main branch
    const subs = 2 + Math.floor(rand() * 2);
    for (let s = 0; s < subs; s++) {
      const st = r(0.35, 0.8);
      const from = quad(start, ctrl, target, st);
      const angle = Math.atan2(target.y - start.y, target.x - start.x) + r(-1.1, 1.1);
      const len = unit * r(0.18, 0.32);
      const to = { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
      const c2 = { x: (from.x + to.x) / 2 + r(-0.05, 0.05) * unit, y: (from.y + to.y) / 2 + r(-0.06, 0.02) * unit };
      bark.push(taperedPath(from, c2, to, w0 * r(0.35, 0.5), unit * 0.006));
      tips.push(to);
    }
  });

  // Foliage clusters on a jittered grid over the whole box (so nothing shows through),
  // plus extra clusters at the branch tips
  const spacing = unit * 0.16;
  const centres: Pt[] = [];
  for (let y = -padT * 0.7; y <= H + padB * 0.6; y += spacing) {
    for (let x = -padL * 0.7; x <= W + padR * 0.25; x += spacing) {
      // Thin out past the screen edges so the outline is ragged foliage
      if (x > W * 0.98 && rand() < 0.45) continue;
      if (y > H + padB * 0.25 && rand() < 0.4) continue;
      centres.push({ x: x + r(-0.3, 0.3) * spacing, y: y + r(-0.3, 0.3) * spacing });
    }
  }
  centres.push(...tips);

  const leafLen = Math.max(18, Math.min(unit, 560) * 0.07);
  const blobR = spacing * 0.95;
  const nearTrunkBase = (p: Pt) => p.x < W * 0.3 && p.y > H * 0.62;

  const blobs: string[] = [];
  const back: string[] = [];
  const mid: string[] = [];
  const front: string[] = [];

  const leafAt = (c: Pt, spread: number, lenScale: number, colors: string[], bias: Pt) => {
    const ang = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * spread;
    const x = c.x + Math.cos(ang) * dist + bias.x;
    const y = c.y + Math.sin(ang) * dist + bias.y;
    // Lower in the canopy is more shaded: favour the darker end of the palette there
    const depth = Math.min(1, Math.max(0, y / H));
    const color = colors[Math.min(colors.length - 1, Math.floor(rand() * colors.length * (1 - depth * 0.55)))];
    // Leaves point outwards from their cluster, drooping a little
    const rot = (Math.atan2(y - c.y, x - c.x) * 180) / Math.PI + r(-45, 45) + 12;
    const len = leafLen * lenScale * r(0.75, 1.2);
    return `<path d="${leafPath(len)}" fill="${color}" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})"/>`;
  };

  const per = (k: number) => Math.max(2, Math.round(k * (blobR / leafLen) ** 2));
  for (const c of centres) {
    blobs.push(blobPath(c, blobR * r(0.9, 1.1), rand));
    for (let i = 0; i < per(0.9); i++) back.push(leafAt(c, blobR, 1, BACK, { x: 0, y: 0 }));
    if (nearTrunkBase(c)) continue; // keep the lower trunk visible
    for (let i = 0; i < per(1.0); i++) mid.push(leafAt(c, blobR * 0.95, 0.95, MID, { x: 0, y: 0 }));
    // Sunlit leaves sit towards the top-left of each cluster (light from above)
    for (let i = 0; i < per(0.55); i++) front.push(leafAt(c, blobR * 0.75, 0.9, FRONT, { x: -blobR * 0.2, y: -blobR * 0.3 }));
  }

  return {
    width: Math.round(W + padL + padR),
    height: Math.round(H + padT + padB),
    offset: { x: padL, y: padT },
    blobs,
    back,
    bark,
    barkLight,
    mid,
    front,
    blur: Math.max(1, unit * 0.0035),
  };
}

/** The full SVG document for one tree. */
function treeSvg(tree: TreeGeometry, id: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tree.width}" height="${tree.height}" viewBox="0 0 ${tree.width} ${tree.height}" overflow="visible">
    <defs><filter id="${id}-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${f(tree.blur)}"/></filter></defs>
    <g transform="translate(${f(tree.offset.x)} ${f(tree.offset.y)})">
    <g fill="#0f2f12">${tree.blobs.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g filter="url(#${id}-soft)">${tree.back.join('')}</g>
    <g fill="#4a3220" stroke="#2e1e12" stroke-width="1">${tree.bark.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g fill="#7a5a3c" opacity="0.45">${tree.barkLight.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g>${tree.mid.join('')}</g>
    <g>${tree.front.join('')}</g>
    </g>
  </svg>`;
}

/**
 * One tree as an image. Thousands of leaves are drawn once into a picture, so the shake and
 * swing only move a bitmap (smooth even on modest phones) instead of redrawing every leaf.
 */
const TreeImage: React.FC<{ tree: TreeGeometry; id: string; onReady: () => void }> = ({ tree, id, onReady }) => {
  // Create the picture URL and release it in the same effect. (Creating it in useMemo and releasing
  // it in an effect broke in development: React's StrictMode runs effects twice, which released
  // the URL before the image had loaded, so no trees showed.)
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([treeSvg(tree, id)], { type: 'image/svg+xml' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [tree, id]);
  if (!url) return null;
  return (
    <img
      src={url}
      width={tree.width}
      height={tree.height}
      alt=""
      draggable={false}
      className="block max-w-none"
      onLoad={(e) => {
        // Wait until it's decoded so the first frame isn't blank
        e.currentTarget.decode().then(onReady, onReady);
      }}
      onError={onReady}
    />
  );
};

// The intro uses this photo when it loads (replace public/tree.jpg with a bigger version for a sharper result)
const TREE_PHOTO = '/tree.jpg';
// Leaf colours sampled from the willow in the photo
const WILLOW = ['#95b019', '#a2b657', '#728a42', '#8aa52a', '#b5c86a'];
// Use the photo only when the screen is at least this wide for its height (laptops, desktops,
// tablets on their side). A tall portrait photo would be needed to do the same on phones.
const PHOTO_MIN_ASPECT = 0.9;

/** A slender willow leaf, for the photo version. */
const WillowLeafArt: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 40 12" className="size-full" aria-hidden="true">
    <path d="M1 6C11 1.2 27 0.8 39 6 27 11.2 11 10.8 1 6Z" fill={color} />
    <path d="M2 6H37" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.8" strokeLinecap="round" />
  </svg>
);

/** A loose leaf with a vein and a little shading, for the ones that fall. */
const FallingLeafArt: React.FC<{ color: string; dark: string }> = ({ color, dark }) => (
  <svg viewBox="0 0 40 24" className="size-full" aria-hidden="true">
    <path d="M1 12C10 1.5 26 1 39 12 26 23 10 22.5 1 12Z" fill={color} />
    {/* Shaded underside */}
    <path d="M1 12C10 22.5 26 23 39 12Z" fill={dark} opacity="0.35" />
    <path d="M2 12H37M14 12l7-5M14 12l7 5M24 12l6-4M24 12l6 4" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.9" fill="none" strokeLinecap="round" />
  </svg>
);

interface FallingLeaf {
  x: number;
  y: number;
  size: number;
  dx: number;
  rot: number;
  delay: number;
  dur: number;
  flutter: number;
  color: string;
  dark: string;
  willow: string;
}

function buildFallingLeaves(vw: number, vh: number, unit: number): FallingLeaf[] {
  const rand = seeded(7);
  const r = (min: number, max: number) => min + rand() * (max - min);
  return Array.from({ length: 26 }, () => ({
    x: r(0.04, 0.96) * vw,
    y: r(0.04, 0.55) * vh,
    size: Math.max(26, Math.min(unit, 600) * r(0.065, 0.095)),
    dx: r(-0.18, 0.18) * vw,
    rot: r(-540, 540),
    delay: r(0, 800),
    dur: r(1900, 2300),
    flutter: r(500, 900),
    // Lighter than the canopy so they read clearly as they fall in front of it
    color: LOOSE[Math.floor(rand() * LOOSE.length)],
    dark: MID[Math.floor(rand() * MID.length)],
    willow: WILLOW[Math.floor(rand() * WILLOW.length)],
  }));
}

/**
 * One side of the scene made from the photo: it fills its side (and runs past the bottom of the
 * screen, so swinging away never shows a straight bottom edge), and fades out softly along the
 * inner edge where it overlaps the other side.
 */
const PhotoTree: React.FC<{ side: 'left' | 'right'; phase: Phase; onReady: () => void; onFail: () => void }> = ({ side, phase, onReady, onFail }) => {
  const vh = window.innerHeight;
  const inner = side === 'left' ? 'to right' : 'to left';
  const mask = `linear-gradient(${inner}, #000 76%, transparent 100%), linear-gradient(to top, transparent 0%, #000 14%)`;
  return (
    <div
      className="eri-tree overflow-hidden"
      data-side={side}
      data-phase={phase}
      style={{
        [side]: 0,
        top: 0,
        width: '62vw',
        height: vh * 1.3,
        // Pivot at the trunk base: the bottom outer corner of the screen
        transformOrigin: `${side === 'left' ? '0%' : '100%'} ${vh}px`,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    >
      <img
        src={TREE_PHOTO}
        alt=""
        draggable={false}
        // The photo's trunk is bottom-left; the right side shows the same tree mirrored
        className={`block size-full max-w-none object-cover object-[0%_80%] ${side === 'right' ? '-scale-x-100' : ''}`}
        onLoad={(e) => e.currentTarget.decode().then(onReady, onReady)}
        onError={onFail}
      />
    </div>
  );
};

export const IntroAnimation: React.FC = () => {
  const [phase, setPhase] = useState<Phase>(() => (shouldPlay() ? 'loading' : 'done'));
  const [readyCount, setReadyCount] = useState(0);
  const onTreeReady = () => setReadyCount((n) => n + 1);
  // The photo is landscape, so it only suits wide screens; tall phone screens get the drawn trees
  // (each half would show a thin, blurry, mirrored strip of it). If it can't load, also fall back.
  const [source, setSource] = useState<'photo' | 'drawn'>(() =>
    window.innerWidth / window.innerHeight >= PHOTO_MIN_ASPECT ? 'photo' : 'drawn'
  );
  const photoFailed = () => {
    setReadyCount(0);
    setSource('drawn');
  };
  const started = phase !== 'loading';

  // Size the trees to the real screen once, when the intro starts
  const scene = useMemo(() => {
    if (phase === 'done') return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const unit = Math.min(vw, vh);
    // Each tree covers 64% of the width, so the two canopies overlap in the middle
    const treeW = Math.round(vw * 0.64);
    return {
      // Drawn trees are only generated if the photo can't be used
      left: source === 'drawn' ? buildTree(treeW, vh, unit, 11) : null,
      right: source === 'drawn' ? buildTree(treeW, vh, unit, 29) : null,
      leaves: buildFallingLeaves(vw, vh, unit),
    };
    // Built once for this intro (again only if we switch to the drawn trees)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Both tree pictures ready (or we've waited long enough): begin
  useEffect(() => {
    if (phase !== 'loading') return;
    if (readyCount >= 2) {
      setPhase('still');
      return;
    }
    const t = window.setTimeout(() => setPhase((p) => (p === 'loading' ? 'still' : p)), MAX_WAIT_FOR_IMAGES);
    return () => clearTimeout(t);
  }, [phase, readyCount]);

  useEffect(() => {
    if (!started || phase === 'done') return;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: it just plays again next time
    }
    const advance = (to: Phase, from: Phase[]) => () => setPhase((p) => (from.includes(p) ? to : p));
    const timers = [
      window.setTimeout(advance('shake', ['still']), SHAKE_AT),
      window.setTimeout(advance('drop', ['shake']), DROP_AT),
      window.setTimeout(advance('open', ['still', 'shake', 'drop']), OPEN_AT),
    ];
    // Any tap, click or key skips straight to the opening
    const skip = advance('open', ['loading', 'still', 'shake', 'drop']);
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
    // Set up once the intro starts; the phase changes come from the timers above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Remove the overlay once the trees have swung away (also after a skip)
  useEffect(() => {
    if (phase !== 'open') return;
    const t = window.setTimeout(() => setPhase('done'), DONE_AT - OPEN_AT);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'done' || !scene) return null;

  return (
    <div className="eri-intro fixed inset-0 z-[6000] overflow-hidden select-none" aria-hidden="true" data-phase={phase}>
      {/* Deep green cover for the split second while the trees load */}
      {phase === 'loading' && <div className="absolute inset-0 z-10 bg-[#0f2f12]" />}
      {source === 'photo' ? (
        <>
          {/* Deep green behind the soft-edged photos, so nothing shows through until they swing away */}
          <div className="eri-backdrop absolute inset-0 bg-[#1d3a12]" data-phase={phase} />
          <PhotoTree side="left" phase={phase} onReady={onTreeReady} onFail={photoFailed} />
          <PhotoTree side="right" phase={phase} onReady={onTreeReady} onFail={photoFailed} />
        </>
      ) : scene.left && scene.right ? (
        <>
          <div
            className="eri-tree"
            data-side="left"
            data-phase={phase}
            style={{
              left: -scene.left.offset.x,
              top: -scene.left.offset.y,
              transformOrigin: `${scene.left.offset.x}px ${scene.left.offset.y + window.innerHeight}px`,
            }}
          >
            <TreeImage tree={scene.left} id="eri-l" onReady={onTreeReady} />
          </div>
          <div
            className="eri-tree"
            data-side="right"
            data-phase={phase}
            style={{
              right: -scene.right.offset.x,
              top: -scene.right.offset.y,
              transformOrigin: `calc(100% - ${scene.right.offset.x}px) ${scene.right.offset.y + window.innerHeight}px`,
            }}
          >
            {/* Same drawing approach, different seed, mirrored to lean in from the right */}
            <div className="-scale-x-100">
              <TreeImage tree={scene.right} id="eri-r" onReady={onTreeReady} />
            </div>
          </div>
        </>
      ) : null}

      {/* Leaves shaken loose: each falls along a drifting path while fluttering in 3D */}
      <div className="pointer-events-none absolute inset-0 [perspective:600px]">
        {scene.leaves.map((l, i) => (
          <span
            key={i}
            className="eri-fall absolute"
            data-phase={phase}
            style={
              {
                left: l.x,
                top: l.y,
                width: l.size,
                height: l.size * (source === 'photo' ? 0.3 : 0.6),
                '--dx': `${l.dx}px`,
                '--rot': `${l.rot}deg`,
                animationDelay: `${l.delay}ms`,
                animationDuration: `${l.dur}ms`,
              } as React.CSSProperties
            }
          >
            <span className="eri-flutter block size-full" style={{ animationDuration: `${l.flutter}ms` }}>
              {source === 'photo' ? <WillowLeafArt color={l.willow} /> : <FallingLeafArt color={l.color} dark={l.dark} />}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
