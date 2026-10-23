import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * One photo: a small copy (640 px on its longest side), a large copy (about 1200 px), what it shows, and the large
 * copy's size (so the strip knows each photo's width before it loads).
 */
export type SliderPhoto = { small: string; large: string; caption: string; width: number; height: number };

/** Photo heights in px, on phones and from md; keep in step with h-44 and md:h-64 below. */
const HEIGHT = { phone: 176, wide: 256 };
/** Scroll speed: the whole strip passes in this many seconds per photo. */
const SECONDS_PER_PHOTO = 6;

/**
 * A strip of photos that scrolls sideways by itself without end: 4 or 5 in view on a laptop, 2 or 3 on a phone.
 * Every photo keeps its own shape (same height, natural width), so nothing gets cropped.
 *
 * The strip is drawn twice side by side and slides left by exactly one copy, then starts again, so the loop has no
 * seam. It stops while the pointer is over it, and the pause button stops it for good. For visitors who prefer
 * reduced motion it doesn't move at all and becomes a row they can scroll themselves.
 */
export const PhotoSlider: React.FC<{ photos: SliderPhoto[]; label: string; className?: string }> = ({ photos, label, className }) => {
  const [playing, setPlaying] = useState(true);
  if (photos.length === 0) return null;

  const strip = (copy: boolean) => (
    <ul className={cn('flex shrink-0 gap-3 pr-3 md:gap-4 md:pr-4', copy && 'motion-reduce:hidden')} aria-hidden={copy || undefined}>
      {photos.map((photo) => {
        const ratio = photo.width / photo.height;
        const smallWidth = Math.round((photo.width * 640) / Math.max(photo.width, photo.height));
        return (
          <li key={photo.large} className="shrink-0">
            <img
              src={photo.small}
              srcSet={`${photo.small} ${smallWidth}w, ${photo.large} ${photo.width}w`}
              sizes={`(min-width: 768px) ${Math.round(HEIGHT.wide * ratio)}px, ${Math.round(HEIGHT.phone * ratio)}px`}
              width={photo.width}
              height={photo.height}
              alt={copy ? '' : photo.caption}
              title={photo.caption}
              loading="lazy"
              draggable={false}
              className="h-44 w-auto rounded-xl bg-muted object-cover md:h-64"
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-label={label} className={className}>
      <div className="group overflow-hidden mask-[linear-gradient(to_right,transparent,black_3%,black_97%,transparent)] motion-reduce:overflow-x-auto">
        <div
          className="flex w-max animate-[pt-marquee_var(--marquee-time)_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          style={{ '--marquee-time': `${photos.length * SECONDS_PER_PHOTO}s`, animationPlayState: playing ? undefined : 'paused' } as React.CSSProperties}
        >
          {strip(false)}
          {strip(true)}
        </div>
      </div>
      <div className="mt-3 flex justify-end motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground ring-1 ring-border hover:bg-accent hover:text-foreground"
        >
          {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {playing ? 'Pause photos' : 'Play photos'}
        </button>
      </div>
    </section>
  );
};
