// Raw Luma payloads shaped like the OpenAPI spec, including the payment and
// personal fields we must drop, so tests prove they never get through.

export const EVENT_ID = 'evt-sjZpNrnBWMYQFwm';

export function rawTicket(id: string, typeId = 'evtticktyp-ga', name = 'General Admission') {
  return {
    id,
    amount: 4500,
    amount_discount: 500,
    amount_tax: 300,
    currency: 'usd',
    checked_in_at: null,
    event_ticket_type_id: typeId,
    is_captured: true,
    name,
  };
}

export function rawGuest(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `gst-${n}`,
    user_id: `usr-${n}`,
    user_email: `Person${n}@Example.com`,
    user_name: `Person ${n}`,
    user_first_name: 'Person',
    user_last_name: String(n),
    approval_status: 'approved',
    check_in_qr_code: `https://luma.com/check-in/${EVENT_ID}?pk=g-key${n}`,
    eth_address: null,
    invited_at: null,
    joined_at: null,
    phone_number: '+16155550100',
    registered_at: '2026-10-01T00:00:00.000Z',
    registration_answers: [{ label: 'Company', question_id: 'q1', value: 'Acme', question_type: 'text' }],
    solana_address: null,
    utm_source: 'instagram',
    attribution_params: null,
    event_tickets: [rawTicket(`evtticket-${n}`)],
    event_ticket_orders: [{ id: 'ord-1', amount: 4500, amount_discount: 0, amount_tax: 0, is_captured: true, amount_refunded: 0 }],
    ...overrides,
  };
}

/** Records requests and replies from a queue of canned responses. */
export function fakeFetch(responses: (Response | (() => Response) | Error)[]) {
  const calls: { url: URL; headers: Headers }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: no more responses');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  }) as typeof fetch;
  return { impl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
