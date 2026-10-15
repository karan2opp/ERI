import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { Camera, KeyRound, LogOut, Mail } from 'lucide-react';
import type { Role, Tree } from '../types';
import { ROLE_LABEL } from '../lib/roles';
import { PhoneSection } from '../components/PhoneSection';
import { syncCurrentUser } from '../services/api';
import { treeStatus } from '../lib/trees';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Field, Input } from '../components/ui/field';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { Stat } from './MyTreesPage';

type Notice = { tone: 'success' | 'error'; text: string } | null;

/** Clerk errors carry a readable message deeper inside the error object. */
const clerkMessage = (err: unknown, fallback: string) =>
  (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage ||
  (err as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
  fallback;

/**
 * Your account, edited right here: photo, name and password. (Clerk still handles signing in and
 * stores these details; this page talks to it directly instead of opening Clerk's own popup.)
 */
export const ProfilePage: React.FC<{
  role: Role;
  phone: string | null;
  onPhoneChanged: (phone: string | null) => void;
  myTrees: Tree[];
  onClose: () => void;
  onProfileChanged: () => void;
}> = ({
  role,
  phone,
  onPhoneChanged,
  myTrees,
  onClose,
  onProfileChanged,
}) => {
  const { user } = useUser();
  const { signOut } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);

  const [uploading, setUploading] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<Notice>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }, [user?.id]);

  if (!user) {
    return (
      <Page title="Account" onBack={onClose}>
        <Spinner />
      </Page>
    );
  }

  // Copy the change to our own database so trees and care logs show it
  const afterChange = async () => {
    try {
      await syncCurrentUser();
    } finally {
      onProfileChanged();
    }
  };

  const nameChanged = firstName.trim() !== (user.firstName ?? '') || lastName.trim() !== (user.lastName ?? '');

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSavingName(true);
    setNameNotice(null);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await afterChange();
      setNameNotice({ tone: 'success', text: 'Name saved.' });
    } catch (err) {
      setNameNotice({ tone: 'error', text: clerkMessage(err, "Couldn't save your name. Try again.") });
    } finally {
      setSavingName(false);
    }
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setPhotoNotice(null);
    try {
      await user.setProfileImage({ file });
      await afterChange();
      setPhotoNotice({ tone: 'success', text: 'Photo updated.' });
    } catch (err) {
      setPhotoNotice({ tone: 'error', text: clerkMessage(err, "Couldn't upload that photo. Try a JPG or PNG under 10 MB.") });
    } finally {
      setUploading(false);
    }
  };

  const passwordBlocker =
    user.passwordEnabled && !currentPassword
      ? 'Enter your current password'
      : newPassword.length < 8
        ? 'Use at least 8 characters'
        : newPassword !== confirmPassword
          ? "The new passwords don't match"
          : null;

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordBlocker) return;
    setSavingPassword(true);
    setPasswordNotice(null);
    try {
      await user.updatePassword({
        newPassword,
        ...(user.passwordEnabled ? { currentPassword } : {}),
        signOutOfOtherSessions: true,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ tone: 'success', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setPasswordNotice({ tone: 'error', text: clerkMessage(err, "Couldn't change your password. Check your current password and try again.") });
    } finally {
      setSavingPassword(false);
    }
  };

  const healthy = myTrees.filter((t) => treeStatus(t) === 'healthy').length;
  const signInMethods = user.externalAccounts.map((a) => a.provider.replace(/^oauth_/, '')).map((p) => p.charAt(0).toUpperCase() + p.slice(1));

  return (
    <Page title="Account" onBack={onClose}>
      {/* Photo */}
      <section className="flex items-center gap-4" aria-label="Profile photo">
        <div className="relative">
          <img src={user.imageUrl} alt="Your profile photo" className="size-20 rounded-full bg-muted object-cover" />
          <label className="absolute -right-1 -bottom-1 grid size-9 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-float focus-within:ring-2 focus-within:ring-ring">
            {uploading ? <Spinner className="size-4" /> : <Camera className="size-4" aria-hidden="true" />}
            <span className="sr-only">Change photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => changePhoto(e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-2xl">{user.fullName || user.username || 'You'}</h2>
          <p className="truncate text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
          {role !== 'USER' && <Badge variant="primary" className="mt-1">{ROLE_LABEL[role]}</Badge>}
        </div>
      </section>
      {photoNotice && <Alert tone={photoNotice.tone}>{photoNotice.text}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Stat value={myTrees.length} label={myTrees.length === 1 ? 'tree planted' : 'trees planted'} />
        <Stat value={healthy} label="healthy right now" />
      </div>

      {/* Name */}
      <form onSubmit={saveName} className="flex flex-col gap-4" aria-labelledby="name-heading">
        <h2 id="name-heading" className="text-xl">Your name</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="first-name">
            <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={100} />
          </Field>
          <Field label="Last name" htmlFor="last-name">
            <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={100} />
          </Field>
        </div>
        {nameNotice && <Alert tone={nameNotice.tone}>{nameNotice.text}</Alert>}
        <Button type="submit" size="lg" className="self-start" disabled={!nameChanged || !firstName.trim() || savingName}>
          {savingName && <Spinner className="size-4" />} Save name
        </Button>
      </form>

      {/* Phone number (optional, not verified) */}
      <PhoneSection phone={phone} onSaved={onPhoneChanged} />

      {/* Email and sign-in methods (read-only) */}
      <section className="flex flex-col gap-3" aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-xl">Email</h2>
        <ul className="flex flex-col gap-2">
          {user.emailAddresses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
              <Mail className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{e.emailAddress}</span>
              {e.id === user.primaryEmailAddressId && <Badge variant="secondary">Primary</Badge>}
            </li>
          ))}
        </ul>
        {signInMethods.length > 0 && <p className="text-sm text-muted-foreground">You also sign in with {signInMethods.join(', ')}.</p>}
      </section>

      {/* Password */}
      <form onSubmit={savePassword} className="flex flex-col gap-4" aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-xl">{user.passwordEnabled ? 'Change password' : 'Set a password'}</h2>
        {!user.passwordEnabled && (
          <p className="text-muted-foreground">You sign in without a password right now. Set one to also sign in with your email and password.</p>
        )}
        {user.passwordEnabled && (
          <Field label="Current password" htmlFor="current-password">
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label="New password" htmlFor="new-password" description="At least 8 characters.">
          <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password" htmlFor="confirm-password">
          <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {passwordNotice && <Alert tone={passwordNotice.tone}>{passwordNotice.text}</Alert>}
        <Button type="submit" size="lg" className="self-start" disabled={Boolean(passwordBlocker) || savingPassword}>
          {savingPassword ? <Spinner className="size-4" /> : <KeyRound aria-hidden="true" />}
          {newPassword || currentPassword ? passwordBlocker ?? 'Save password' : user.passwordEnabled ? 'Change password' : 'Set password'}
        </Button>
      </form>

      <Button variant="destructive" size="xl" onClick={() => signOut()}>
        <LogOut aria-hidden="true" /> Sign out
      </Button>
    </Page>
  );
};
