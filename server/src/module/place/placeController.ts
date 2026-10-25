import { Request, Response } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../common/db';
import { placeForms, placeSuggestions, users, type PlaceForm } from '../../common/db/schema';
import { isUuid } from '../../common/utils/validation';
import { isAdminRole } from '../../common/auth/roles';
import type { AuthenticatedRequest } from '../../common/middlewares/authMiddleware';
import { CloudinaryService } from '../../common/services/cloudinaryService';
import { MAX_PLACE_PHOTOS, claimUpload, discardUploads, inspectUpload, uploadRefSchema } from '../../common/services/uploads';
import { sendUploadError } from '../../common/utils/uploadErrors';
import { notifyAdmins } from '../../common/services/inbox';
import { coordinatesFromGoogleMapsUrl, isGoogleMapsUrl } from '../../common/utils/googleMaps';

/**
 * Place forms: an admin asks people where we could plant trees or hold a clean-up drive. Anyone can read the
 * forms; signed-in people send places through the open ones (a pin on our map and/or a Google Maps link, a
 * landmark, up to 5 pictures and answers to the form's questions). Only admins see what was sent.
 */

export const PLACE_FORM_KINDS = ['PLANTATION', 'CLEANUP', 'EITHER'] as const;
const PLACE_KINDS = ['PLANTATION', 'CLEANUP'] as const;
export const MAX_QUESTIONS = 2;

const firstError = (error: z.ZodError) => error.issues[0]?.message ?? 'Check the form and try again';

const formFields = {
  title: z.string().trim().min(1, 'Give the form a title').max(255, 'The title can be up to 255 characters'),
  description: z.string().trim().max(2000, 'The description can be up to 2000 characters'),
  kind: z.enum(PLACE_FORM_KINDS, { message: 'Choose what the places are for' }),
  questions: z
    .array(z.string().trim().min(1, 'A question cannot be empty').max(300, 'A question can be up to 300 characters'))
    .max(MAX_QUESTIONS, `A form can have up to ${MAX_QUESTIONS} questions`),
  status: z.enum(['OPEN', 'CLOSED']),
};

const createFormSchema = z.object({
  title: formFields.title,
  description: formFields.description.default(''),
  kind: formFields.kind.default('PLANTATION'),
  questions: formFields.questions.default([]),
  status: formFields.status.default('OPEN'),
});
const updateFormSchema = z
  .object(formFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one thing to change');

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const paged = <T>(rows: T[], total: number, page: number, limit: number) => ({
  success: true,
  data: rows,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** How many places were sent through a form (admins only see this). */
// Written out in full: inside a select, Drizzle would print the bare "id", which reads as the suggestion's own id
const suggestionCount = sql<number>`(select count(*) from place_suggestions s where s.form_id = "place_forms"."id")`;

/** A form as people see it; admins also get how many places came in. */
const present = (form: PlaceForm, count?: number) => ({
  id: form.id,
  title: form.title,
  description: form.description,
  kind: form.kind,
  status: form.status,
  questions: form.questions,
  createdAt: form.createdAt,
  updatedAt: form.updatedAt,
  ...(count !== undefined ? { suggestionCount: Number(count) } : {}),
});

/** GET /place-forms?page=&limit=&status=OPEN|CLOSED: open forms first, then the newest. Anyone can read them. */
export const listPlaceForms = async (req: Request, res: Response) => {
  const parsed = pageQuery.extend({ status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('ALL') }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid page' });
  const { page, limit, status } = parsed.data;
  const admin = isAdminRole((req as AuthenticatedRequest).userRole);
  const where = status === 'ALL' ? undefined : eq(placeForms.status, status);
  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ form: placeForms, count: suggestionCount })
        .from(placeForms)
        .where(where)
        .orderBy(sql`${placeForms.status} = 'OPEN' desc`, desc(placeForms.createdAt), desc(placeForms.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(placeForms).where(where),
    ]);
    res.status(200).json(paged(rows.map((r) => present(r.form, admin ? r.count : undefined)), Number(total), page, limit));
  } catch (err) {
    console.error('Error listing place forms:', err);
    res.status(500).json({ success: false, error: 'Failed to load the forms' });
  }
};

/** GET /place-forms/:id */
export const getPlaceForm = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Form not found' });
  try {
    const [row] = await db.select({ form: placeForms, count: suggestionCount }).from(placeForms).where(eq(placeForms.id, id));
    if (!row) return res.status(404).json({ success: false, error: 'Form not found' });
    const admin = isAdminRole((req as AuthenticatedRequest).userRole);
    res.status(200).json({ success: true, data: present(row.form, admin ? row.count : undefined) });
  } catch (err) {
    console.error('Error fetching place form:', err);
    res.status(500).json({ success: false, error: 'Failed to load the form' });
  }
};

/** POST /place-forms (admin) { title, description?, kind?, questions?, status? } */
export const createPlaceForm = async (req: Request, res: Response) => {
  const parsed = createFormSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: firstError(parsed.error) });
  try {
    const { description, ...rest } = parsed.data;
    const [form] = await db
      .insert(placeForms)
      .values({ ...rest, description: description || null, createdBy: (req as AuthenticatedRequest).userId })
      .returning();
    res.status(201).json({ success: true, data: present(form, 0) });
  } catch (err) {
    console.error('Error creating place form:', err);
    res.status(500).json({ success: false, error: 'Failed to create the form' });
  }
};

/** PATCH /place-forms/:id (admin): change any field, or open and close it with { status }. */
export const updatePlaceForm = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Form not found' });
  const parsed = updateFormSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: firstError(parsed.error) });
  try {
    const { description, ...rest } = parsed.data;
    const [form] = await db
      .update(placeForms)
      .set({ ...rest, ...(description !== undefined ? { description: description || null } : {}), updatedAt: new Date() })
      .where(eq(placeForms.id, id))
      .returning();
    if (!form) return res.status(404).json({ success: false, error: 'Form not found' });
    const [{ count }] = await db.select({ count: suggestionCount }).from(placeForms).where(eq(placeForms.id, id));
    res.status(200).json({ success: true, data: present(form, count) });
  } catch (err) {
    console.error('Error updating place form:', err);
    res.status(500).json({ success: false, error: 'Failed to save the form' });
  }
};

const removePhotos = (photos: { publicId: string }[]) => {
  for (const p of photos) void CloudinaryService.deleteImage(p.publicId);
};

/** DELETE /place-forms/:id (admin): the form, every place sent through it, and their pictures. */
export const deletePlaceForm = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Form not found' });
  try {
    const sent = await db.select({ photos: placeSuggestions.photos }).from(placeSuggestions).where(eq(placeSuggestions.formId, id));
    const [form] = await db.delete(placeForms).where(eq(placeForms.id, id)).returning({ id: placeForms.id });
    if (!form) return res.status(404).json({ success: false, error: 'Form not found' });
    res.status(200).json({ success: true, data: { id, removed: true, suggestionsRemoved: sent.length } });
    removePhotos(sent.flatMap((s) => s.photos));
  } catch (err) {
    console.error('Error deleting place form:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to delete the form' });
  }
};

const suggestionSchema = z.object({
  kind: z.enum(PLACE_KINDS, { message: 'Choose planting trees or a clean-up drive' }).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  googleMapsUrl: z
    .string()
    .trim()
    .max(1000, 'The Google Maps link is too long')
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || isGoogleMapsUrl(v), 'Paste a Google Maps link (it starts with https://maps.app.goo.gl or https://www.google.com/maps)'),
  landmark: z.string().trim().min(1, 'Add a landmark so we can find the place').max(255, 'The landmark can be up to 255 characters'),
  // The answers, in the order of the form's questions
  answers: z.array(z.string().trim().max(1000, 'An answer can be up to 1000 characters')).max(10).default([]),
  // Up to 5 pictures, already uploaded straight to Cloudinary
  photos: z.array(uploadRefSchema).max(MAX_PLACE_PHOTOS, `Add up to ${MAX_PLACE_PHOTOS} pictures`).default([]),
});

/**
 * POST /place-forms/:id/suggestions (signed in): sends a place through an open form. JSON: kind (when the form takes
 * either), latitude and longitude (the pin on our map) and/or googleMapsUrl, landmark, answers, and up to 5
 * pictures that were already uploaded straight to Cloudinary (each { publicId, version, signature }).
 */
export const createSuggestion = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Form not found' });
  const parsed = suggestionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: firstError(parsed.error) });
  const input = parsed.data;
  const r = req as AuthenticatedRequest;
  const userId = r.userId!;
  // Only photos this person really uploaded (checked below) may ever be thrown away
  let verified: string[] = [];

  try {
    // Every picture has to be genuine and this person's before anything else happens (so nothing else is touched)
    const seen = new Set<string>();
    for (const ref of input.photos) {
      if (seen.has(ref.publicId)) {
        await discardUploads(verified);
        return res.status(400).json({ success: false, error: 'The same picture was added twice' });
      }
      seen.add(ref.publicId);
      await inspectUpload(userId, 'PLACE', ref);
      verified.push(ref.publicId);
    }

    const [form] = await db.select().from(placeForms).where(eq(placeForms.id, id));
    if (!form) {
      await discardUploads(verified);
      return res.status(404).json({ success: false, error: 'Form not found' });
    }
    // Anything refused from here on leaves the pictures unused: they are thrown away
    const refuse = async (status: number, error: string) => {
      await discardUploads(verified);
      return res.status(status).json({ success: false, error });
    };
    if (form.status !== 'OPEN') return refuse(409, 'This form is closed and no longer takes places');

    const kind = form.kind === 'EITHER' ? input.kind : form.kind;
    if (!kind) return refuse(400, 'Say whether the place is for planting trees or a clean-up drive');

    // Both halves of the pin or neither; without a pin, the Google Maps link has to say where
    if ((input.latitude === undefined) !== (input.longitude === undefined)) {
      return refuse(400, 'Send both the latitude and the longitude of the pin');
    }
    const pin = input.latitude !== undefined && input.longitude !== undefined ? { lat: input.latitude, lng: input.longitude } : input.googleMapsUrl ? coordinatesFromGoogleMapsUrl(input.googleMapsUrl) : null;
    if (!pin && !input.googleMapsUrl) return refuse(400, 'Put the pin on the map or paste a Google Maps link');

    const questions = form.questions ?? [];
    if (input.answers.length !== questions.length || input.answers.some((a) => !a)) {
      return refuse(400, questions.length === 1 ? 'Answer the question' : 'Answer every question');
    }

    // The pictures are claimed in the same transaction as the place: both are saved, or neither
    const row = await db.transaction(async (tx) => {
      const photos: { url: string; publicId: string }[] = [];
      for (const ref of input.photos) photos.push(await claimUpload(tx, userId, 'PLACE', ref));
      const [saved] = await tx
        .insert(placeSuggestions)
        .values({
          formId: form.id,
          userId,
          kind,
          latitude: pin?.lat ?? null,
          longitude: pin?.lng ?? null,
          googleMapsUrl: input.googleMapsUrl ?? null,
          landmark: input.landmark,
          answers: questions.map((question, i) => ({ question, answer: input.answers[i] })),
          photos,
        })
        .returning();
      return saved;
    });
    verified = [];
    res.status(201).json({ success: true, data: { id: row.id, createdAt: row.createdAt } });
    void notifyAdmins(
      {
        type: 'PLACE_SUGGESTED',
        title: `${r.userName || 'Someone'} suggested a place ${kind === 'CLEANUP' ? 'to clean up' : 'for planting'}`,
        body: `${input.landmark} · ${form.title}`,
        link: `/map?open=admin&tab=places&form=${form.id}`,
      },
      userId
    );
  } catch (err) {
    // The place was not saved: its verified pictures are not needed
    await discardUploads(verified);
    if (sendUploadError(res, err)) return;
    console.error('Error sending a place:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Couldn't send the place. Try again." });
  }
};

/** GET /place-forms/:id/suggestions?page=&limit= (admin): newest first, with who sent each one. */
export const listSuggestions = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ success: false, error: 'Form not found' });
  const parsed = pageQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid page' });
  const { page, limit } = parsed.data;
  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: placeSuggestions.id,
          kind: placeSuggestions.kind,
          latitude: placeSuggestions.latitude,
          longitude: placeSuggestions.longitude,
          googleMapsUrl: placeSuggestions.googleMapsUrl,
          landmark: placeSuggestions.landmark,
          answers: placeSuggestions.answers,
          photos: placeSuggestions.photos,
          createdAt: placeSuggestions.createdAt,
          userId: placeSuggestions.userId,
          userName: users.name,
          userEmail: users.email,
          userPhone: users.phone,
          userAvatarUrl: users.avatarUrl,
        })
        .from(placeSuggestions)
        .leftJoin(users, eq(users.id, placeSuggestions.userId))
        .where(eq(placeSuggestions.formId, id))
        .orderBy(desc(placeSuggestions.createdAt), desc(placeSuggestions.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: sql<number>`count(*)` }).from(placeSuggestions).where(eq(placeSuggestions.formId, id)),
    ]);
    // Only the picture addresses go out, not Cloudinary ids
    const data = rows.map(({ photos, ...rest }) => ({ ...rest, photos: photos.map((p) => p.url) }));
    res.status(200).json(paged(data, Number(total), page, limit));
  } catch (err) {
    console.error('Error listing places:', err);
    res.status(500).json({ success: false, error: 'Failed to load the places' });
  }
};

/** DELETE /place-forms/:id/suggestions/:suggestionId (admin) */
export const deleteSuggestion = async (req: Request, res: Response) => {
  const { id, suggestionId } = req.params;
  if (!isUuid(id) || !isUuid(suggestionId)) return res.status(404).json({ success: false, error: 'Place not found' });
  try {
    const [row] = await db
      .delete(placeSuggestions)
      .where(and(eq(placeSuggestions.id, suggestionId), eq(placeSuggestions.formId, id)))
      .returning({ photos: placeSuggestions.photos });
    if (!row) return res.status(404).json({ success: false, error: 'Place not found' });
    res.status(200).json({ success: true, data: { id: suggestionId, removed: true } });
    removePhotos(row.photos);
  } catch (err) {
    console.error('Error deleting a place:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to remove the place' });
  }
};
