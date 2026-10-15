import { useEffect, useState } from 'react';
import { Info, Phone } from 'lucide-react';
import { updateMyPhone } from '../services/api';
import { formatPhone, normalizePhone } from '../lib/phone';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Spinner } from './ui/spinner';

/**
 * Add, change or remove your phone number. We don't verify it (no code is sent), so it's marked
 * "Not verified". Only you and admins can see it.
 */
export const PhoneSection: React.FC<{ phone: string | null; onSaved: (phone: string | null) => void }> = ({ phone, onSaved }) => {
  const [value, setValue] = useState(formatPhone(phone));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // The saved number arrives after sign-in; show it once it does
  useEffect(() => {
    setValue(formatPhone(phone));
  }, [phone]);

  const typed = value.trim();
  const normalized = typed ? normalizePhone(typed) : null;
  const invalid = typed !== '' && normalized === null;
  const unchanged = (normalized ?? null) === (phone ?? null);

  const save = async (next: string) => {
    setSaving(true);
    setNotice(null);
    try {
      const user = await updateMyPhone(next);
      onSaved(user.phone ?? null);
      setNotice({ tone: 'success', text: user.phone ? 'Phone number saved.' : 'Phone number removed.' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save your number. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid && !unchanged) save(typed);
      }}
      className="flex flex-col gap-4"
      aria-labelledby="phone-heading"
    >
      <div className="flex items-center gap-2">
        <h2 id="phone-heading" className="text-xl">Phone number</h2>
        {phone ? (
          <Badge variant="outline">
            <Info aria-hidden="true" /> Not verified
          </Badge>
        ) : null}
      </div>

      <Field
        label="Your number"
        htmlFor="phone"
        description="So the team can reach you. We don't verify it, and only you and admins can see it."
      >
        <div className="relative">
          <Phone className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="+91 98765 43210"
            maxLength={40}
            aria-invalid={invalid}
            className={`pl-12 ${invalid ? 'ring-2 ring-destructive' : ''}`}
          />
        </div>
        {invalid && <p className="text-sm text-destructive">Include the country code, like +91 98765 43210.</p>}
        {!invalid && normalized && formatPhone(normalized) !== value.trim() && (
          <p className="text-sm text-muted-foreground">Will be saved as {formatPhone(normalized)}</p>
        )}
      </Field>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={invalid || unchanged || saving}>
          {saving && <Spinner className="size-4" />} {phone ? 'Save number' : 'Add number'}
        </Button>
        {phone && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={saving}
            onClick={() => {
              setValue('');
              save('');
            }}
          >
            Remove number
          </Button>
        )}
      </div>
    </form>
  );
};
