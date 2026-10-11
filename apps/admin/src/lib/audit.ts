import type { Json } from '@nt/shared';

const ACTIONS: Record<string, string> = {
  check_in: 'Checked in a ticket',
  undo_check_in: 'Undid a check-in',
  perk_redeem: 'Redeemed a perk',
  perk_adjust: 'Adjusted a perk balance',
};

const ENTITY_NAMES: Record<string, string> = {
  events: 'event details',
  ticket_types: 'a ticket type',
  perks: 'a perk',
  ticket_type_perks: 'perks for a ticket type',
  lineup_items: 'a lineup set',
  event_content: 'an FAQ/info item',
  sponsor_activations: 'a sponsor',
  staff_assignments: 'a staff assignment',
  staff_invites: 'a staff invite',
  profiles: 'admin rights',
  notifications: 'a notification',
};

const VERBS: Record<string, string> = { insert: 'Added', update: 'Updated', delete: 'Removed' };

function label(row: Json | null): string | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, Json | undefined>;
  const value = r.name ?? r.artist ?? r.title ?? r.sponsor_name ?? r.email;
  return typeof value === 'string' ? value : null;
}

/** One-line, human description of an audit_log row. */
export function describeAudit(row: { action: string; entity: string; before: Json | null; after: Json | null }): string {
  if (ACTIONS[row.action]) {
    const qty = row.after && typeof row.after === 'object' && !Array.isArray(row.after) ? row.after.quantity : undefined;
    return typeof qty === 'number' ? `${ACTIONS[row.action]} (${qty > 0 ? '-' : '+'}${Math.abs(qty)})` : ACTIONS[row.action]!;
  }
  const verb = VERBS[row.action] ?? row.action;
  const what = ENTITY_NAMES[row.entity] ?? row.entity.replace(/_/g, ' ');
  const name = label(row.after) ?? label(row.before);
  return name ? `${verb} ${what}: ${name}` : `${verb} ${what}`;
}
