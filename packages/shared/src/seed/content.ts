import type { ContentKind, EventStatus, StaffRole } from '../types/domain.ts';

// App-side demo content layered on top of the mock Luma dataset. Keyed by the
// event's position in generateMockDataset(): 0 = Broadway, 1 = East Side,
// 2 = Spring Preview. All names, venues and sponsors are fictional.

export interface SeedUser {
  email: string;
  displayName: string;
  isAdmin?: boolean;
  assignments?: { event: number; role: StaffRole }[];
}

export const SEED_USERS: SeedUser[] = [
  { email: 'admin@example.com', displayName: 'Alex Admin', isAdmin: true },
  {
    email: 'manager@example.com',
    displayName: 'Morgan Manager',
    assignments: [
      { event: 0, role: 'manager' },
      { event: 1, role: 'manager' },
    ],
  },
  { email: 'staff@example.com', displayName: 'Sam Scanner', assignments: [{ event: 0, role: 'staff' }] },
  { email: 'staff2@example.com', displayName: 'Jess Gate', assignments: [{ event: 1, role: 'staff' }] },
  // Matches the mock dataset's demo guest, so their tickets link on seed.
  { email: 'guest@example.com', displayName: 'Demo Guest' },
];

export interface SeedEventMeta {
  slug: string;
  status: EventStatus;
  description: string;
  venueName: string;
  venueAddress: string;
  primaryColor: string;
  accentColor: string;
}

export const SEED_EVENT_META: SeedEventMeta[] = [
  {
    slug: 'broadway-night-2026',
    status: 'published',
    description: 'Three stages, one night, all down Lower Broadway.',
    venueName: 'Cumberland Riverfront Hall',
    venueAddress: '100 River Landing Way, Nashville, TN 37201',
    primaryColor: '#B3202A',
    accentColor: '#F2C14E',
  },
  {
    slug: 'east-side-block-party-2026',
    status: 'published',
    description: 'An all-day block party across East Nashville backyards and bars.',
    venueName: 'Five Points Commons',
    venueAddress: '1000 Woodland St, Nashville, TN 37206',
    primaryColor: '#1F4E79',
    accentColor: '#F28C28',
  },
  {
    slug: 'spring-preview-2027',
    status: 'draft',
    description: 'A first look at the 2027 season.',
    venueName: 'The Gulch Yard',
    venueAddress: '600 Twelfth Ave S, Nashville, TN 37203',
    primaryColor: '#2E6B3F',
    accentColor: '#E8D5B5',
  },
];

export interface SeedPerk {
  name: string;
  description: string;
  icon: string;
  /** Minutes relative to event start; omitted = valid all event. */
  window?: { fromMin: number; untilMin: number };
  /** Ticket type name -> quantity per ticket. */
  allowances: Record<string, number>;
}

export const SEED_PERKS: Record<number, SeedPerk[]> = {
  0: [
    {
      name: 'Drink Token',
      description: 'Redeem at any bar for one drink.',
      icon: 'beer',
      allowances: { 'General Admission': 1, VIP: 2, 'All Access': 4 },
    },
    {
      name: 'VIP Lounge Access',
      description: 'Entry to the mezzanine lounge with private bar and restrooms.',
      icon: 'crown',
      allowances: { VIP: 1, 'All Access': 1 },
    },
    {
      name: 'Merch Pickup',
      description: 'One free tour poster at the merch tent before 9pm.',
      icon: 'shirt',
      window: { fromMin: 0, untilMin: 180 },
      allowances: { VIP: 1, 'All Access': 1 },
    },
    {
      name: 'Side Stage Viewing',
      description: 'Side stage access for one set on the Main Stage.',
      icon: 'music',
      allowances: { 'All Access': 1 },
    },
  ],
  1: [
    {
      name: 'Drink Token',
      description: 'Redeem at any participating bar.',
      icon: 'beer',
      allowances: { 'General Admission': 1, VIP: 3 },
    },
    {
      name: 'Hot Chicken Plate',
      description: 'One plate from the food truck row.',
      icon: 'utensils',
      allowances: { VIP: 1 },
    },
  ],
  2: [
    {
      name: 'Welcome Drink',
      description: 'One drink on arrival.',
      icon: 'beer',
      allowances: { 'Early Bird': 1 },
    },
  ],
};

export interface SeedSet {
  artist: string;
  stage: string;
  /** Minutes after event start. */
  startMin: number;
  durationMin: number;
  description: string;
}

export const SEED_LINEUP: Record<number, SeedSet[]> = {
  0: [
    { artist: 'The Silver Spurs', stage: 'Main Stage', startMin: 30, durationMin: 45, description: 'Honky-tonk openers.' },
    { artist: 'Magnolia Static', stage: 'Main Stage', startMin: 90, durationMin: 60, description: 'Indie rock with steel guitar.' },
    { artist: 'June Halloway', stage: 'Main Stage', startMin: 170, durationMin: 75, description: 'Headline set.' },
    { artist: 'Copper Creek Trio', stage: 'Honky Tonk Tent', startMin: 45, durationMin: 50, description: 'Bluegrass.' },
    { artist: 'Neon Rodeo', stage: 'Honky Tonk Tent', startMin: 110, durationMin: 50, description: 'Two-step all night.' },
    { artist: 'DJ Hot Chicken', stage: 'Rooftop', startMin: 60, durationMin: 240, description: 'Country remixes till close.' },
  ],
  1: [
    { artist: 'Porch Light Revival', stage: 'Backyard Stage', startMin: 60, durationMin: 60, description: 'Americana.' },
    { artist: 'Velvet Holler', stage: 'Backyard Stage', startMin: 150, durationMin: 60, description: 'Soul and country.' },
    { artist: 'The Gallatin Pikes', stage: 'Garage Stage', startMin: 90, durationMin: 45, description: 'Garage punk.' },
    { artist: 'Carmen Ruiz', stage: 'Garage Stage', startMin: 200, durationMin: 60, description: 'Songwriter set.' },
  ],
  2: [],
};

export interface SeedContent {
  kind: ContentKind;
  title: string;
  body: string;
}

const COMMON_FAQS: SeedContent[] = [
  { kind: 'faq', title: 'What can I bring?', body: 'Clear bags up to 12" x 12". No outside food or drink.' },
  { kind: 'faq', title: 'Is re-entry allowed?', body: 'Yes. Keep your QR code handy; you will be re-scanned at the gate.' },
  { kind: 'faq', title: 'Is the event all ages?', body: '21+ to drink. Under 21 admitted with a valid ID and wristband.' },
];

export const SEED_CONTENT: Record<number, SeedContent[]> = {
  0: [
    ...COMMON_FAQS,
    { kind: 'info', title: 'Getting there', body: 'Rideshare drop-off is on 1st Ave N. Bike valet at the river gate.' },
    { kind: 'map', title: 'Venue map', body: 'Main Stage at the river, Honky Tonk Tent north lawn, Rooftop via the east stairs.' },
  ],
  1: [
    ...COMMON_FAQS,
    { kind: 'info', title: 'Getting there', body: 'Street parking is limited. Shuttles run from downtown every 20 minutes.' },
  ],
  2: [],
};

export interface SeedSponsor {
  name: string;
  description: string;
  location: string;
  ctaUrl?: string;
}

export const SEED_SPONSORS: Record<number, SeedSponsor[]> = {
  0: [
    { name: 'Cumberland Cold Brew', description: 'Free iced coffee samples all night.', location: 'Near the Rooftop stairs', ctaUrl: 'https://example.com/cold-brew' },
    { name: 'Broadway Letterpress Co.', description: 'Watch live letterpress poster printing.', location: 'Merch tent' },
    { name: 'Bluebird Wireless', description: 'Phone charging lounge.', location: 'Honky Tonk Tent' },
  ],
  1: [{ name: 'Five Points Hot Sauce', description: 'Hot sauce tasting flight.', location: 'Food truck row' }],
  2: [],
};
