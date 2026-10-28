import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import type { MediaItem } from '../../services/mediaApi';

/** One square in the grid: a small still picture, with a play mark on videos and the caption underneath. */
export const MediaTile: React.FC<{ item: MediaItem; onOpen: () => void; overlay?: React.ReactNode }> = ({ item, onOpen, overlay }) => (
  <li className="group relative overflow-hidden rounded-2xl bg-muted">
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${item.type === 'VIDEO' ? 'Play video' : 'Open photo'}${item.caption ? `: ${item.caption}` : ''}`}
      className="block aspect-[4/3] w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img src={item.thumbUrl} alt={item.caption} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      {item.type === 'VIDEO' && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white">
            <Play className="size-6 fill-current" />
          </span>
        </span>
      )}
      {item.caption && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-left text-sm font-medium text-white">
          <span className="line-clamp-2">{item.caption}</span>
        </span>
      )}
    </button>
    {overlay}
  </li>
);

/**
 * A photo or video shown large over the page. Arrow keys (or the side buttons) move between the items on the
 * page, Escape or the close button leaves. A video starts playing with its controls.
 */
export const MediaViewer: React.FC<{ items: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }> = ({ items, index, onIndex, onClose }) => {
  const item = items[index];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  if (!item) return null;
  const nav = 'absolute top-1/2 z-10 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white disabled:hidden';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.caption || (item.type === 'VIDEO' ? 'Video' : 'Photo')} className="fixed inset-0 z-[4000] flex flex-col bg-black/92" onClick={onClose}>
      <div className="pt-safe flex items-center justify-between gap-3 px-4 pb-2 text-white">
        <p className="text-sm tabular-nums text-white/70">
          {index + 1} of {items.length}
        </p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/15 hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
        <button type="button" className={`${nav} left-2`} disabled={index === 0} onClick={(e) => (e.stopPropagation(), onIndex(index - 1))} aria-label="Previous">
          <ChevronLeft className="size-6" />
        </button>
        {item.type === 'VIDEO' ? (
          <video
            key={item.id}
            src={item.url}
            poster={item.thumbUrl}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-full max-w-full rounded-lg bg-black"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img key={item.id} src={item.url} alt={item.caption} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        )}
        <button type="button" className={`${nav} right-2`} disabled={index === items.length - 1} onClick={(e) => (e.stopPropagation(), onIndex(index + 1))} aria-label="Next">
          <ChevronRight className="size-6" />
        </button>
      </div>
      <p className="pb-safe min-h-14 px-4 pt-3 pb-3 text-center text-white" onClick={(e) => e.stopPropagation()}>
        {item.caption}
      </p>
    </div>,
    document.body
  );
};
