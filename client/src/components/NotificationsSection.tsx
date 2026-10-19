import { useEffect, useState } from 'react';
import { fetchNotificationConfig, fetchNotificationPreferences, setEmailDrives } from '../services/api';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { SwitchRow } from './ui/switch';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';

/** Account > Notifications: drive emails, and push notifications on this device. */
export const NotificationsSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<'email' | 'push' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNotificationPreferences(), fetchNotificationConfig(), currentPushSubscription()]).then(
      ([prefs, config, subscription]) => {
        if (cancelled) return;
        setEmailOn(prefs.emailDrives);
        setPushAvailable(config.push);
        setPushOn(Boolean(subscription) && Notification.permission === 'granted');
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
  }, []);

  const toggleEmail = async (next: boolean) => {
    setBusy('email');
    setNotice(null);
    setEmailOn(next);
    try {
      await setEmailDrives(next);
    } catch {
      setEmailOn(!next);
      setNotice({ tone: 'error', text: "Couldn't save that. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const togglePush = async (next: boolean) => {
    setBusy('push');
    setNotice(null);
    try {
      if (next) {
        const result = await enablePush();
        if (result === 'enabled') {
          setPushOn(true);
          setNotice({ tone: 'success', text: 'Notifications are on for this device.' });
        } else if (result === 'denied') {
          setNotice({ tone: 'error', text: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' });
        } else if (result === 'unsupported') {
          setNotice({ tone: 'info', text: 'This browser can’t show notifications. On an iPhone, add the app to your Home Screen first.' });
        } else {
          setNotice({ tone: 'info', text: 'Notifications are not set up on the server yet.' });
        }
      } else {
        await disablePush();
        setPushOn(false);
      }
    } catch {
      setNotice({ tone: 'error', text: "Couldn't change notifications on this device. Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="account-notifications">
      <h2 id="account-notifications" className="text-xl">Notifications</h2>
      <p className="text-muted-foreground">Hear about new, changed and cancelled drives.</p>

      {loading ? (
        <Spinner label="Loading notification settings" />
      ) : failed ? (
        <Alert tone="error">Couldn't load your notification settings.</Alert>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          <SwitchRow id="notify-email" label="Email me about drives" description="Sent to the email address on your account." checked={emailOn} busy={busy === 'email'} onChange={toggleEmail} />
          {pushAvailable && (
            <SwitchRow
              id="notify-push"
              label="Notifications on this device"
              description={pushSupported() ? 'A notification on this phone or computer, even when the app is closed.' : 'This browser can’t show notifications. On an iPhone, add the app to your Home Screen first.'}
              checked={pushOn}
              busy={busy === 'push'}
              disabled={!pushSupported()}
              onChange={togglePush}
            />
          )}
        </div>
      )}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
    </section>
  );
};
