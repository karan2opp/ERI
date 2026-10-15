import { useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, Lock, Search, X } from 'lucide-react';
import type { Drive, DriveType, DriveVisibility } from '../types';
import { fetchDrivesPage, type DrivesPageResult } from '../services/api';
import { DRIVE_TYPE_LABEL, driveStartsAt, isUpcoming } from '../lib/drives';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Chips } from './ui/chips';
import { Select } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Pager } from './ui/pager';
import { Sapling } from './ui/logo';
import { DriveCalendar } from './DriveCalendar';

type When = 'upcoming' | 'past' | 'all';

const WHEN_OPTIONS = [
  { value: 'upcoming' as const, label: 'Upcoming' },
  { value: 'past' as const, label: 'Past' },
  { value: 'all' as const, label: 'All' },
];

type TypeFilter = 'ALL' | DriveType;
type VisibilityFilter = 'ANY' | DriveVisibility;

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  { value: 'PLANTATION', label: 'Plantation' },
  { value: 'CLEANUP', label: 'Clean-up' },
];

const VISIBILITY_OPTIONS: { value: VisibilityFilter; label: string }[] = [
  { value: 'ANY', label: 'Any visibility' },
  { value: 'ALL', label: 'Everyone' },
  { value: 'TEAM', label: 'Team only' },
];

const PAGE_SIZE = 10;

const shortDate = (date: string) =>
  new Date(`${date}T00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** One drive in the list: a date block, title, time and place, and whether it's coming up. */
const DriveCard: React.FC<{ drive: Drive; showVisibility: boolean; onOpen: (d: Drive) => void }> = ({ drive, showVisibility, onOpen }) => {
  const at = driveStartsAt(drive);
  const upcoming = isUpcoming(drive);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(drive)}
        className="flex w-full cursor-pointer items-center gap-4 rounded-2xl p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl',
            upcoming ? (drive.type === 'CLEANUP' ? 'bg-cleanup/12 text-cleanup' : 'bg-bark/12 text-bark') : 'bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          <span className="font-heading text-2xl leading-none font-extrabold">{at ? at.getDate() : '–'}</span>
          <span className="mt-1 text-xs font-semibold uppercase">{at ? at.toLocaleDateString('en-IN', { month: 'short' }) : ''}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-medium">{drive.title}</span>
          <span className="block truncate text-muted-foreground">
            {DRIVE_TYPE_LABEL[drive.type]} · {at ? at.toLocaleDateString('en-IN', { weekday: 'short' }) : drive.date}, {drive.time}
            {/* The year only when it isn't this year */}
            {at && at.getFullYear() !== new Date().getFullYear() ? `, ${at.getFullYear()}` : ''}
            {drive.address ? ` · ${drive.address}` : ''}
          </span>
        </span>
        {showVisibility && drive.visibility === 'TEAM' && (
          <Badge variant="outline" className="shrink-0" title="Only team members and admins can see this drive">
            <Lock aria-hidden="true" /> <span className="max-sm:sr-only">Team</span>
          </Badge>
        )}
        <Badge variant={upcoming ? 'healthy' : 'outline'} className="max-sm:hidden">{upcoming ? 'Upcoming' : 'Past'}</Badge>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
};

/**
 * Drives with every way to find one: search by title, kind of drive, Upcoming / Past (the full history) /
 * All with counts, a calendar to pick a day, and pagination. Used on the public Drives page and in Admin.
 */
export const DrivesBrowser: React.FC<{
  onOpen: (drive: Drive) => void;
  /** Change it to reload (e.g. after scheduling a drive) */
  refreshKey?: number;
  /** Shown above the filters, e.g. Admin's "Schedule a drive" */
  actions?: React.ReactNode;
  /** Team members and admins can filter by visibility and see which drives are team only */
  showVisibility?: boolean;
}> = ({ onOpen, refreshKey = 0, actions, showVisibility = false }) => {
  const [when, setWhen] = useState<When>('upcoming');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // debounced query
  const [date, setDate] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('ANY');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DrivesPageResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Wait until typing pauses before searching
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Any new filter starts again from page 1
  useEffect(() => setPage(1), [search, date, when, typeFilter, visibilityFilter]);

  // A picked day shows every drive on it, whether it's coming up or already happened
  const effectiveWhen: When = date ? 'all' : when;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDrivesPage({
      page,
      limit: PAGE_SIZE,
      search,
      date,
      when: effectiveWhen,
      type: typeFilter === 'ALL' ? null : typeFilter,
      visibility: visibilityFilter === 'ANY' ? null : visibilityFilter,
    }).then(
      (res) => {
        if (cancelled) return;
        setResult(res);
        setFailed(false);
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
  }, [page, search, date, effectiveWhen, typeFilter, visibilityFilter, refreshKey]);

  const filtersOn = Boolean(search || date || typeFilter !== 'ALL' || visibilityFilter !== 'ANY');
  const clearFilters = () => {
    setQuery('');
    setDate(null);
    setTypeFilter('ALL');
    setVisibilityFilter('ANY');
  };

  const heading = date
    ? `Drives on ${shortDate(date)}`
    : effectiveWhen === 'upcoming'
      ? 'Coming up'
      : effectiveWhen === 'past'
        ? 'History'
        : 'All drives';

  return (
    <div className="grid gap-6 md:grid-cols-[20rem_1fr] md:items-start">
        {/* Filters: search, upcoming/past/all, and the calendar (always open beside the list on wider screens) */}
        <div className="flex flex-col gap-4 md:sticky md:top-20">
          {actions}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title"
              aria-label="Search drives by title"
              className="h-12 w-full rounded-full bg-input pr-4 pl-12 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
          </div>

          {/* Upcoming / Past (the history) / All, each with how many there are */}
          <Chips
            label="Which drives"
            size="sm"
            value={date ? null : when}
            onChange={(w) => {
              setDate(null);
              setWhen(w);
            }}
            options={WHEN_OPTIONS.map((o) => ({
              ...o,
              label: result
                ? `${o.label} · ${o.value === 'all' ? result.counts.upcoming + result.counts.past : result.counts[o.value]}`
                : o.label,
            }))}
          />

          {/* Kind of drive, and (team members and admins) who it's visible to */}
          <div className={cn('grid gap-2', showVisibility && 'grid-cols-2')}>
            <Select aria-label="Kind of drive" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            {showVisibility && (
              <Select aria-label="Visibility" value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}>
                {VISIBILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </div>

          <Button variant="secondary" className="md:hidden" onClick={() => setCalendarOpen((o) => !o)} aria-expanded={calendarOpen}>
            <CalendarDays aria-hidden="true" /> {calendarOpen ? 'Hide calendar' : 'Pick a date'}
          </Button>
          <div className={cn(!calendarOpen && 'max-md:hidden')}>
            <DriveCalendar
              value={date}
              onChange={(d) => {
                setDate(d);
                if (d) setCalendarOpen(false);
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">Days with a dot have drives. Tap a day to see them.</p>
          </div>
        </div>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="drives-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="drives-heading" className="text-xl">
              {heading}
              {result && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{result.total}</span>}
            </h2>
            {filtersOn && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden="true" /> Clear filters
              </Button>
            )}
          </div>

          {/* What's filtering the list right now */}
          {filtersOn && (
            <div className="flex flex-wrap gap-2">
              {date && (
                <Badge variant="secondary" className="h-8 pr-1">
                  {shortDate(date)}
                  <button type="button" onClick={() => setDate(null)} aria-label="Remove date filter" className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-accent">
                    <X />
                  </button>
                </Badge>
              )}
              {search && (
                <Badge variant="secondary" className="h-8 pr-1">
                  "{search}"
                  <button type="button" onClick={() => setQuery('')} aria-label="Remove search" className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-accent">
                    <X />
                  </button>
                </Badge>
              )}
            </div>
          )}

          {failed ? (
            <Alert tone="error">Couldn't load drives. Check your connection and try again.</Alert>
          ) : loading && !result ? (
            <Spinner label="Loading drives" />
          ) : result && result.data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Sapling />
              <p className="max-w-xs text-muted-foreground">
                {filtersOn
                  ? 'No drives match. Try another day or a different word.'
                  : effectiveWhen === 'upcoming'
                    ? "No drives coming up yet. When one is scheduled it'll show up here and on the map."
                    : 'No past drives yet.'}
              </p>
              {filtersOn && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
            </div>
          ) : (
            result && (
              <ul className={cn('flex flex-col gap-1 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
                {result.data.map((d) => (
                  <DriveCard key={d.id} drive={d} showVisibility={showVisibility} onOpen={onOpen} />
                ))}
              </ul>
            )
          )}

          {result && <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} />}
        </section>
      </div>
  );
};
