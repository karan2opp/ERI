import { z } from 'zod';

const uuidSchema = z.string().uuid();

/** Postgres throws on malformed uuid params; check first so those requests 404 instead of 500. */
export const isUuid = (value: unknown): value is string => uuidSchema.safeParse(value).success;

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);
