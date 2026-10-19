import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchAppSettings, updateAppSettings, type AppSettings } from '../services/api';
import { SwitchRow } from './ui/switch';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';

/**
 * Admin > Settings (admins and super admins only): whose tree photos go to the AI photo check.
 * Each switch saves as soon as it is flipped and goes back if the server refuses.
 */
export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<keyof AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAppSettings().then(setSettings, () => setFailed(true));
  }, []);

  const change = async (key: keyof AppSettings, value: boolean) => {
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

  if (failed) return <Alert tone="error">Couldn't load the settings. Check your connection and try again.</Alert>;
  if (!settings) return <Spinner label="Loading settings" />;

  return (
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

      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
};
