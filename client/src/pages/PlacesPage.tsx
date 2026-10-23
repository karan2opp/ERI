import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, MapPinPlus } from 'lucide-react';
import type { LatLng } from '../types';
import { fetchPlaceForm, fetchPlaceForms, type Paged, type PlaceForm } from '../services/api';
import { FORM_KIND_BADGE, FORM_KIND_LABEL, isOpen } from '../lib/places';
import { Page } from '../components/ui/top-bar';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Pager } from '../components/ui/pager';
import { Spinner } from '../components/ui/spinner';
import { PlaceSuggestForm } from '../components/PlaceSuggestForm';

const PAGE_SIZE = 10;

export const FormBadges: React.FC<{ form: PlaceForm }> = ({ form }) => (
  <span className="flex flex-wrap gap-1.5">
    <Badge variant={isOpen(form) ? 'healthy' : 'outline'}>{isOpen(form) ? 'Open' : 'Closed'}</Badge>
    <Badge variant={FORM_KIND_BADGE[form.kind]}>{FORM_KIND_LABEL[form.kind]}</Badge>
  </span>
);

/** One form: its page, with the form to fill in while it is open. */
const FormPage: React.FC<{ form: PlaceForm; you: LatLng | null; onBack: () => void }> = ({ form, you, onBack }) => {
  // Changing `round` starts a fresh, empty form after sending one
  const [round, setRound] = useState(0);
  const [sent, setSent] = useState(false);
  return (
    <Page title="Suggest a place" onBack={onBack}>
      <div className="flex flex-col gap-2">
        <FormBadges form={form} />
        <h2 className="text-2xl">{form.title}</h2>
        {form.description && <p className="whitespace-pre-line text-muted-foreground">{form.description}</p>}
      </div>
      {sent ? (
        <div className="flex flex-col items-start gap-4">
          <Alert tone="success" title="Thank you, the place was sent">
            Our team will look at it when planning the next drives.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => (setSent(false), setRound((r) => r + 1))}>
              Send another place
            </Button>
            <Button size="lg" variant="secondary" onClick={onBack}>
              Back to the forms
            </Button>
          </div>
        </div>
      ) : isOpen(form) ? (
        <PlaceSuggestForm key={round} form={form} you={you} onSent={() => setSent(true)} />
      ) : (
        <Alert tone="info" title="This form is closed">
          It no longer takes places. Look for an open form, or come back later.
        </Alert>
      )}
    </Page>
  );
};

/**
 * Suggest a place: the forms admins put up asking where we could plant trees or hold a clean-up drive, open ones
 * first, 10 to a page (the server pages them). With `initialFormId` (a shared link) that form opens straight away.
 */
export const PlacesPage: React.FC<{ you: LatLng | null; onClose: () => void; initialFormId?: string }> = ({ you, onClose, initialFormId }) => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<PlaceForm> | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PlaceForm | null>(null);
  const [linkProblem, setLinkProblem] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceForms(page, PAGE_SIZE).then(
      (res) => !cancelled && (setResult(res), setFailed(false)),
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    if (!initialFormId) return;
    fetchPlaceForm(initialFormId).then(setOpen, () => setLinkProblem(true));
  }, [initialFormId]);

  return (
    <>
      <Page title="Suggest a place" onBack={onClose}>
        <p className="text-muted-foreground">
          Know a spot that needs trees, or a place that needs cleaning up? Tell us through one of these forms. Add the place on the map, a landmark and a
          few pictures.
        </p>
        {linkProblem && <Alert tone="error">That form couldn't be found. It may have been removed.</Alert>}
        {failed && <Alert tone="error">Couldn't load the forms. Check your connection and try again.</Alert>}
        {!result && !failed ? (
          <Spinner />
        ) : result && result.data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-secondary text-primary">
              <MapPinPlus className="size-7" aria-hidden="true" />
            </span>
            <p className="font-medium">No forms yet</p>
            <p className="max-w-sm text-muted-foreground">When we are looking for new places to plant or clean up, the form will be here.</p>
          </div>
        ) : (
          result && (
            <>
              <ul className="flex flex-col gap-3">
                {result.data.map((form) => (
                  <li key={form.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(form)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <FormBadges form={form} />
                        <span className="mt-2 block text-lg font-semibold">{form.title}</span>
                        {form.description && <span className="mt-1 line-clamp-2 block text-muted-foreground">{form.description}</span>}
                        {isOpen(form) && (
                          <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
                            <CheckCircle2 className="size-4" aria-hidden="true" /> Taking places now
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <Pager page={page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'form' : 'forms'} />
            </>
          )
        )}
      </Page>
      {open && <FormPage form={open} you={you} onBack={() => setOpen(null)} />}
    </>
  );
};
