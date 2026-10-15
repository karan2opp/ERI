import { useState } from 'react';
import type { Role, User } from '../types';
import { setUserRole } from '../services/api';
import { ROLE_LABEL, asRole } from '../lib/roles';

const ROLE_OPTIONS: Role[] = ['USER', 'TEAM_MEMBER', 'ADMIN'];

/**
 * An admin's role picker for one user. It saves as soon as you choose and puts the old role back
 * if the server refuses. You can't change your own role, so the picker is disabled for yourself.
 */
export const RoleSelect: React.FC<{ user: Pick<User, 'id' | 'name' | 'email' | 'role'>; isSelf: boolean; onError?: (message: string | null) => void }> = ({
  user,
  isSelf,
  onError,
}) => {
  const [role, setRole] = useState<Role>(asRole(user.role));
  const [saving, setSaving] = useState(false);

  const change = async (next: Role) => {
    const previous = role;
    setRole(next);
    setSaving(true);
    onError?.(null);
    try {
      await setUserRole(user.id, next);
    } catch (err) {
      setRole(previous);
      onError?.((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't change the role. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={role}
      onChange={(e) => change(e.target.value as Role)}
      disabled={isSelf || saving}
      aria-label={`Role for ${user.name || user.email}`}
      title={isSelf ? "You can't change your own role" : undefined}
      className="h-10 cursor-pointer rounded-full bg-secondary px-3 text-[15px] font-medium text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      {ROLE_OPTIONS.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
};
