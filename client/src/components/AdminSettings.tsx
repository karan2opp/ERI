import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchAppSettings, updateAppSettings, type AppSettings } from '../services/api';
import { SwitchRow } from './ui/switch';
import { Button, buttonClass } from './ui/button';
import { Field, Input } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';

const LIMIT_MIN = 1;
const LIMIT_MAX = 50;
const IMPACT_MAX = 100_000_000;

type BaselineKey = 'baselineTrees' | 'baselinePlantationDrives' | 'baselineCleanupDrives' | 'baselineWasteKg';

/** The home page's starting numbers: what the team had done before the app. */
const BASELINES: { key: BaselineKey; label: string; unit: string }[] = [
  { key: 'baselineTrees', label: 'Trees planted', unit: 'trees' },
  { key: 'baselinePlantationDrives', label: 'Plantation drives held', unit: 'drives' },
  { key: 'baselineCleanupDrives', label: 'Clean-up drives held', unit: 'drives' },
  { key: 'baselineWasteKg', label: 'Waste collected', unit: 'kg' },
];

/**
 * Admin > Settings (admins and super admins only): whose tree photos go to the AI photo check, and how many
 * pictures a drive can have. Each switch saves as soon as it is flipped and goes back if the server refuses.
 */
export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<keyof AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitText, setLimitText] = useState('');
  const [limitSaved, setLimitSaved] = useState(false);
  const [baseText, setBaseText] = useState<Record<BaselineKey, string>>({ baselineTrees: '', baselinePlantationDrives: '', baselineCleanupDrives: '', baselineWasteKg: '' });
  const [baseSaved, setBaseSaved] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [joinSaved, setJoinSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchAppSettings().then((s) => {
      setSettings(s);
      setLimitText(String(s.drivePhotoLimit));
      setBaseText(Object.fromEntries(BASELINES.map((b) => [b.key, String(s[b.key])])) as Record<BaselineKey, string>);
      setJoinText(s.joinTeamFormUrl);
    }, () => setFailed(true));
  }, []);

  const change = async (key: 'verifyUserPhotos' | 'verifyTeamPhotos', value: boolean) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setBusy(key);
    setError(null);
    try {
      setSettings(await updateAppSettings({ [key]: value }));
    } catch (err) {
      setSettings(previous);
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save that setting. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const limit = Number(limitText);
  const limitValid = limitText.trim() !== '' && Number.isInteger(limit) && limit >= LIMIT_MIN && limit <= LIMIT_MAX;

  const saveLimit = async () => {
    if (!limitValid) return;
    setBusy('drivePhotoLimit');
    setError(null);
    setLimitSaved(false);
    try {
      const next = await updateAppSettings({ drivePhotoLimit: limit });
      setSettings(next);
      setLimitText(String(next.drivePhotoLimit));
      setLimitSaved(true);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save the limit. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const baseNumber = (key: BaselineKey) => Number(baseText[key]);
  const baseValid = BASELINES.every(({ key }) => baseText[key].trim() !== '' && Number.isInteger(baseNumber(key)) && baseNumber(key) >= 0 && baseNumber(key) <= IMPACT_MAX);
  const baseChanged = settings !== null && BASELINES.some(({ key }) => baseNumber(key) !== settings[key]);

  const saveBaselines = async () => {
    if (!baseValid) return;
    setBusy('baselineTrees');
    setError(null);
    setBaseSaved(false);
    try {
      const next = await updateAppSettings(Object.fromEntries(BASELINES.map(({ key }) => [key, baseNumber(key)])));
      setSettings(next);
      setBaseText(Object.fromEntries(BASELINES.map((b) => [b.key, String(next[b.key])])) as Record<BaselineKey, string>);
      setBaseSaved(true);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save the numbers. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const joinTrimmed = joinText.trim();
  const joinValid = joinTrimmed === '' || /^https:\/\/[^\s.]+\.[^\s]+$/i.test(joinTrimmed);

  const saveJoin = async (value: string) => {
    setBusy('joinTeamFormUrl');
    setError(null);
    setJoinSaved(null);
    try {
      const next = await updateAppSettings({ joinTeamFormUrl: value });
      setSettings(next);
      setJoinText(next.joinTeamFormUrl);
      setJoinSaved(next.joinTeamFormUrl ? 'Saved. The home page now has a Join the team button that opens this form.' : 'Removed. The home page no longer shows a Join the team button.');
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save the link. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <Alert tone="error">Couldn't load the settings. Check your connection and try again.</Alert>;
  if (!settings) return <Spinner label="Loading settings" />;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2" aria-labelledby="settings-photos">
        <h2 id="settings-photos" className="text-xl">Tree photo check</h2>
        <p className="text-muted-foreground">
          A checked photo is sent to an AI model that decides whether it shows a tree or plant. Photos that aren't checked are accepted as they are, which saves time and cost.
        </p>

        <div className="flex flex-col divide-y divide-border">
          <SwitchRow
            id="verify-users"
            label="Check photos from users"
            description="Normal users' photos are checked before their tree goes on the map."
            checked={settings.verifyUserPhotos}
            busy={busy === 'verifyUserPhotos'}
            onChange={(v) => change('verifyUserPhotos', v)}
          />
          <SwitchRow
            id="verify-team"
            label="Check photos from team members"
            description="Turn this off to trust team members' photos."
            checked={settings.verifyTeamPhotos}
            busy={busy === 'verifyTeamPhotos'}
            onChange={(v) => change('verifyTeamPhotos', v)}
          />
          <div className="flex items-start gap-3 py-4 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">Photos from admins are never checked.</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="settings-drive-photos">
        <h2 id="settings-drive-photos" className="text-xl">Drive pictures</h2>
        <p className="text-muted-foreground">
          When an admin wraps up a drive they can add pictures of it. This is how many pictures one drive can have. A drive that already has more keeps them, but can't get more until some are removed.
        </p>
        <Field label="Pictures per drive" htmlFor="drive-photo-limit" description={`From ${LIMIT_MIN} to ${LIMIT_MAX}.`}>
          <div className="flex gap-2">
            <Input
              id="drive-photo-limit"
              type="number"
              inputMode="numeric"
              min={LIMIT_MIN}
              max={LIMIT_MAX}
              step={1}
              value={limitText}
              onChange={(e) => {
                setLimitText(e.target.value);
                setLimitSaved(false);
              }}
              aria-invalid={!limitValid}
              className="max-w-32"
            />
            <Button size="xl" onClick={saveLimit} disabled={!limitValid || limit === settings.drivePhotoLimit || busy === 'drivePhotoLimit'}>
              Save
            </Button>
          </div>
        </Field>
        {!limitValid && <p className="text-sm text-destructive">Enter a whole number from {LIMIT_MIN} to {LIMIT_MAX}.</p>}
        {limitSaved && <Alert tone="success">Saved. Drives can have up to {settings.drivePhotoLimit} {settings.drivePhotoLimit === 1 ? 'picture' : 'pictures'}.</Alert>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="settings-numbers">
        <h2 id="settings-numbers" className="text-xl">Starting numbers</h2>
        <p className="text-muted-foreground">
          What the team had already done before using the app. The home and About pages show these <strong>plus what the app counts itself</strong>: trees planted by people on the map, drives that have been held, and the waste you record when you complete a clean-up drive. Change them only if the starting figures were wrong.
        </p>
        <p className="text-muted-foreground">
          <strong>Old trees:</strong> trees that were planted before the app are marked on the map one by one with <em>Old tree</em> chosen, and they don't add to the count. So far <strong>{settings.oldTreesMarked}</strong> old {settings.oldTreesMarked === 1 ? 'tree is' : 'trees are'} marked. The pages show the larger of <em>Trees planted</em> below and the old trees marked, plus the new trees. When every old tree is on the map, set <em>Trees planted</em> to 0 and all trees are simply counted.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {BASELINES.map(({ key, label, unit }) => {
            const valid = baseText[key].trim() !== '' && Number.isInteger(baseNumber(key)) && baseNumber(key) >= 0 && baseNumber(key) <= IMPACT_MAX;
            return (
              <Field key={key} label={`${label} (${unit})`} htmlFor={`base-${key}`}>
                <Input
                  id={`base-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={baseText[key]}
                  onChange={(e) => {
                    setBaseText((t) => ({ ...t, [key]: e.target.value }));
                    setBaseSaved(false);
                  }}
                  aria-invalid={!valid}
                />
              </Field>
            );
          })}
        </div>
        {!baseValid && <p className="text-sm text-destructive">Enter whole numbers, 0 or more, in every box.</p>}
        <Button size="xl" onClick={saveBaselines} disabled={!baseValid || !baseChanged || busy === 'baselineTrees'} className="self-start">
          Save starting numbers
        </Button>
        {baseSaved && <Alert tone="success">Saved. The starting numbers are updated; the home page adds them to what the app counts.</Alert>}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="settings-join">
        <h2 id="settings-join" className="text-xl">Join the team form</h2>
        <p className="text-muted-foreground">
          The link to your Google Form for people who want to join the team. While a link is set, the home page shows a <strong>Join the team</strong> button that opens it in a new tab. Leave it empty to hide the button.
        </p>
        <Field label="Form link" htmlFor="join-form" description="Copy it from the form's Send button in Google Forms. It starts with https://">
          <Input
            id="join-form"
            type="url"
            inputMode="url"
            placeholder="https://forms.gle/..."
            value={joinText}
            onChange={(e) => {
              setJoinText(e.target.value);
              setJoinSaved(null);
            }}
            aria-invalid={!joinValid}
          />
        </Field>
        {!joinValid && <p className="text-sm text-destructive">Paste the full link, starting with https://</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveJoin(joinTrimmed)} disabled={!joinValid || joinTrimmed === settings.joinTeamFormUrl || busy === 'joinTeamFormUrl'}>
            Save link
          </Button>
          {settings.joinTeamFormUrl && (
            <>
              <a href={settings.joinTeamFormUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'default')}>
                Open the form
              </a>
              <Button variant="destructive" onClick={() => saveJoin('')} disabled={busy === 'joinTeamFormUrl'}>
                Remove link
              </Button>
            </>
          )}
        </div>
        {joinSaved && <Alert tone="success">{joinSaved}</Alert>}
      </section>

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
};
