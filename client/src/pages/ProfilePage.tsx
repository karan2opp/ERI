import { useAuth, useClerk, useUser } from '@clerk/react';
import { LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import type { Tree } from '../types';
import { useThemeChoice, type ThemeChoice } from '../lib/theme';
import { treeStatus } from '../lib/trees';
import { Page } from '../components/ui/top-bar';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Chips } from '../components/ui/chips';
import { Stat } from './MyTreesPage';

const THEMES: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="size-4" aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-4" aria-hidden="true" /> },
  { value: 'system', label: 'Device', icon: <Monitor className="size-4" aria-hidden="true" /> },
];

export const ProfilePage: React.FC<{ role: 'USER' | 'ADMIN'; myTrees: Tree[]; onClose: () => void }> = ({ role, myTrees, onClose }) => {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { openUserProfile } = useClerk();
  const [theme, setTheme] = useThemeChoice();
  const cared = myTrees.filter((t) => treeStatus(t) === 'healthy').length;

  return (
    <Page title="Account" onBack={onClose}>
      <div className="flex items-center gap-4">
        {user?.imageUrl && <img src={user.imageUrl} alt="" className="size-16 rounded-full bg-muted" />}
        <div className="min-w-0">
          <h2 className="truncate text-2xl">{user?.fullName || user?.username || 'You'}</h2>
          <p className="truncate text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
          {role === 'ADMIN' && <Badge variant="primary" className="mt-2">Admin</Badge>}
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="impact">
        <h2 id="impact" className="text-xl">Your impact</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={myTrees.length} label={myTrees.length === 1 ? 'tree planted' : 'trees planted'} />
          <Stat value={cared} label="healthy right now" />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="appearance">
        <h2 id="appearance" className="text-xl">Appearance</h2>
        <Chips label="Theme" options={THEMES} value={theme} onChange={setTheme} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="account-actions">
        <h2 id="account-actions" className="sr-only">Account</h2>
        <Button variant="secondary" size="xl" onClick={() => openUserProfile()}>
          <Settings aria-hidden="true" /> Name, email and password
        </Button>
        <Button variant="destructive" size="xl" onClick={() => signOut()}>
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </section>
    </Page>
  );
};
