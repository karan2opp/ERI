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
const WASTE_MAX = 100_000_000;

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
  const [wasteText, setWasteText] = useState('');
  const [wasteSaved, setWasteSaved] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [joinSaved, setJoinSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchAppSettings().then((s) => {
      setSettings(s);
      setLimitText(String(s.drivePhotoLimit));
      setWasteText(String(s.wasteCollectedKg));
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

  const waste = Number(wasteText);
  const wasteValid = wasteText.trim() !== '' && Number.isInteger(waste) && waste >= 0 && waste <= WASTE_MAX;

  const saveWaste = async () => {
    if (!wasteValid) return;
    setBusy('wasteCollectedKg');
    setError(null);
    setWasteSaved(false);
    try {
      const next = await updateAppSettings({ wasteCollectedKg: waste });
      setSettings(next);
      setWasteText(String(next.wasteCollectedKg));
      setWasteSaved(true);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save the number. Try again.");
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

      <section className="flex flex-col gap-3" aria-labelledby="settings-waste">
        <h2 id="settings-waste" className="text-xl">Waste collected</h2>
        <p className="text-muted-foreground">
          The total weight of waste collected in all clean-up drives, in kilograms. It is shown on the home page. The other three numbers there (trees, plantation drives and clean-up drives) are counted for you.
        </p>
        <Field label="Waste collected (kg)" htmlFor="waste-collected" description="Update it after each clean-up. A whole number, 0 or more.">
          <div className="flex gap-2">
            <Input
              id="waste-collected"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={wasteText}
              onChange={(e) => {
                setWasteText(e.target.value);
                setWasteSaved(false);
              }}
              aria-invalid={!wasteValid}
              className="max-w-48"
            />
            <Button size="xl" onClick={saveWaste} disabled={!wasteValid || waste === settings.wasteCollectedKg || busy === 'wasteCollectedKg'}>
              Save
            </Button>
          </div>
        </Field>
        {!wasteValid && <p className="text-sm text-destructive">Enter a whole number of kilograms, 0 or more.</p>}
        {wasteSaved && <Alert tone="success">Saved. The home page now shows {settings.wasteCollectedKg.toLocaleString('en-IN')} kg.</Alert>}
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
