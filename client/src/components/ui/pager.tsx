import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

/** Previous / "Page 2 of 5" / Next. Hidden when everything fits on one page. */
export const Pager: React.FC<{ page: number; totalPages: number; onPage: (page: number) => void }> = ({ page, totalPages, onPage }) =>
  totalPages <= 1 ? null : (
    <nav className="flex items-center justify-between gap-2" aria-label="Pages">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft aria-hidden="true" /> Previous
      </Button>
      <span className="text-muted-foreground tabular-nums" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
