import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { TreeCategory } from '../types';
import { fetchCategories } from '../services/api';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

const PAGE_SIZE = 10;

/**
 * A select box for the kind of tree. The categories come from the server 10 at a time: search narrows
 * them, and "Show more" fetches the next page, so it stays quick however many an admin adds.
 */
export const CategorySelect: React.FC<{
  id?: string;
  value: TreeCategory | null;
  onChange: (category: TreeCategory) => void;
  /** Shown when nothing is chosen yet */
  placeholder?: string;
}> = ({ id = 'category-select', value, onChange, placeholder = 'Choose a kind of tree' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<TreeCategory[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Wait until typing pauses; a new search starts again from page 1
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchCategories({ page, limit: PAGE_SIZE, search }).then(
      (res) => {
        if (cancelled) return;
        // Later pages are added under the earlier ones
        setItems((prev) => (page === 1 ? res.data : [...prev, ...res.data.filter((c) => !prev.some((p) => p.id === c.id))]));
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, page, search]);

  // Close on a tap outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-input px-4 text-left text-base outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          value ? 'text-foreground' : 'text-muted-foreground/80'
        )}
      >
        <span className="min-w-0 flex-1 truncate">{value ? value.name : placeholder}</span>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sheet">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search kinds of tree"
              aria-label="Search kinds of tree"
              autoFocus
              className="h-11 w-full rounded-full bg-input pr-4 pl-9 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <ul role="listbox" aria-label="Kinds of tree" className="max-h-72 overflow-y-auto overscroll-contain">
            {items.map((c) => {
              const selected = value?.id === c.id;
              return (
                <li key={c.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.name}</span>
                      {c.description && <span className="block truncate text-sm text-muted-foreground">{c.description}</span>}
                    </span>
                    {selected && <Check className="size-4 shrink-0 text-leaf" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {loading && (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Spinner className="size-4" /> Loading…
            </p>
          )}
          {failed && <p className="px-3 py-2 text-sm text-destructive">Couldn't load the kinds of tree. Check your connection and try again.</p>}
          {!loading && !failed && total === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {search ? `No kind of tree matches "${search}".` : 'No kinds of tree have been added yet. Ask an admin to add some.'}
            </p>
          )}
          {!loading && page < totalPages && (
            <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
              Show more ({total !== null ? total - items.length : ''} left)
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
