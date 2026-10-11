/** Friendly text for errors raised by our database functions and RLS. */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_event_staff: 'You are not assigned to this event.',
  not_event_manager: 'Only managers of this event can do that.',
  ticket_not_found: 'Ticket not found.',
  ticket_not_valid: 'This ticket is not valid (cancelled, or the guest is not approved).',
  ticket_not_entry: 'This ticket type does not admit entry (it is an add-on).',
  op_id_reused: 'That action was already recorded for a different ticket. Refresh and try again.',
  reason_required: 'A reason is required.',
  invalid_quantity: 'Enter a non-zero whole number.',
  perk_not_found: 'Perk not found for this event.',
  perk_not_included: "This ticket's type doesn't include that perk.",
  perk_outside_window: 'This perk is outside its valid time window.',
  perk_exhausted: 'No remaining balance for this perk.',
  check_in_not_found: 'Check-in not found.',
  luma_event_not_found: 'Luma could not find that event, or the API key cannot see it.',
  sync_in_progress: 'A sync is already running for this event.',
  luma_rate_limited: 'Luma is rate limiting requests. Try again in a minute.',
  luma_unavailable: 'Luma did not respond. Try again shortly.',
  forbidden: 'You do not have permission to do that.',
};

export function friendlyError(error: unknown): string {
  const text =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (text.includes(code)) return message;
  }
  if (/row-level security|permission denied/i.test(text)) return MESSAGES.forbidden!;
  if (/duplicate key/i.test(text)) return 'That already exists.';
  if (/violates check constraint/i.test(text)) return 'Some values are not allowed. Check the form and try again.';
  return 'Something went wrong. Try again, and contact an admin if it keeps happening.';
}
