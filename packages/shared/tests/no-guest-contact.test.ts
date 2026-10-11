import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hard rule: nothing we build may contact guests until launch. The Luma
// client is limited to these endpoints; anything that emails, invites or
// changes a guest in Luma is forbidden.
const ALLOWED_LUMA_PATHS = new Set([
  '/v1/events/get',
  '/v1/events/guests/list',
  '/v1/events/guests/get',
  '/v1/events/ticket-types/list',
  '/v1/webhooks/list',
  '/v2/webhooks/create',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe('no guest contact', () => {
  const roots = [
    new URL('../src', import.meta.url).pathname,
    new URL('../../../supabase/functions', import.meta.url).pathname,
    new URL('../../../apps/admin/src', import.meta.url).pathname,
    new URL('../../../apps/mobile/src', import.meta.url).pathname,
  ];
  const files = roots.flatMap(sourceFiles);

  it('only calls allow-listed Luma endpoints', () => {
    const used = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`](\/v[12]\/[a-z0-9/_-]+)['"`]/g)) used.add(m[1]!);
    }
    expect([...used].filter((p) => !ALLOWED_LUMA_PATHS.has(p))).toEqual([]);
  });

  // Staff sign-in and staff invites are allowed; these are guest-facing channels.
  it('has no code that sends guest email, SMS or push', () => {
    const forbidden = /send-invites|blasts\/create|guests\/add|update-status|exp\.host|expo-server-sdk|sendgrid|resend\.com|twilio|inviteUserByEmail/;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
