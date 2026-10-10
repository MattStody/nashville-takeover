import type { LumaEvent, LumaGuest, LumaTicket, LumaTicketType } from '../types.ts';
import { Rng } from './random.ts';

export interface MockEvent {
  event: LumaEvent;
  ticketTypes: LumaTicketType[];
  guests: LumaGuest[];
  /**
   * Ticket key -> ticket id. Like the real API, keys are not on the guest
   * payload; the mock only uses them to answer guests/get lookups.
   */
  ticketKeys: Record<string, string>;
}

export interface MockDataset {
  events: MockEvent[];
}

/** The seeded demo guest who holds tickets at two events. */
export const DEMO_GUEST_EMAIL = 'guest@example.com';

const FIRST = [
  'Avery', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Harper', 'Rowan', 'Emerson',
  'Logan', 'Dakota', 'Reese', 'Skyler', 'Parker', 'Hayden', 'Cameron', 'Jamie', 'Kendall', 'Blake',
  'Wren', 'Sage', 'Ellis', 'Marlowe', 'Shiloh', 'Tatum', 'Lennon', 'Briar', 'Cash', 'Dolly',
] as const;
const LAST = [
  'Walker', 'Brooks', 'Hayes', 'Parker', 'Reed', 'Coleman', 'Jennings', 'Haggard', 'Wells', 'Owens',
  'Price', 'Bennett', 'Carter', 'Dalton', 'Monroe', 'Sutton', 'Tucker', 'Whitley', 'Young', 'Pruitt',
] as const;

interface EventSpec {
  key: string;
  name: string;
  startAt: string;
  endAt: string;
  guestCount: number;
  ticketTypes: { name: string; weight: number; isHidden?: boolean }[];
}

// Times are UTC; Nashville is UTC-6 in November and UTC-5 in March/April.
const EVENT_SPECS: EventSpec[] = [
  {
    key: 'broadway',
    name: 'The Nashville Takeover: Broadway Night',
    startAt: '2026-11-14T00:00:00.000Z',
    endAt: '2026-11-14T08:00:00.000Z',
    guestCount: 60,
    ticketTypes: [
      { name: 'General Admission', weight: 70 },
      { name: 'VIP', weight: 25 },
      { name: 'All Access', weight: 5, isHidden: true },
    ],
  },
  {
    key: 'eastside',
    name: 'The Nashville Takeover: East Side Block Party',
    startAt: '2026-11-14T19:00:00.000Z',
    endAt: '2026-11-15T05:00:00.000Z',
    guestCount: 45,
    ticketTypes: [
      { name: 'General Admission', weight: 75 },
      { name: 'VIP', weight: 25 },
    ],
  },
  {
    key: 'spring',
    name: 'The Nashville Takeover: Spring Preview',
    startAt: '2027-04-17T23:00:00.000Z',
    endAt: '2027-04-18T05:00:00.000Z',
    guestCount: 10,
    ticketTypes: [{ name: 'Early Bird', weight: 100 }],
  },
];

function weightedPick(rng: Rng, types: LumaTicketType[], specs: EventSpec['ticketTypes']): LumaTicketType {
  const total = specs.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < specs.length; i++) {
    roll -= specs[i]!.weight;
    if (roll < 0) return types[i]!;
  }
  return types[types.length - 1]!;
}

function approvalStatus(rng: Rng): string {
  const r = rng.next();
  if (r < 0.9) return 'approved';
  if (r < 0.94) return 'pending_approval';
  if (r < 0.97) return 'waitlist';
  return 'declined';
}

/**
 * Deterministic fake Luma data. Some attendees appear at several events under
 * the same email so cross-event ticket linking is exercised, and some are not
 * approved so invalid-ticket handling is exercised.
 */
export function generateMockDataset(seed = 615): MockDataset {
  const rng = new Rng(seed);

  // A shared pool of people; each event draws from it, so emails overlap.
  const people = Array.from({ length: 90 }, (_, i) => {
    const first = rng.pick(FIRST);
    const last = rng.pick(LAST);
    return { name: `${first} ${last}`, email: `${first}.${last}${i}@example.com`.toLowerCase() };
  });

  const events = EVENT_SPECS.map((spec): MockEvent => {
    const event: LumaEvent = {
      id: `evt-${rng.id(14)}`,
      name: spec.name,
      startAt: spec.startAt,
      endAt: spec.endAt,
      timezone: 'America/Chicago',
    };
    const ticketTypes = spec.ticketTypes.map(
      (t): LumaTicketType => ({
        id: `evtticktyp-${rng.id(14)}`,
        eventId: event.id,
        name: t.name,
        isHidden: t.isHidden ?? false,
      }),
    );

    const start = rng.int(0, people.length - spec.guestCount);
    const attendees = people.slice(start, start + spec.guestCount);

    const ticketKeys: Record<string, string> = {};
    const guests = attendees.map((person): LumaGuest => {
      const ticketType = weightedPick(rng, ticketTypes, spec.ticketTypes);
      const ticketCount = rng.chance(0.15) ? rng.int(2, 4) : 1;
      const tickets = Array.from({ length: ticketCount }, (): LumaTicket => {
        const id = `eventticket-${rng.id(15)}`;
        ticketKeys[rng.id(10)] = id;
        return { id, ticketTypeId: ticketType.id, ticketTypeName: ticketType.name };
      });
      return {
        id: `gst-${rng.id(14)}`,
        eventId: event.id,
        guestKey: `g-${rng.id(10)}`,
        name: person.name,
        email: person.email,
        approvalStatus: approvalStatus(rng),
        tickets,
      };
    });

    return { event, ticketTypes, guests, ticketKeys };
  });

  addDemoGuest(rng, events);
  return { events };
}

/** guest@example.com: two VIP tickets at Broadway Night, one GA at East Side. */
function addDemoGuest(rng: Rng, events: MockEvent[]): void {
  const plan: [eventIndex: number, ticketTypeName: string, count: number][] = [
    [0, 'VIP', 2],
    [1, 'General Admission', 1],
  ];
  for (const [index, typeName, count] of plan) {
    const e = events[index]!;
    const type = e.ticketTypes.find((t) => t.name === typeName)!;
    e.guests.unshift({
      id: `gst-${rng.id(14)}`,
      eventId: e.event.id,
      guestKey: `g-${rng.id(10)}`,
      name: 'Demo Guest',
      email: DEMO_GUEST_EMAIL,
      approvalStatus: 'approved',
      tickets: Array.from({ length: count }, (): LumaTicket => {
        const id = `eventticket-${rng.id(15)}`;
        e.ticketKeys[rng.id(10)] = id;
        return { id, ticketTypeId: type.id, ticketTypeName: type.name };
      }),
    });
  }
}
