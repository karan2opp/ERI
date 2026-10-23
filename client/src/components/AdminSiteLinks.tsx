import { useEffect, useState } from 'react';
import { fetchAppSettings, updateAppSettings, type AppSettings } from '../services/api';
import { formatPhone } from '../lib/phone';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';

type LinkKey = 'instagramUrl' | 'youtubeUrl' | 'contactEmail' | 'contactPhone' | 'donateWhatsapp';

const FIELDS: { key: LinkKey; label: string; placeholder: string; hint: string; type: string; inputMode: 'url' | 'email' | 'tel' }[] = [
  { key: 'instagramUrl', label: 'Instagram link', placeholder: 'https://www.instagram.com/yourpage', hint: 'Shown in the footer.', type: 'url', inputMode: 'url' },
  { key: 'youtubeUrl', label: 'YouTube link', placeholder: 'https://www.youtube.com/@yourchannel', hint: 'Shown in the footer.', type: 'url', inputMode: 'url' },
  { key: 'contactEmail', label: 'Contact email', placeholder: 'hello@example.org', hint: 'Shown in the footer.', type: 'email', inputMode: 'email' },
  { key: 'contactPhone', label: 'Contact phone', placeholder: '+91 98765 43210', hint: 'Shown in the footer. Include the country code.', type: 'tel', inputMode: 'tel' },
  {
    key: 'donateWhatsapp',
    label: 'WhatsApp number for donations',
    placeholder: '+91 98765 43210',
    hint: "The Donate page's button opens a WhatsApp chat with this number. Include the country code.",
    type: 'tel',
    inputMode: 'tel',
  },
];

/** What a field shows: phone numbers tidied ("+91 98765 43210"), the rest as stored. */
const shown = (key: LinkKey, value: string) => (key === 'contactPhone' || key === 'donateWhatsapp' ? formatPhone(value) : value);

/**
 * Admin > Socials: the site's social links, contact details and donation WhatsApp number. The footer shows each one
 * as a link once it is set (a greyed placeholder until then), and the Donate page's button needs the WhatsApp number.
 */
export const AdminSiteLinks: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchAppSettings().then(setSettings, () => setFailed(true));
  }, []);

  if (failed) return <Alert tone="error">Couldn't load these details. Check your connection and try again.</Alert>;
  if (!settings) return <Spinner label="Loading" />;
  return <SiteLinksForm settings={settings} onSaved={setSettings} />;
};

/** The form itself. Every field can be emptied again. The server checks and tidies them. */
const SiteLinksForm: React.FC<{ settings: AppSettings; onSaved: (next: AppSettings) => void }> = ({ settings, onSaved }) => {
  const [values, setValues] = useState<Record<LinkKey, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, shown(f.key, settings[f.key])])) as Record<LinkKey, string>
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = FIELDS.filter((f) => values[f.key].trim() !== shown(f.key, settings[f.key]));
  const problem = (key: LinkKey): string | null => {
    const v = values[key].trim();
    if (!v) return null;
    if ((key === 'instagramUrl' || key === 'youtubeUrl') && !/^https:\/\/[^\s.]+\.\S+$/i.test(v)) return 'Paste the full link, starting with https://';
    if (key === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That email doesn't look right.";
    return null;
  };
  const anyProblem = FIELDS.some((f) => problem(f.key));

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateAppSettings(Object.fromEntries(changed.map((f) => [f.key, values[f.key].trim()])) as Partial<AppSettings>);
      onSaved(next);
      setValues(Object.fromEntries(FIELDS.map((f) => [f.key, shown(f.key, next[f.key])])) as Record<LinkKey, string>);
      setSaved(true);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save these. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-links">
      <div className="flex flex-col gap-2">
        <h2 id="settings-links" className="text-xl">Contact, social links and donations</h2>
        <p className="text-muted-foreground">
          These appear in the website's footer and on the Donate page. Anything left empty shows as a greyed "coming soon" placeholder (and the Donate button stays switched off until the WhatsApp number is set).
        </p>
      </div>
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`site-${f.key}`} description={f.hint}>
          <Input
            id={`site-${f.key}`}
            type={f.type}
            inputMode={f.inputMode}
            placeholder={f.placeholder}
            value={values[f.key]}
            onChange={(e) => {
              setValues({ ...values, [f.key]: e.target.value });
              setSaved(false);
            }}
            aria-invalid={Boolean(problem(f.key))}
          />
          {problem(f.key) && <p className="text-sm text-destructive">{problem(f.key)}</p>}
        </Field>
      ))}
      <Button className="self-start" onClick={save} disabled={busy || changed.length === 0 || anyProblem}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      {saved && <Alert tone="success">Saved. The footer and Donate page now use these.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
};
