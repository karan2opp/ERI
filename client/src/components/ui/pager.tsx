import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

/**
 * Previous / "Page 2 of 5" / Next. Hidden when everything fits on one page, unless `alwaysShow`.
 * With `total`, `pageSize` and `noun` it also says which items are on screen: "Showing 11–20 of 34 users".
 */
export const Pager: React.FC<{
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  alwaysShow?: boolean;
  total?: number;
  pageSize?: number;
  noun?: string;
}> = ({ page, totalPages, onPage, alwaysShow, total, pageSize, noun }) => {
  if (totalPages <= 1 && !alwaysShow) return null;
  const pages = Math.max(1, totalPages);
  const range =
    total !== undefined && pageSize
      ? total === 0
        ? `No ${noun ?? 'results'}`
        : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}${noun ? ` ${noun}` : ''}`
      : null;
  return (
    <div className="flex flex-col gap-2">
      <nav className="flex items-center justify-between gap-2" aria-label="Pages">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" /> Previous
        </Button>
        <span className="text-muted-foreground tabular-nums" aria-live="polite">
          Page {page} of {pages}
        </span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
      {range && <p className="text-center text-sm text-muted-foreground">{range}</p>}
    </div>
  );
};
