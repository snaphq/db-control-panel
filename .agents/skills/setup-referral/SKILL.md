---
name: setup-referral
description: Configure the referral program's reward settings during initial project setup. Use when following SETUP.md and the user wants referrals enabled; requires Stripe to be set up first.
---

# Set up the referral program

Referrals pay out as Stripe customer balance credits, so finish
`setup-stripe` first. Settings live in the `referral_config` table and can
also be changed later in the admin UI at `/adminx/referrals`.

## 1. Prerequisites

- `DATABASE_URL` is set and the schema is pushed (`bun run db:push`).
- Plan tiers exist: `bun run db:seed:billing`.

## 2. Choose settings

Ask the user for:

| Setting | Default |
| --- | --- |
| Enabled | `false` |
| Referrer credit (cents) | `1000` |
| Referee credit (cents) | `500` |
| Currency | `usd` |
| Minimum plan tier to get a code | `tier1` |

## 3. Save them

Either the user runs the interactive wizard in their terminal (in Claude
Code: `! bun .agents/skills/setup-referral/scripts/setup-referral.ts`), or
they sign in as a site admin and set the values at `/adminx/referrals` →
**Settings**. Both write the same row.

## 4. Verify

Open `/adminx/referrals` and confirm the settings show the chosen values.
