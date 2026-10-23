import { Response } from 'express';
import { clerkClient } from '@clerk/express';
import { checkResetCode, sendResetCode, MAX_WRONG_TRIES } from '../../common/services/passwordReset';
import { eq } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { db } from '../../common/db';
import { users } from '../../common/db/schema';
import { z } from 'zod';
import { normalizePhone } from '../../common/utils/phone';
import { isUniqueViolation, nameTaken, normalizeName, splitName } from '../../common/utils/userName';

/**
 * requireAuth has already created/loaded the user row from the verified Clerk session.
 * Syncing also copies the latest name and photo from Clerk (people edit them on the Account page),
 * so trees and care logs show the current ones. The role is never touched here: admins are
 * promoted manually in the database (users.role = 'ADMIN').
 */
export const syncUserController = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  try {
    const clerkUser = await clerkClient.users.getUser(user.id);
    let name = normalizeName([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')) || user.name;
    const avatarUrl = clerkUser.imageUrl || user.avatarUrl;

    // Names are unique. If the name in Clerk now belongs to someone else (changed behind our back), keep ours
    // and put it back in Clerk so the Account page agrees
    if (name && name !== user.name && name.toLowerCase() !== (user.name ?? '').toLowerCase() && (await nameTaken(name, user.id))) {
      name = user.name;
      if (user.name) clerkClient.users.updateUser(user.id, splitName(user.name)).catch((err) => console.warn('Could not restore the name in Clerk:', err));
    }

    if (name !== user.name || avatarUrl !== user.avatarUrl) {
      try {
        const [updated] = await db
          .update(users)
          .set({ name, avatarUrl, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        return res.status(200).json({ success: true, data: updated });
      } catch (err) {
        // Someone took the name this very moment: carry on with the old one
        if (!isUniqueViolation(err)) throw err;
      }
    }
  } catch (err) {
    // Clerk unreachable: carry on with what we have
    console.warn('Profile refresh from Clerk failed:', err);
  }
  return res.status(200).json({ success: true, data: user });
};

/**
 * PUT /users/me/phone  { phone: "+91 98765 43210" | "" | null }
 * Saves your phone number (or removes it when empty). It isn't verified. Only you and admins can see it.
 */
export const setMyPhoneController = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ phone: z.string().max(40).nullable() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'phone must be text or empty' });
  }

  const raw = parsed.data.phone?.trim() ?? '';
  let phone: string | null = null;
  if (raw) {
    phone = normalizePhone(raw);
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'That doesn\'t look like a phone number. Include the country code, like +91 98765 43210.'
      });
    }
  }

  try {
    const [updated] = await db
      .update(users)
      .set({ phone, updatedAt: new Date() })
      .where(eq(users.id, req.userId!))
      .returning();
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('Error saving phone number:', err);
    return res.status(500).json({ success: false, error: 'Failed to save your phone number' });
  }
};

/**
 * POST /users/me/password-reset: emails a 6-digit code to the signed-in person's address, so they can choose
 * a new password without knowing the current one. (Clerk won't start its own reset for someone who is already
 * signed in, so this is done here.) Only for people who have a password: Google-only accounts have none.
 */
export const requestPasswordResetController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clerkUser = await clerkClient.users.getUser(req.userId!);
    if (!clerkUser.passwordEnabled) {
      return res.status(400).json({ success: false, error: 'This account signs in without a password, so there is no password to reset.' });
    }
    const primary = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ?? clerkUser.emailAddresses[0];
    const email = primary?.emailAddress ?? req.user!.email;
    const result = await sendResetCode(req.userId!, email, req.user!.name);
    if (result.ok) return res.status(200).json({ success: true });
    if (result.reason === 'too-soon') {
      return res.status(429).json({ success: false, error: `A code was just sent. You can ask for another in ${result.waitSeconds} seconds.` });
    }
    if (result.reason === 'email-off') {
      return res.status(503).json({ success: false, error: "Email isn't set up on this server yet, so the code can't be sent." });
    }
    res.status(502).json({ success: false, error: "We couldn't send the email. Try again in a moment." });
  } catch (err) {
    console.error('Error sending a password reset code:', err);
    res.status(500).json({ success: false, error: "We couldn't send the email. Try again in a moment." });
  }
};

/** POST /users/me/password-reset/confirm  { code, newPassword }: checks the emailed code and sets the new password. */
export const confirmPasswordResetController = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'), newPassword: z.string().min(8, 'Use at least 8 characters').max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues.map((i) => i.message).join('; ') });

  try {
    const checked = await checkResetCode(req.userId!, parsed.data.code);
    if (!checked.ok) {
      const error =
        checked.reason === 'wrong'
          ? `That code isn't right. ${checked.triesLeft} ${checked.triesLeft === 1 ? 'try' : 'tries'} left.`
          : checked.reason === 'locked'
            ? `Too many wrong codes (${MAX_WRONG_TRIES}). Ask for a new code.`
            : checked.reason === 'expired'
              ? 'That code has expired. Ask for a new one.'
              : 'There is no code waiting. Ask for one first.';
      return res.status(400).json({ success: false, error });
    }
    try {
      await clerkClient.users.updateUser(req.userId!, { password: parsed.data.newPassword, signOutOfOtherSessions: true });
    } catch (err) {
      // Clerk refuses weak or leaked passwords: say why, and the person can ask for a new code
      const message = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]?.longMessage || (err as Error).message;
      return res.status(422).json({ success: false, error: `${message || "That password can't be used."} Ask for a new code and try another password.` });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error resetting a password:', err);
    res.status(500).json({ success: false, error: "Couldn't change the password. Try again." });
  }
};

/**
 * PUT /users/me/name  { firstName, lastName? }
 * Changes your name. Names are unique (capital letters don't matter), so a name someone already has is refused with 409.
 * The name is saved here first, then in Clerk, so the Account page and the rest of the app agree.
 */
export const setMyNameController = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = z
    .object({ firstName: z.string().trim().min(1).max(50), lastName: z.string().trim().max(50).optional().default('') })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Enter a first name (up to 50 characters) and, if you like, a last name.' });
  }
  const taken = { success: false, code: 'NAME_TAKEN', error: 'Someone already has that name. Add a middle initial or a number so yours is different.' };

  const name = normalizeName(`${parsed.data.firstName} ${parsed.data.lastName}`);
  const previous = req.user!.name;
  try {
    if (await nameTaken(name, req.userId!)) return res.status(409).json(taken);
    const [updated] = await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, req.userId!)).returning();

    try {
      await clerkClient.users.updateUser(req.userId!, splitName(name));
    } catch (err) {
      // Clerk didn't take it: put the old name back so the two don't disagree
      console.error('Could not save the name in Clerk:', err);
      await db.update(users).set({ name: previous }).where(eq(users.id, req.userId!));
      return res.status(502).json({ success: false, error: "Couldn't save your name. Try again." });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json(taken);
    console.error('Error changing name:', err);
    return res.status(500).json({ success: false, error: "Couldn't save your name. Try again." });
  }
};
