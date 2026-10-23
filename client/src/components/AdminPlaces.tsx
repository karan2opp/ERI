import { useEffect, useState } from 'react';
import { ChevronRight, Copy, ExternalLink, Map as MapIcon, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createPlaceForm,
  deletePlaceForm,
  deletePlaceSuggestion,
  fetchPlaceForm,
  fetchPlaceForms,
  fetchPlaceSuggestions,
  updatePlaceForm,
  type Paged,
  type PlaceForm,
  type PlaceFormFields,
  type PlaceFormKind,
  type PlaceSuggestion,
} from '../services/api';
import { FORM_KIND_LABEL, googleMapsAt, isOpen, placeFormLink } from '../lib/places';
import { formatPhone } from '../lib/phone';
import { formatTime } from '../lib/time';
import { timeAgo } from '../lib/trees';
import { FormBadges } from '../pages/PlacesPage';
import { Page } from './ui/top-bar';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Chips } from './ui/chips';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Field, Input, Textarea } from './ui/field';
import { Pager } from './ui/pager';
import { Spinner } from './ui/spinner';
import { SwitchRow } from './ui/switch';
import { MiniMap } from './MiniMap';

const PAGE_SIZE = 10;
const MAX_QUESTIONS = 2;

const errorText = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/** "12 Oct 2026, 4:05 pm" */
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(d)}`;
};

/** Make a form, or (with `form`) change one: title, description, what it's for, up to 2 questions, open or closed. */
const FormEditor: React.FC<{ form?: PlaceForm; onSaved: (form: PlaceForm) => void }> = ({ form, onSaved }) => {
  const [title, setTitle] = useState(form?.title ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [kind, setKind] = useState<PlaceFormKind>(form?.kind ?? 'PLANTATION');
  const [questions, setQuestions] = useState<string[]>(form?.questions ?? []);
  const [open, setOpen] = useState(form ? isOpen(form) : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocker = !title.trim() ? 'Add a title to continue' : questions.some((q) => !q.trim()) ? 'Write the question, or remove it' : null;

  const save = async () => {
    if (blocker) return;
    setBusy(true);
    setError(null);
    const fields: PlaceFormFields = {
      title: title.trim(),
      description: description.trim(),
      kind,
      questions: questions.map((q) => q.trim()),
      status: open ? 'OPEN' : 'CLOSED',
    };
    try {
      onSaved(form ? await updatePlaceForm(form.id, fields) : await createPlaceForm(fields));
    } catch (err) {
      setError(errorText(err, "Couldn't save the form. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Title" htmlFor="place-form-title">
        <Input id="place-form-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Where should we plant this monsoon?" maxLength={255} />
      </Field>
      <Field label="Description (optional)" htmlFor="place-form-desc" description="What kind of places you are looking for, and anything people should know.">
        <Textarea id="place-form-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      <Field label="Places for" description={kind === 'EITHER' ? 'Each person says whether their place is for planting or a clean-up.' : undefined}>
        <Chips
          label="Places for"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'PLANTATION', label: 'Planting trees' },
            { value: 'CLEANUP', label: 'Clean-up drives' },
            { value: 'EITHER', label: 'Either' },
          ]}
          className="flex-wrap"
        />
      </Field>
      <Field
        label="Your questions (optional)"
        description={`Every form asks for the place on the map, a landmark and up to 5 pictures. You can ask up to ${MAX_QUESTIONS} more questions; people have to answer them.`}
      >
        <div className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                value={q}
                onChange={(e) => setQuestions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={i === 0 ? 'e.g. Who owns the land?' : 'e.g. Can volunteers park nearby?'}
                aria-label={`Question ${i + 1}`}
                maxLength={300}
              />
              <Button variant="ghost" size="icon-lg" onClick={() => setQuestions((list) => list.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                <X className="size-5" />
              </Button>
            </div>
          ))}
          {questions.length < MAX_QUESTIONS && (
            <Button variant="secondary" onClick={() => setQuestions((list) => [...list, ''])} className="self-start">
              <Plus aria-hidden="true" /> Add a question
            </Button>
          )}
        </div>
      </Field>
      {form && form.suggestionCount ? (
        <p className="text-sm text-muted-foreground">Places already sent keep the questions as they were when they were sent.</p>
      ) : null}
      <SwitchRow
        id="place-form-open"
        label="Taking places"
        description={open ? 'Open: signed-in people can send places.' : 'Closed: people can still see the form but not send places.'}
        checked={open}
        onChange={setOpen}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button size="xl" onClick={save} disabled={Boolean(blocker) || busy}>
        {busy && <Spinner />}
        {blocker ?? (form ? 'Save changes' : 'Create the form')}
      </Button>
    </div>
  );
};

/** One place someone sent: pictures, where it is, the landmark, the answers and who sent it. */
const SuggestionCard: React.FC<{ s: PlaceSuggestion; onView: (url: string) => void; onRemove: () => void }> = ({ s, onView, onRemove }) => {
  const [showMap, setShowMap] = useState(false);
  const pin = s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude } : null;
  const mapsLink = s.googleMapsUrl || (pin ? googleMapsAt(pin.lat, pin.lng) : null);
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={s.kind === 'CLEANUP' ? 'cleanup' : 'drive'}>{s.kind === 'CLEANUP' ? 'Clean-up' : 'Planting'}</Badge>
          <h3 className="mt-2 font-sans text-lg font-semibold break-words">{s.landmark}</h3>
          <p className="text-sm text-muted-foreground" title={when(s.createdAt)}>
            Sent {timeAgo(s.createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove the place "${s.landmark}"`} className="shrink-0 text-destructive">
          <Trash2 className="size-5" />
        </Button>
      </div>

      {s.photos.length > 0 && (
        <ul className="grid grid-cols-5 gap-2">
          {s.photos.map((url, i) => (
            <li key={url}>
              <button type="button" onClick={() => onView(url)} className="block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <img src={url} alt={`Picture ${i + 1} of ${s.landmark}`} className="size-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {pin && (
          <Button variant="secondary" size="sm" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
            <MapIcon aria-hidden="true" /> {showMap ? 'Hide the map' : 'Show on the map'}
          </Button>
        )}
        {mapsLink && (
          <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent">
            <ExternalLink className="size-4" aria-hidden="true" /> {s.googleMapsUrl ? 'Their Google Maps link' : 'Open in Google Maps'}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {!pin && <p className="text-sm text-muted-foreground">Only a Google Maps link was given, so there is no pin on our map.</p>}
      </div>
      {showMap && pin && <MiniMap center={pin} pin={pin} pinCleanup={s.kind === 'CLEANUP'} className="h-56" />}

      {s.answers.length > 0 && (
        <dl className="flex flex-col gap-2">
          {s.answers.map((a, i) => (
            <div key={i}>
              <dt className="text-sm font-medium text-muted-foreground">{a.question}</dt>
              <dd className="whitespace-pre-line break-words">{a.answer}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <img src={s.userAvatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${s.userId ?? s.id}`} alt="" className="size-9 shrink-0 rounded-full bg-muted" loading="lazy" />
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{s.userName || (s.userId ? 'No name' : 'Account deleted')}</p>
          <p className="truncate text-muted-foreground">{[s.userEmail, s.userPhone ? formatPhone(s.userPhone) : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    </li>
  );
};

/** A form for admins: its details and actions, then every place sent through it, newest first, 10 to a page. */
const FormAdminPage: React.FC<{ form: PlaceForm; onBack: () => void; onChanged: (form: PlaceForm | null) => void }> = ({ form: initial, onBack, onChanged }) => {
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<PlaceSuggestion> | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PlaceSuggestion | null>(null);
  const [deletingForm, setDeletingForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceSuggestions(form.id, page, PAGE_SIZE).then(
      (res) => {
        if (cancelled) return;
        // Removed the last place on a page: go back one
        if (res.data.length === 0 && page > 1) return setPage(page - 1);
        setResult(res);
        setFailed(false);
      },
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [form.id, page, refresh]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setViewing(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  const saved = (next: PlaceForm) => {
    setForm(next);
    onChanged(next);
  };

  const toggleOpen = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await updatePlaceForm(form.id, { status: isOpen(form) ? 'CLOSED' : 'OPEN' });
      saved(next);
      setNotice({ tone: 'success', text: isOpen(next) ? 'The form is open: people can send places.' : 'The form is closed: people can no longer send places.' });
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, "Couldn't change the form. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(placeFormLink(form.id));
      setNotice({ tone: 'success', text: 'Link copied. Share it so people can open this form straight away.' });
    } catch {
      setNotice({ tone: 'error', text: `Couldn't copy. The link is ${placeFormLink(form.id)}` });
    }
  };

  const removePlace = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deletePlaceSuggestion(form.id, removing.id);
      setRemoving(null);
      setRefresh((r) => r + 1);
      const next = { ...form, suggestionCount: Math.max(0, (form.suggestionCount ?? 1) - 1) };
      setForm(next);
      onChanged(next);
    } catch (err) {
      setRemoving(null);
      setNotice({ tone: 'error', text: errorText(err, "Couldn't remove the place. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const removeForm = async () => {
    setBusy(true);
    try {
      await deletePlaceForm(form.id);
      onChanged(null);
      onBack();
    } catch (err) {
      setDeletingForm(false);
      setNotice({ tone: 'error', text: errorText(err, "Couldn't delete the form. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const count = result?.total ?? form.suggestionCount ?? 0;

  return (
    <>
      <Page title="Place form" onBack={onBack} wide>
        <div className="flex flex-col gap-2">
          <FormBadges form={form} />
          <h2 className="text-2xl break-words">{form.title}</h2>
          {form.description && <p className="whitespace-pre-line text-muted-foreground">{form.description}</p>}
          {form.questions.length > 0 && (
            <ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">
              {form.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={isOpen(form) ? 'secondary' : 'default'} onClick={toggleOpen} disabled={busy}>
            {isOpen(form) ? 'Close the form' : 'Open the form'}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit
          </Button>
          <Button variant="secondary" onClick={copyLink}>
            <Copy aria-hidden="true" /> Copy link
          </Button>
          <Button variant="destructive" onClick={() => setDeletingForm(true)}>
            <Trash2 aria-hidden="true" /> Delete
          </Button>
        </div>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <section className="flex flex-col gap-3" aria-labelledby="places-sent">
          <h3 id="places-sent" className="text-xl">
            Places sent · {count}
          </h3>
          {failed && <Alert tone="error">Couldn't load the places. Refresh to try again.</Alert>}
          {!result && !failed ? (
            <Spinner />
          ) : result && result.data.length === 0 ? (
            <p className="py-4 text-muted-foreground">{isOpen(form) ? 'No places yet. Share the link to get the first ones.' : 'No places were sent through this form.'}</p>
          ) : (
            result && (
              <>
                <ul className="flex flex-col gap-3">
                  {result.data.map((s) => (
                    <SuggestionCard key={s.id} s={s} onView={setViewing} onRemove={() => setRemoving(s)} />
                  ))}
                </ul>
                <Pager page={page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'place' : 'places'} />
              </>
            )
          )}
        </section>
      </Page>

      {editing && (
        <Page title="Edit form" onBack={() => setEditing(false)}>
          <FormEditor
            form={form}
            onSaved={(next) => {
              saved(next);
              setEditing(false);
              setNotice({ tone: 'success', text: 'Form saved.' });
            }}
          />
        </Page>
      )}

      {viewing && (
        <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Picture" onClick={() => setViewing(null)}>
          <img src={viewing} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <Button variant="floating" size="icon-lg" onClick={() => setViewing(null)} aria-label="Close picture" className="absolute top-4 right-4">
            <X className="size-6!" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this place?"
        description={`"${removing?.landmark ?? ''}" and its pictures will be deleted. This can't be undone.`}
        confirmLabel="Remove place"
        busy={busy}
        onConfirm={removePlace}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={deletingForm}
        title="Delete this form?"
        description={`The form and ${count === 1 ? 'the 1 place' : `all ${count} places`} sent through it, with their pictures, will be deleted. This can't be undone. To stop new places but keep these, close the form instead.`}
        confirmLabel="Delete form"
        busy={busy}
        onConfirm={removeForm}
        onCancel={() => setDeletingForm(false)}
      />
    </>
  );
};

/**
 * Admin → Places: the forms asking people where to plant or clean up. Make one, open or close it, and read the
 * places people sent. With `initialFormId` (from a notification) that form opens straight away.
 */
export const AdminPlaces: React.FC<{ initialFormId?: string }> = ({ initialFormId }) => {
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<PlaceForm> | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<PlaceForm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaceForms(page, PAGE_SIZE, status).then(
      (res) => {
        if (cancelled) return;
        if (res.data.length === 0 && page > 1) return setPage(page - 1);
        setResult(res);
        setFailed(false);
      },
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [page, status, refresh]);

  // Opened from a notification: show that form once this tab is on screen
  useEffect(() => {
    if (initialFormId) fetchPlaceForm(initialFormId).then(setOpen, () => setNotice('That form no longer exists.'));
  }, [initialFormId]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Forms asking people where we could plant trees or hold a clean-up drive. People find them under Suggest a place.</p>
      <Button size="xl" onClick={() => setCreating(true)} className="w-full">
        <Plus aria-hidden="true" /> Create a form
      </Button>
      {notice && <Alert tone="success">{notice}</Alert>}
      <Chips
        label="Show forms"
        size="sm"
        value={status}
        onChange={(s) => (setStatus(s), setPage(1))}
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'OPEN', label: 'Open' },
          { value: 'CLOSED', label: 'Closed' },
        ]}
      />
      {failed && <Alert tone="error">Couldn't load the forms. Refresh to try again.</Alert>}
      {!result && !failed ? (
        <Spinner />
      ) : (
        result && (
          <>
            {result.data.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">{status === 'ALL' ? 'No forms yet. Create the first one.' : `No ${status === 'OPEN' ? 'open' : 'closed'} forms.`}</p>
            ) : (
              <ul className="divide-y divide-border">
                {result.data.map((form) => (
                  <li key={form.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(form)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl py-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{form.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {isOpen(form) ? 'Open' : 'Closed'} · {FORM_KIND_LABEL[form.kind]} · {form.suggestionCount ?? 0} {form.suggestionCount === 1 ? 'place' : 'places'}
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Pager page={page} totalPages={result.totalPages} onPage={setPage} total={result.total} pageSize={PAGE_SIZE} noun={result.total === 1 ? 'form' : 'forms'} />
          </>
        )
      )}

      {creating && (
        <Page title="Create a form" onBack={() => setCreating(false)}>
          <FormEditor
            onSaved={(form) => {
              setCreating(false);
              setRefresh((r) => r + 1);
              setOpen(form);
            }}
          />
        </Page>
      )}
      {open && (
        <FormAdminPage
          key={open.id}
          form={open}
          onBack={() => setOpen(null)}
          onChanged={(form) => {
            setRefresh((r) => r + 1);
            if (!form) setNotice('Form deleted.');
          }}
        />
      )}
    </div>
  );
};
