import { useEffect, useState } from 'react';
import { Check, ExternalLink, MapPin, X } from 'lucide-react';
import type { Tree } from '../types';
import { fetchPendingTrees, reviewTree, type Paged } from '../services/api';
import { timeAgo } from '../lib/trees';
import { Button, buttonClass } from './ui/button';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';
import { Pager } from './ui/pager';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Sapling } from './ui/logo';

const PAGE_SIZE = 10;

type PendingTree = Tree & { ownerEmail?: string | null };

/**
 * Trees whose photo the automatic check wasn't sure about (or couldn't check), oldest first, 10 per page.
 * An admin looks at the photo and either approves the tree onto the map or rejects it, which removes it.
 */
export const AdminReview: React.FC<{ onReviewed: () => void }> = ({ onReviewed }) => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<PendingTree> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPendingTrees(page, PAGE_SIZE).then(
      (res) => {
        if (cancelled) return;
        // The last tree on a page was just reviewed: step back to the page before
        if (res.data.length === 0 && page > 1) setPage(page - 1);
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
  }, [page, version]);

  const decide = async (tree: PendingTree, decision: 'APPROVE' | 'REJECT') => {
    setBusy(tree.id);
    setError(null);
    try {
      await reviewTree(tree.id, decision);
      setRejecting(null);
      setVersion((v) => v + 1);
      onReviewed();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save that decision. Try again.");
      setRejecting(null);
      // Somebody else may have already reviewed it: refresh the list
      setVersion((v) => v + 1);
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <Alert tone="error">Couldn't load the trees to review. Check your connection and try again.</Alert>;
  if (!result) return <Spinner label="Loading trees to review" />;

  if (result.total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Sapling className="h-24" />
        <h2 className="text-2xl">Nothing to review</h2>
        <p className="max-w-xs text-muted-foreground">Photos the automatic check isn't sure about show up here.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">
        The automatic photo check wasn't sure about these. Approve a tree if the photo shows a real tree or plant, otherwise reject it.
      </p>
      {error && <Alert tone="error">{error}</Alert>}

      <ul className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {result.data.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
            <img src={t.photoUrl} alt={`Photo submitted for ${t.name}`} className="aspect-[4/3] w-full rounded-xl bg-card object-cover" loading="lazy" />
            <div className="min-w-0">
              <h3 className="truncate text-lg">{t.name}</h3>
              <p className="truncate text-muted-foreground">{t.species}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                By {t.ownerName || t.ownerEmail || 'someone'} · submitted {timeAgo(t.createdAt)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t.address || `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`}</span>
              </p>
              {t.verificationNote && <p className="mt-2 text-sm">Why it's here: {t.verificationNote}.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" onClick={() => decide(t, 'APPROVE')} disabled={busy === t.id}>
                {busy === t.id ? <Spinner className="size-4" /> : <Check aria-hidden="true" />} Approve
              </Button>
              <Button size="lg" variant="destructive" onClick={() => setRejecting(t)} disabled={busy === t.id}>
                <X aria-hidden="true" /> Reject
              </Button>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${t.latitude},${t.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'default', 'w-full')}
            >
              <ExternalLink aria-hidden="true" /> See the spot in Google Maps
            </a>
          </li>
        ))}
      </ul>

      <Pager page={result.page} totalPages={result.totalPages} onPage={setPage} alwaysShow total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'tree' : 'trees'} />

      <ConfirmDialog
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.name ?? 'this tree'}?`}
        description="The tree and its photo are removed and it never appears on the map. The person can plant it again with a clearer photo."
        confirmLabel="Reject tree"
        busy={Boolean(rejecting && busy === rejecting.id)}
        onConfirm={() => rejecting && decide(rejecting, 'REJECT')}
        onCancel={() => setRejecting(null)}
      />
    </>
  );
};
