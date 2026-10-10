# Edge functions

`luma-webhook` and `luma-sync` are built in Phase 2. They import the Luma
adapter from `packages/shared/src` (Deno-compatible: explicit `.ts` imports,
no Node APIs) and pick mock or live mode from the `LUMA_MODE` secret.
