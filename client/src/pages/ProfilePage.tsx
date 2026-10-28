import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { Camera, LogOut, Mail } from 'lucide-react';
import type { Role } from '../types';
import { ROLE_LABEL } from '../lib/roles';
import { PhoneSection } from '../components/PhoneSection';
import { NotificationsSection } from '../components/NotificationsSection';
import { PasswordSection } from '../components/PasswordSection';
import { setMyName, syncCurrentUser } from '../services/api';
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
  /** How many trees you planted, and how many of them need water */
  myTreeSummary: { total: number; thirsty: number; needy?: number } | null;
  onClose: () => void;
  onProfileChanged: () => void;
}> = ({
  role,
  phone,
  onPhoneChanged,
  myTreeSummary,
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
      // Through our server, which keeps names unique and saves the name in Clerk too
      await setMyName(firstName.trim(), lastName.trim());
      await user.reload();
      await afterChange();
      setNameNotice({ tone: 'success', text: 'Name saved.' });
    } catch (err) {
      const fromServer = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setNameNotice({ tone: 'error', text: fromServer || "Couldn't save your name. Try again." });
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

  const planted = myTreeSummary?.total ?? 0;
  const healthy = Math.max(0, planted - (myTreeSummary?.needy ?? myTreeSummary?.thirsty ?? 0));
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
        <Stat value={planted} label={planted === 1 ? 'tree planted' : 'trees planted'} />
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

      <NotificationsSection />

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

      {/* Only people who have a password see this: someone who signs in with Google alone has none to change */}
      {user.passwordEnabled && <PasswordSection />}

      <Button variant="destructive" size="xl" onClick={() => signOut()}>
        <LogOut aria-hidden="true" /> Sign out
      </Button>
    </Page>
  );
};
