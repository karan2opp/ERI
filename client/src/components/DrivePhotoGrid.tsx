import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { DrivePhoto } from '../types';
import { fetchDrivePhotos, removeDrivePhoto, type DrivePhotosPage } from '../services/api';
import { replaceDrivePhoto } from '../services/photoApi';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Pager } from './ui/pager';
import { Spinner } from './ui/spinner';

const PAGE_SIZE = 10;

const overlayButton =
  'grid size-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

/**
 * A drive's pictures, 10 to a page (the server pages them). Tapping one opens it large.
 * With `onChanged`, admins also get a replace and a remove button on each picture.
 */
export const DrivePhotoGrid: React.FC<{
  driveId: string;
  /** Change it to reload (e.g. after adding a picture) */
  refreshKey?: number;
  /** Admins only: called after a picture is replaced or removed */
  onChanged?: () => void;
  /** Tells the parent how many pictures there are */
  onTotal?: (total: number) => void;
}> = ({ driveId, refreshKey = 0, onChanged, onTotal }) => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DrivePhotosPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<DrivePhoto | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<DrivePhoto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<DrivePhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDrivePhotos(driveId, page, PAGE_SIZE).then(
      (res) => {
        if (cancelled) return;
        // Removing the last picture on a page: go back one
        if (res.data.length === 0 && page > 1) return setPage(page - 1);
        setResult(res);
        setFailed(false);
        setLoading(false);
        onTotal?.(res.total);
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
    // onTotal is only a notification
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveId, page, refreshKey]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setViewing(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  const change = async (photo: DrivePhoto, action: () => Promise<unknown>, failure: string) => {
    setBusyId(photo.id);
    setError(null);
    try {
      await action();
      onChanged?.();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || failure);
    } finally {
      setBusyId(null);
    }
  };

  const remove = (photo: DrivePhoto) => change(photo, () => removeDrivePhoto(driveId, photo.id), "Couldn't remove that picture. Try again.");
  const replace = (photo: DrivePhoto, file: File) => change(photo, () => replaceDrivePhoto(driveId, photo.id, file), "Couldn't replace that picture. Try again.");

  if (failed) return <Alert tone="error">Couldn't load the pictures. Check your connection and try again.</Alert>;
  if (!result) return <Spinner label="Loading pictures" />;
  if (result.total === 0) return onChanged ? <p className="text-muted-foreground">No pictures yet.</p> : null;

  return (
    <div className="flex flex-col gap-3">
      <ul className={`grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {result.data.map((photo, i) => (
          <li key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
            <button
              type="button"
              onClick={() => setViewing(photo)}
              className="size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open picture ${(page - 1) * PAGE_SIZE + i + 1}`}
            >
              <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" />
            </button>
            {onChanged && (
              <div className="absolute top-1.5 right-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    replacing.current = photo;
                    replaceInput.current?.click();
                  }}
                  disabled={busyId === photo.id}
                  aria-label={`Replace picture ${(page - 1) * PAGE_SIZE + i + 1}`}
                  className={overlayButton}
                >
                  {busyId === photo.id ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(photo)}
                  disabled={busyId === photo.id}
                  aria-label={`Remove picture ${(page - 1) * PAGE_SIZE + i + 1}`}
                  className={overlayButton}
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && <Alert tone="error">{error}</Alert>}
      {onChanged && (
        <input
          ref={replaceInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose the new picture"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file && replacing.current) replace(replacing.current, file);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove this picture?"
        description="It is deleted for everyone and this can't be undone."
        confirmLabel="Remove picture"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const photo = confirmRemove;
          setConfirmRemove(null);
          if (photo) remove(photo);
        }}
      />
      <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun="pictures" />

      {viewing && (
        <div role="dialog" aria-modal="true" aria-label="Drive picture" className="fixed inset-0 z-[3500] flex flex-col bg-black/90" onClick={() => setViewing(null)}>
          <div className="pt-safe flex justify-end p-2">
            <Button variant="ghost" size="icon" onClick={() => setViewing(null)} aria-label="Close picture" className="text-white hover:bg-white/15">
              <X className="size-6!" />
            </Button>
          </div>
          <div className="pb-safe flex min-h-0 flex-1 items-center justify-center p-2">
            <img src={viewing.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
};
