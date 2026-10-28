import { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { MAX_VIDEO_BYTES, discardPhoto, uploadPhotos, type UploadedPhoto } from '../lib/uploadPhoto';
import { shrinkImage } from '../lib/shrinkImage';
import { addMedia, deleteMedia, fetchMedia, updateMediaCaption, type MediaFilter, type MediaItem, type MediaPage } from '../services/mediaApi';
import { MediaTile, MediaViewer } from './media/MediaViewer';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Chips } from './ui/chips';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Input } from './ui/field';
import { Pager } from './ui/pager';
import { Spinner } from './ui/spinner';
import { cn } from '../lib/cn';

const PAGE_SIZE = 10;
/** The most files added in one go (the server allows the same). */
const MAX_BATCH = 10;

const errorText = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err instanceof Error ? err.message : '') || fallback;
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

interface Staged {
  key: string;
  file: File;
  type: 'IMAGE' | 'VIDEO';
  caption: string;
  /** 0 to 1 while it is being sent */
  progress: number;
  preview: string | null;
}

/**
 * Admin > Media: add photos and videos to the Media page and remove or caption the ones already there. Files go from
 * this browser straight to Cloudinary (never through our server); the server is then told which files to add.
 */
export const AdminMedia: React.FC = () => {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<MediaFilter>('all');
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<MediaPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [caption, setCaption] = useState('');
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedia({ type: filter, page, limit: PAGE_SIZE, v: version }).then(
      (res) => {
        if (cancelled) return;
        // Removing the last item on a page: go back one
        if (res.data.length === 0 && page > 1) return setPage(page - 1);
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
  }, [filter, page, version]);

  // Preview pictures are freed when they are no longer needed
  const previews = useRef<string[]>([]);
  useEffect(
    () => () => {
      previews.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const choose = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setNotice(null);
    const problems: string[] = [];
    const added: Staged[] = [];
    for (const file of Array.from(files)) {
      const type = file.type.startsWith('video/') ? 'VIDEO' : file.type.startsWith('image/') ? 'IMAGE' : null;
      if (!type) problems.push(`${file.name} is not a photo or a video`);
      else if (type === 'VIDEO' && file.size > MAX_VIDEO_BYTES) problems.push(`${file.name} is ${megabytes(file.size)}; videos can be up to ${megabytes(MAX_VIDEO_BYTES)}`);
      else if (staged.length + added.length >= MAX_BATCH) problems.push(`Only ${MAX_BATCH} files can be added at a time`);
      else {
        const preview = type === 'IMAGE' ? URL.createObjectURL(file) : null;
        if (preview) previews.current.push(preview);
        added.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, type, caption: '', progress: 0, preview });
      }
    }
    setStaged((s) => [...s, ...added]);
    if (problems.length) setNotice({ tone: 'error', text: [...new Set(problems)].join('. ') + '.' });
    if (input.current) input.current.value = '';
  };

  const setProgress = (keys: string[]) => (index: number, fraction: number) => setStaged((s) => s.map((x) => (x.key === keys[index] ? { ...x, progress: fraction } : x)));

  const send = async () => {
    if (staged.length === 0 || sending) return;
    setSending(true);
    setNotice(null);
    setStaged((s) => s.map((x) => ({ ...x, progress: 0 })));
    const images = staged.filter((s) => s.type === 'IMAGE');
    const videos = staged.filter((s) => s.type === 'VIDEO');
    const uploaded: UploadedPhoto[] = [];
    try {
      // Photos are made smaller first (they are shown at most 1600 px wide); videos go as they are
      const shrunk = await Promise.all(images.map((s) => shrinkImage(s.file)));
      const imageRefs = await uploadPhotos('MEDIA', shrunk, undefined, setProgress(images.map((s) => s.key)));
      uploaded.push(...imageRefs);
      const videoRefs = await uploadPhotos('VIDEO', videos.map((s) => s.file), undefined, setProgress(videos.map((s) => s.key)));
      uploaded.push(...videoRefs);
      const refOf = new Map<string, UploadedPhoto>();
      images.forEach((s, i) => refOf.set(s.key, imageRefs[i]));
      videos.forEach((s, i) => refOf.set(s.key, videoRefs[i]));
      await addMedia(staged.map((s) => ({ type: s.type, file: refOf.get(s.key)!, caption: s.caption.trim() || undefined })));
      const count = staged.length;
      setStaged([]);
      setFilter('all');
      setPage(1);
      setVersion((v) => v + 1);
      setNotice({ tone: 'success', text: `${count === 1 ? 'Added to' : `${count} items added to`} the Media page.` });
    } catch (err) {
      // Nothing was added, so what already went up is thrown away (anything missed is cleaned up daily)
      for (const r of uploaded) void discardPhoto(r.publicId);
      setNotice({ tone: 'error', text: errorText(err, "Couldn't add them. Check your connection and try again.") });
    } finally {
      setSending(false);
    }
  };

  const saveCaption = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateMediaCaption(editing.id, caption.trim());
      setEditing(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, "Couldn't save the caption. Try again.") });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteMedia(removing.id);
      setRemoving(null);
      setVersion((v) => v + 1);
      setNotice({ tone: 'success', text: 'Removed from the Media page.' });
    } catch (err) {
      setRemoving(null);
      setNotice({ tone: 'error', text: errorText(err, "Couldn't remove it. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const counts = result?.counts;
  const options = [
    { value: 'all' as const, label: counts ? `All · ${counts.images + counts.videos}` : 'All' },
    { value: 'image' as const, label: counts ? `Photos · ${counts.images}` : 'Photos', icon: <ImageIcon className="size-4" aria-hidden="true" /> },
    { value: 'video' as const, label: counts ? `Videos · ${counts.videos}` : 'Videos', icon: <Film className="size-4" aria-hidden="true" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="media-add">
        <h2 id="media-add" className="text-xl">Add photos and videos</h2>
        <p className="text-muted-foreground">
          Shown on the public <a href="/media" className="font-medium text-primary underline-offset-2 hover:underline">Media page</a>. Up to {MAX_BATCH} at a time; videos can be up to {megabytes(MAX_VIDEO_BYTES)}. They go straight from your device to our image storage.
        </p>
        <input
          ref={input}
          id="media-files"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.m4v,.3gp"
          className="sr-only"
          onChange={(e) => choose(e.target.files)}
          disabled={sending}
        />
        <Button size="xl" variant="secondary" onClick={() => input.current?.click()} disabled={sending || staged.length >= MAX_BATCH} className="self-start">
          <Plus aria-hidden="true" /> Choose photos or videos
        </Button>

        {staged.length > 0 && (
          <ul className="flex flex-col gap-3">
            {staged.map((s) => (
              <li key={s.key} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-card text-muted-foreground">
                  {s.preview ? <img src={s.preview} alt="" className="size-full object-cover" /> : <Film className="size-7" aria-hidden="true" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {s.file.name} <span className="font-normal text-muted-foreground">· {s.type === 'VIDEO' ? 'video' : 'photo'}, {megabytes(s.file.size)}</span>
                  </span>
                  <Input
                    value={s.caption}
                    onChange={(e) => setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, caption: e.target.value } : x)))}
                    placeholder="Caption (optional)"
                    aria-label={`Caption for ${s.file.name}`}
                    maxLength={300}
                    disabled={sending}
                    className="h-10 rounded-xl bg-card text-[15px]"
                  />
                  {sending && (
                    <span className="h-1.5 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuenow={Math.round(s.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${s.file.name}`}>
                      <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                    </span>
                  )}
                </span>
                {!sending && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${s.file.name} from this list`} onClick={() => setStaged((all) => all.filter((x) => x.key !== s.key))}>
                    <X className="size-5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {staged.length > 0 && (
          <Button size="xl" onClick={send} disabled={sending} className="self-start">
            {sending ? <Spinner className="size-5" /> : <Upload aria-hidden="true" />}
            {sending ? 'Uploading…' : `Add ${staged.length} to the Media page`}
          </Button>
        )}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="media-library">
        <h2 id="media-library" className="text-xl">On the Media page</h2>
        <Chips
          label="Show"
          options={options}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          size="sm"
          className="no-scrollbar -mx-4 overflow-x-auto px-4"
        />
        {failed && <Alert tone="error">Couldn't load the list. Refresh to try again.</Alert>}
        {!result && !failed ? (
          <Spinner />
        ) : result && result.data.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">{filter === 'all' ? 'Nothing here yet. Add the first photos or videos above.' : `No ${filter === 'image' ? 'photos' : 'videos'} yet.`}</p>
        ) : result ? (
          <>
            <ul className={cn('grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3', loading && 'opacity-60')} aria-busy={loading}>
              {result.data.map((item, i) => (
                <MediaTile
                  key={item.id}
                  item={item}
                  onOpen={() => setViewing(i)}
                  overlay={
                    <span className="absolute top-2 right-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(item);
                          setCaption(item.caption);
                        }}
                        aria-label="Edit the caption"
                        className="grid size-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(item)}
                        aria-label="Remove from the Media page"
                        className="grid size-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  }
                />
              ))}
            </ul>
            <Pager page={page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'item' : 'items'} />
          </>
        ) : null}
      </section>

      {result && viewing !== null && <MediaViewer items={result.data} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.type === 'VIDEO' ? 'Remove this video?' : 'Remove this photo?'}
        description="It disappears from the Media page and is deleted from our image storage. This can't be undone."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog open={Boolean(editing)} title="Caption" description="Shown under the photo or video on the Media page. Leave it empty for none." confirmLabel="Save" tone="default" busy={busy} onConfirm={saveCaption} onCancel={() => setEditing(null)}>
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} aria-label="Caption" className="mt-3" onKeyDown={(e) => e.key === 'Enter' && saveCaption()} autoFocus />
      </ConfirmDialog>
    </div>
  );
};
