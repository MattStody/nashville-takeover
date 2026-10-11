/** Upload rules for the public event-media bucket (mirrors the bucket config). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export const MEDIA_KINDS = ['hero', 'logo', 'lineup', 'map', 'content', 'sponsor'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Returns an error message, or null when the file is acceptable. */
export function validateImage(file: { type: string; size: number }): string | null {
  if (!IMAGE_EXTENSIONS[file.type]) return 'Images must be JPEG, PNG, WebP, GIF or SVG.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 5 MB or smaller.';
  return null;
}

/** "<eventId>/<kind>/<uuid>.<ext>" — the first folder is what storage RLS checks. */
export function mediaPath(eventId: string, kind: MediaKind, type: string, id: string): string {
  const ext = IMAGE_EXTENSIONS[type];
  if (!ext) throw new Error('unsupported_image_type');
  return `${eventId}/${kind}/${id}.${ext}`;
}

/** True when a stored path belongs to this event (guards deletes). */
export function isEventMediaPath(eventId: string, path: string): boolean {
  return path.startsWith(`${eventId}/`) && !path.includes('..');
}
