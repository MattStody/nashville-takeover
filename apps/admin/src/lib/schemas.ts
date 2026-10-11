import { z } from 'zod';

export const uuid = z.string().uuid();

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #b3202a')
  .transform((v) => v.toLowerCase());

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');

export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Pick a date and time');

export const sortOrder = z.coerce.number().int().min(-10000).max(10000).default(0);

/** Checkbox: present ("on") when ticked, absent otherwise. */
export const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.undefined()])
  .transform((v) => v !== undefined);

export const reason = z.string().min(3, 'Give a reason (at least 3 characters)').max(500);

export const optionalUrl = z.string().url('Enter a full URL starting with https://').max(500).optional();

export const email = z.string().trim().toLowerCase().email('Enter a valid email');
