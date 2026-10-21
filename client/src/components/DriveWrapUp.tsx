import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus } from 'lucide-react';
import type { Drive } from '../types';
import { addDrivePhoto, completeDrive, fetchAppSettings, reopenDrive, updateDrive } from '../services/api';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Field, Textarea } from './ui/field';
import { Spinner } from './ui/spinner';
import { DrivePhotoGrid } from './DrivePhotoGrid';

const errorOf = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Admins wrap a drive up here: write how it went, add pictures (up to the limit set in Settings), and mark
 * it completed. Until then the summary and pictures are a draft only admins see; once it is completed everyone
 * who can see the drive sees them. A completed drive can still be edited, or reopened.
 */
export const DriveWrapUp: React.FC<{ drive: Drive; onUpdated: (drive: Drive) => void }> = ({ drive, onUpdated }) => {
  const completed = drive.status === 'COMPLETED';
  const [summary, setSummary] = useState(drive.summary ?? '');
  const [saved, setSaved] = useState(drive.summary ?? '');
  const [limit, setLimit] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<'save' | 'complete' | 'reopen' | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAppSettings().then((s) => setLimit(s.drivePhotoLimit), () => setLimit(null));
  }, []);

  // Another drive opened in the same place
  useEffect(() => {
    setSummary(drive.summary ?? '');
    setSaved(drive.summary ?? '');
    setNotice(null);
    setError(null);
  }, [drive.id]);

  const dirty = summary.trim() !== saved.trim();
  const room = limit !== null && count !== null ? Math.max(0, limit - count) : null;

  const saveSummary = async () => {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const res = await updateDrive(drive.id, { summary: summary.trim() });
      setSaved(res.drive.summary ?? '');
      setSummary(res.drive.summary ?? '');
      setNotice('Summary saved.');
      onUpdated(res.drive);
    } catch (err) {
      setError(errorOf(err, "Couldn't save the summary. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const complete = async () => {
    setBusy('complete');
    setError(null);
    setNotice(null);
    try {
      onUpdated(await completeDrive(drive.id, summary.trim()));
      setConfirming(false);
      setNotice('Drive completed. Everyone who can see this drive can now read the summary and see the pictures.');
    } catch (err) {
      setConfirming(false);
      setError(errorOf(err, "Couldn't complete the drive. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const reopen = async () => {
    setBusy('reopen');
    setError(null);
    setNotice(null);
    try {
      onUpdated(await reopenDrive(drive.id));
      setNotice('Drive reopened. The summary and pictures are hidden from everyone but admins until you complete it again.');
    } catch (err) {
      setError(errorOf(err, "Couldn't reopen the drive. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const addPictures = async (files: File[]) => {
    if (fileInput.current) fileInput.current.value = '';
    if (files.length === 0) return;
    setError(null);
    setNotice(null);
    const allowed = room === null ? files : files.slice(0, room);
    let added = 0;
    try {
      for (const [i, file] of allowed.entries()) {
        setUploading(`Adding picture ${i + 1} of ${allowed.length}…`);
        await addDrivePhoto(drive.id, file);
        added++;
        setRefreshKey((k) => k + 1);
      }
      if (allowed.length < files.length) {
        setNotice(`Added ${added}. The limit is ${limit} pictures, so the rest were left out.`);
      }
    } catch (err) {
      setError(errorOf(err, "Couldn't add that picture. Try again."));
    } finally {
      setUploading(null);
      setRefreshKey((k) => k + 1);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-muted p-4" aria-labelledby="drive-wrapup">
      <div className="flex items-center gap-2">
        {completed && <CheckCircle2 className="size-5 text-leaf" aria-hidden="true" />}
        <h3 id="drive-wrapup" className="text-lg">{completed ? 'Drive completed' : 'Wrap up this drive'}</h3>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        {completed
          ? 'Everyone who can see this drive sees the summary and pictures below. You can still change them.'
          : 'Write how the drive went and add pictures. Only admins see them until you mark the drive as completed.'}
      </p>

      <Field label="Summary" htmlFor="drive-summary">
        <Textarea
          id="drive-summary"
          rows={5}
          maxLength={5000}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What was done, how many people came, how many trees were planted or how much was cleaned…"
        />
      </Field>
      {dirty && (
        <Button variant="secondary" onClick={saveSummary} disabled={busy !== null || (completed && !summary.trim())}>
          {busy === 'save' ? <Spinner className="size-4" /> : null} Save summary
        </Button>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-base font-medium">Pictures</h4>
          {count !== null && limit !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">{count} of {limit}</span>
          )}
        </div>
        <DrivePhotoGrid driveId={drive.id} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} onTotal={setCount} />
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          id="drive-pictures"
          onChange={(e) => addPictures(Array.from(e.target.files ?? []))}
        />
        <Button variant="secondary" size="lg" onClick={() => fileInput.current?.click()} disabled={uploading !== null || room === 0}>
          {uploading ? <Spinner className="size-4" /> : <ImagePlus aria-hidden="true" />} {uploading ?? (room === 0 ? 'Picture limit reached' : 'Add pictures')}
        </Button>
        {room === 0 && <p className="text-sm text-muted-foreground">Remove a picture to add another, or raise the limit in Settings.</p>}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {completed ? (
        <Button variant="secondary" onClick={reopen} disabled={busy !== null}>
          {busy === 'reopen' ? <Spinner className="size-4" /> : null} Reopen drive
        </Button>
      ) : (
        <Button size="xl" onClick={() => setConfirming(true)} disabled={busy !== null || uploading !== null || !summary.trim()}>
          <CheckCircle2 aria-hidden="true" /> Mark as completed
        </Button>
      )}
      {!completed && !summary.trim() && <p className="-mt-2 text-sm text-muted-foreground">Write a summary to complete the drive.</p>}

      <ConfirmDialog
        open={confirming}
        title={`Complete ${drive.title}?`}
        description={`The summary and ${count ? `${count} ${count === 1 ? 'picture' : 'pictures'}` : 'pictures'} become visible to ${drive.visibility === 'ALL' ? 'everyone, including people who are not signed in' : 'team members and admins'}. You can reopen the drive later.`}
        confirmLabel="Complete drive"
        tone="default"
        busy={busy === 'complete'}
        onCancel={() => setConfirming(false)}
        onConfirm={complete}
      />
    </section>
  );
};
