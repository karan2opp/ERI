import { cn } from '../../lib/cn';

export const PRODUCT_NAME = 'Earth Revival Initiative';

/** The Earth Revival Initiative emblem: tree, globe and hand, cut from the logo. */
export const LogoMark: React.FC<{ className?: string }> = ({ className }) => (
  <img
    src="/eri-emblem-96.webp"
    srcSet="/eri-emblem-96.webp 96w, /eri-emblem.webp 256w"
    sizes="48px"
    alt=""
    aria-hidden="true"
    className={cn('size-10 shrink-0 object-contain dark:rounded-full dark:bg-white dark:p-0.5', className)}
  />
);

/**
 * Emblem plus the name, stacked like the logo: "Earth Revival" over a small "Initiative".
 * On very narrow phones only the emblem shows (the name stays for screen readers).
 * Text is smaller on phones so the lockup fits beside the Plant button on one line.
 */
export const Logo: React.FC<{ className?: string; hideNameOnNarrow?: boolean; lightOverPhoto?: boolean }> = ({ className, hideNameOnNarrow, lightOverPhoto }) => (
  <span className={cn('flex items-center gap-2', className)}>
    {/* lightOverPhoto: inside the home page's header (a `group/header`), while it is clear over the photo (md and up) the name turns white (and Initiative a pale green) and the emblem gets a white disc */}
    <LogoMark className={lightOverPhoto ? 'group-data-[top=true]/header:rounded-full group-data-[top=true]/header:bg-white group-data-[top=true]/header:p-0.5' : undefined} />
    <span className={cn('flex flex-col leading-none', hideNameOnNarrow && 'max-[379px]:sr-only')}>
      <span className={cn('font-heading text-[14px] font-extrabold tracking-tight whitespace-nowrap text-foreground md:text-[16px]', lightOverPhoto && 'group-data-[top=true]/header:text-white')}>Earth Revival</span>
      {/* The logo's own lockup spells INITIATIVE in spaced capitals */}
      <span className={cn('mt-1 text-[9px] font-semibold tracking-[0.3em] whitespace-nowrap text-leaf uppercase md:text-[10px]', lightOverPhoto && 'group-data-[top=true]/header:text-[#d2e7c8]')}>Initiative</span>
    </span>
  </span>
);

/** A small sapling drawing for empty states. */
export const Sapling: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 96" className={cn('h-24 w-auto', className)} fill="none" aria-hidden="true">
    <ellipse cx="60" cy="86" rx="40" ry="6" className="fill-secondary" />
    <path d="M60 86V44" className="stroke-bark" strokeWidth="4" strokeLinecap="round" />
    <path d="M60 58c-14 0-24-8-26-22 14-1 25 7 26 22Z" className="fill-leaf" />
    <path d="M60 50c13 0 22-9 23-23-13 0-22 9-23 23Z" className="fill-primary" />
    <path d="M60 40c0-10 5-18 13-22" className="stroke-leaf" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
