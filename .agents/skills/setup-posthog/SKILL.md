---
name: setup-posthog
description: Configure PostHog analytics and lifecycle email workflows during initial project setup. Use when following SETUP.md and the user wants PostHog; skip it if they don't.
---

# Set up PostHog

Analytics calls are no-ops until PostHog keys are set. This skill connects a
PostHog project and creates the event actions and email workflows the app
expects.

## 1. Collect keys

Ask the user for:

- `NEXT_PUBLIC_POSTHOG_KEY` — project API key (`phc_…`)
- `NEXT_PUBLIC_POSTHOG_HOST` — for example `https://us.i.posthog.com`
- `POSTHOG_PERSONAL_API_KEY` — personal API key with project write access
  (used only by the wizard and test scripts)

```bash
bun .agents/skills/setup/scripts/configure-env.ts --section PostHog \
  --set NEXT_PUBLIC_POSTHOG_KEY=phc_... \
  --set NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com \
  --set POSTHOG_PERSONAL_API_KEY=phx_...
```

## 2. Run the wizard

`scripts/setup-posthog.ts` is interactive, so the user runs it in their own
terminal. In Claude Code they can type:

```
! bun .agents/skills/setup-posthog/scripts/setup-posthog.ts
```

It verifies the credentials, writes app settings (`NEXT_PUBLIC_APP_NAME`,
`SUPPORT_EMAIL`, …) to `.env.local`, creates event actions, sets up email
workflows from `scripts/posthog-workflows.ts`, and sends a test event. It
also writes a summary under `config/posthog/`; review it before committing.

## 3. Verify

```bash
bun run posthog:test-event
bun run posthog:test-workflow
```

Both stay available after setup.
