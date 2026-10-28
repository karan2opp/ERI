import { useEffect, useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';
import { MediaTile, MediaViewer } from '../components/media/MediaViewer';
import { Chips } from '../components/ui/chips';
import { Pager } from '../components/ui/pager';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { cn } from '../lib/cn';
import { fetchMedia, type MediaFilter, type MediaPage as MediaResult } from '../services/mediaApi';

const PAGE_SIZE = 10;

/**
 * The Media page (/media): photos and videos of the team at work. Admins add them in Admin > Media. The server
 * pages them, 10 at a time, newest first; tapping one opens it large (a video plays).
 */
export const MediaPage: React.FC = () => {
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Media · Earth Revival Initiative';
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedia({ type: filter, page, limit: PAGE_SIZE }).then(
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
  }, [filter, page]);

  const counts = result?.counts;
  const options = [
    { value: 'all' as const, label: counts ? `All · ${counts.images + counts.videos}` : 'All' },
    { value: 'image' as const, label: counts ? `Photos · ${counts.images}` : 'Photos', icon: <ImageIcon className="size-4" aria-hidden="true" /> },
    { value: 'video' as const, label: counts ? `Videos · ${counts.videos}` : 'Videos', icon: <Film className="size-4" aria-hidden="true" /> },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <p className="text-sm font-semibold tracking-wide text-leaf">Media</p>
        <h1 className="mt-2 text-[2rem] leading-tight md:text-5xl">Our team at work</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">Photos and videos from our plantation drives, clean-ups and the days we spend looking after the trees.</p>

        <div className="mt-8 flex flex-col gap-6">
          <Chips
            label="Show"
            options={options}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            className="no-scrollbar -mx-4 overflow-x-auto px-4"
          />

          {failed && <Alert tone="error">Couldn't load the photos and videos. Check your connection and refresh to try again.</Alert>}

          {!result && !failed ? (
            <div className="grid place-items-center py-16">
              <Spinner className="size-8" />
            </div>
          ) : result && result.data.length === 0 ? (
            <p className="rounded-2xl bg-muted p-8 text-center text-muted-foreground">
              {filter === 'all' ? 'Photos and videos of our work will appear here soon.' : `No ${filter === 'image' ? 'photos' : 'videos'} yet.`}
            </p>
          ) : result ? (
            <>
              <ul className={cn('grid grid-cols-2 gap-3 transition-opacity sm:gap-4 md:grid-cols-3 lg:grid-cols-4', loading && 'opacity-60')} aria-busy={loading}>
                {result.data.map((item, i) => (
                  <MediaTile key={item.id} item={item} onOpen={() => setViewing(i)} />
                ))}
              </ul>
              <Pager page={page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'item' : 'items'} />
            </>
          ) : null}
        </div>
      </main>

      <SiteFooter />

      {result && viewing !== null && <MediaViewer items={result.data} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
};
