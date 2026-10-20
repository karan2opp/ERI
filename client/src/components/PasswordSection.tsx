import { useState } from 'react';
import { useUser } from '@clerk/react';
import { confirmPasswordReset, requestPasswordReset } from '../services/api';
import { KeyRound, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Alert } from './ui/alert';
import { Spinner } from './ui/spinner';

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

/** Clerk errors carry a readable message deeper inside the error object. */
const clerkMessage = (err: unknown, fallback: string) => {
  const e = err as { longMessage?: string; message?: string; errors?: { longMessage?: string; message?: string }[] };
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.longMessage || e?.message || fallback;
};

/** Our own server's message for a failed request (it says what went wrong in plain words). */
const serverMessage = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Password settings for people who have a password. (People who sign in only with Google have none, and
 * the Account page doesn't show this at all.) They can change it with the current one, or, if they forgot
 * it, have a code emailed to them and choose a new one. (Clerk won't start its own email reset for someone
 * who is already signed in, so our server sends and checks the code.)
 */
export const PasswordSection: React.FC = () => {
  const { user } = useUser();

  // ---- Change it (knows the current password)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // ---- Forgot it: email a code, then set a new one
  const [forgot, setForgot] = useState<'closed' | 'ready' | 'code'>('closed');
  const [code, setCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState<Notice>(null);

  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? '';

  const blocker = !currentPassword
    ? 'Enter your current password'
    : newPassword.length < 8
      ? 'Use at least 8 characters'
      : newPassword !== confirmPassword
        ? "The new passwords don't match"
        : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocker) return;
    setSaving(true);
    setNotice(null);
    try {
      await user.updatePassword({ newPassword, currentPassword, signOutOfOtherSessions: true });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setNotice({ tone: 'error', text: clerkMessage(err, "Couldn't change your password. Check your current password and try again.") });
    } finally {
      setSaving(false);
    }
  };

  const sendCode = async () => {
    setResetting(true);
    setResetNotice(null);
    try {
      await requestPasswordReset();
      setForgot('code');
      setResetNotice({ tone: 'success', text: `We emailed a code to ${email}. It can take a minute to arrive, and it works for 10 minutes.` });
    } catch (err) {
      setResetNotice({ tone: 'error', text: serverMessage(err, "Couldn't send the email. Try again in a moment.") });
    } finally {
      setResetting(false);
    }
  };

  const resetBlocker = !code.trim()
    ? 'Enter the code from the email'
    : resetPassword.length < 8
      ? 'Use at least 8 characters'
      : resetPassword !== resetConfirm
        ? "The new passwords don't match"
        : null;

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetBlocker) return;
    setResetting(true);
    setResetNotice(null);
    try {
      await confirmPasswordReset(code.trim(), resetPassword);
      setForgot('closed');
      setCode('');
      setResetPassword('');
      setResetConfirm('');
      setNotice({ tone: 'success', text: 'Password changed. Other devices have been signed out. You can sign in with the new one from now on.' });
    } catch (err) {
      setResetNotice({ tone: 'error', text: serverMessage(err, "That didn't work. Check the code and try again.") });
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="password-heading">
      <h2 id="password-heading" className="text-xl">Change password</h2>

      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Current password" htmlFor="current-password">
          <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="new-password" description="At least 8 characters.">
          <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password" htmlFor="confirm-password">
          <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Button type="submit" size="lg" className="self-start" disabled={Boolean(blocker) || saving}>
          {saving ? <Spinner className="size-4" /> : <KeyRound aria-hidden="true" />}
          {currentPassword || newPassword ? blocker ?? 'Save password' : 'Change password'}
        </Button>
      </form>

      {/* Forgot it: a code by email */}
      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
        <h3 className="font-sans text-base font-medium">Forgot your password?</h3>
        {forgot === 'closed' ? (
          <>
            <p className="text-sm text-muted-foreground">We can email a code to {email} so you can choose a new one.</p>
            <Button variant="secondary" size="lg" className="self-start" onClick={() => (setForgot('ready'), setResetNotice(null))}>
              <Mail aria-hidden="true" /> Email me a code
            </Button>
          </>
        ) : forgot === 'ready' ? (
          <>
            <p className="text-sm text-muted-foreground">We'll send a 6-digit code to {email}.</p>
            {resetNotice && <Alert tone={resetNotice.tone}>{resetNotice.text}</Alert>}
            <div className="flex gap-2">
              <Button size="lg" onClick={sendCode} disabled={resetting || !email}>
                {resetting ? <Spinner className="size-4" /> : <Mail aria-hidden="true" />} Send code
              </Button>
              <Button variant="ghost" size="lg" onClick={() => setForgot('closed')}>Cancel</Button>
            </div>
          </>
        ) : (
          <form onSubmit={submitReset} className="flex flex-col gap-4">
            {resetNotice && <Alert tone={resetNotice.tone}>{resetNotice.text}</Alert>}
            <Field label="Code from the email" htmlFor="reset-code">
              <Input id="reset-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} />
            </Field>
            <Field label="New password" htmlFor="reset-password" description="At least 8 characters.">
              <Input id="reset-password" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password" htmlFor="reset-confirm">
              <Input id="reset-confirm" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" disabled={Boolean(resetBlocker) || resetting}>
                {resetting ? <Spinner className="size-4" /> : <KeyRound aria-hidden="true" />}
                {code || resetPassword ? resetBlocker ?? 'Set new password' : 'Set new password'}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={sendCode} disabled={resetting}>Send a new code</Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setForgot('closed')}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};
