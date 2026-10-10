# Project rules

- **Never contact guests while the platform is being built.** No emails, SMS,
  push notifications, Luma invites, Luma blasts, or guest status changes.
  Guest-facing sending stays disabled (`GUEST_CONTACT_ENABLED` unset) until the
  owner explicitly turns it on for launch. The Luma client may only call the
  read endpoints and webhook registration listed in
  `packages/shared/tests/no-guest-contact.test.ts`.
- No financial data anywhere (see DECISIONS.md).
- Ask before adding paid third-party services.
- Work phase by phase; stop for approval after each phase.
