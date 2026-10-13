import { ChevronUp, Search, X } from 'lucide-react';
import { Button } from '../ui/button';

/** Collapsed trees list: a search bar. Tapping it opens the sheet with the search box ready. */
export const SearchPeek: React.FC<{ count: number | null; onOpen: () => void }> = ({ count, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-full bg-input px-4 text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Search className="size-5 shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate">Search {count ? `${count} trees` : 'trees'} or places</span>
  </button>
);

/** Collapsed tree or drive: picture or icon, name, a short line, and buttons to open or close. */
export const ItemPeek: React.FC<{
  image?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  onOpen: () => void;
  onClose: () => void;
  closeLabel: string;
}> = ({ image, icon, title, subtitle, onOpen, onClose, closeLabel }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show details for ${title}`}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {image ? (
        <img src={image} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-bark/15 text-bark [&>svg]:size-5">{icon}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-base font-bold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronUp className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
    <Button variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel}>
      <X className="size-5!" />
    </Button>
  </div>
);

/** Collapsed directions: time and distance left, and End. */
export const NavigationPeek: React.FC<{ summary: string; onOpen: () => void; onEnd: () => void }> = ({ summary, onOpen, onEnd }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-2xl py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate font-heading text-lg font-bold text-leaf">{summary}</span>
      <ChevronUp className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
    <Button variant="danger" onClick={onEnd}>End</Button>
  </div>
);
