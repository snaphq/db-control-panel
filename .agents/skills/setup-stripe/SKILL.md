---
name: setup-stripe
description: Configure Stripe billing during initial project setup (API keys, webhook, stripe-sync-engine schema, default products, data sync). Use when following SETUP.md and the user wants payments; skip it if they don't.
---

# Set up Stripe

Billing code is always present; without Stripe keys it stays inactive. This
skill wires a Stripe account to it.

## 1. Collect keys

Ask the user for their Stripe **test-mode** keys first (live keys later, in
the deployment environment):

- `STRIPE_SECRET_KEY` (`sk_test_…`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) — needed for inline card
  collection when creating a workspace

Write them with the core setup script:

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section Stripe \
  --set STRIPE_SECRET_KEY=sk_test_... \
  --set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 2. Run the wizard

`scripts/setup-stripe.ts` is interactive (it asks before each step), so the
user runs it in their own terminal. In Claude Code they can type:

```
! bun .agents/skills/setup-stripe/scripts/setup-stripe.ts
```

It will:

1. Verify the API keys and detect test vs live mode.
2. Create the webhook endpoint `<backend URL>/api/webhooks/stripe` (the
   admin backend, `apps/backend`, handles Stripe webhooks for every site)
   and save `STRIPE_WEBHOOK_SECRET` to `.env.local`. For local development
   the user can instead run `stripe listen --forward-to
   localhost:8800/api/webhooks/stripe` and use its signing secret.
3. Run the `stripe-sync-engine` migrations (`stripe` schema in Postgres).
4. Create default products and prices.
5. Backfill existing Stripe data into the database.

## 3. Verify

- `bun run stripe:verify` passes.
- `bun run db:seed:billing` seeds plan tiers.
- Creating a workspace shows the payment step with a card field.

The ongoing commands `stripe:verify`, `stripe:migrate`, and `stripe:backfill`
stay in the root `package.json` after setup.
