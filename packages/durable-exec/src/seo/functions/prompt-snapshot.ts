/**
 * Weekly AIEO prompt-snapshot cron.
 * Cron: Mondays 05:00 UTC (`0 5 * * 1`)
 */

import {
  getPromptById,
  hasPromptSnapshotOnDate,
  insertPromptSnapshot,
  listEngines,
  listPrompts,
  listTopCompetitorDomains,
} from "@repo/database/dal/seo";
import { inngest } from "../../client";
import {
  BudgetExceededError,
  assertWithinBudget,
  loadBudgetState,
  recordSpend,
} from "../aieo/budget";
import {
  getEngineAdapter,
  listRegisteredEngineIds,
} from "../aieo/engines/registry";
import { type AieoSecretKey, getSecret } from "../aieo/secrets/store";
import { classifySentiment } from "../aieo/sentiment";
import { getSetting } from "../aieo/settings/store";

interface SnapshotRunResult {
  attempted: number;
  inserted: number;
  skipped: number;
  failed: number;
  totalCostCents: number;
  budgetCapCents: number;
  budgetAborted: boolean;
  errors: Array<{ promptId: string; engineId: string; error: string }>;
}

const ENGINE_TO_SECRET: Record<string, AieoSecretKey | null> = {
  perplexity: "PERPLEXITY_API_KEY",
  google_aio: "DATAFORSEO_AUTH",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};

export const seoPromptSnapshotFunction = inngest.createFunction(
  {
    id: "seo-prompt-snapshot",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 5 * * 1" }, { event: "cron/seo-prompt-snapshot" }],
  },
  async ({ event, step }) => {
    const eventData = (event?.data ?? {}) as {
      triggeredBy?: "scheduled" | "manual";
      promptId?: string;
      engineId?: string;
    };
    const triggeredBy = eventData.triggeredBy ?? "scheduled";
    console.log(`[seo-prompt-snapshot] start (trigger=${triggeredBy})`);

    const { prompts, engines, targetDomain, competitors } = await step.run(
      "load-context",
      async () => {
        const allPrompts = eventData.promptId
          ? await getPromptById(eventData.promptId).then((p) => (p ? [p] : []))
          : await listPrompts({ activeOnly: true });

        const registeredIds = new Set(listRegisteredEngineIds());
        const allEngines = (await listEngines({ activeOnly: true }))
          .filter((e) =>
            eventData.engineId ? e.id === eventData.engineId : true,
          )
          .filter((e) => registeredIds.has(e.id));

        const target =
          (await getSetting<string>("targetDomain")) || "example.com";
        const topCompetitors = await listTopCompetitorDomains(20);
        return {
          prompts: allPrompts,
          engines: allEngines,
          targetDomain: target,
          competitors: topCompetitors,
        };
      },
    );

    if (prompts.length === 0 || engines.length === 0) {
      console.log(
        `[seo-prompt-snapshot] nothing to do prompts=${prompts.length} engines=${engines.length}`,
      );
      return { triggeredBy, processed: 0 };
    }

    const budget = await step.run("load-budget", () => loadBudgetState());

    const result: SnapshotRunResult = {
      attempted: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      totalCostCents: 0,
      budgetCapCents: budget.capCents,
      budgetAborted: false,
      errors: [],
    };

    const today = Math.floor(Date.now() / 1000);

    outer: for (const p of prompts) {
      for (const e of engines) {
        result.attempted++;
        const stepId = `snapshot-${p.id}-${e.id}`;

        const outcome = await step.run(stepId, async () => {
          const already = await hasPromptSnapshotOnDate(p.id, e.id, today);
          if (already) return { kind: "skipped" as const };

          try {
            assertWithinBudget(budget, e.defaultCostCents);
          } catch (be) {
            if (be instanceof BudgetExceededError) {
              return {
                kind: "budget" as const,
                spent: be.spentCents,
                cap: be.capCents,
              };
            }
            throw be;
          }

          const secretKey = ENGINE_TO_SECRET[e.id];
          if (!secretKey) {
            return {
              kind: "failed" as const,
              error: `No secret mapping for engine ${e.id}`,
              promptId: p.id,
              engineId: e.id,
            };
          }
          const apiKey = await getSecret(secretKey);
          if (!apiKey) {
            return {
              kind: "failed" as const,
              error: `Missing ${secretKey} — set it in the backend admin at /seo/aieo/secrets`,
              promptId: p.id,
              engineId: e.id,
            };
          }

          try {
            const adapter = getEngineAdapter(e.id);
            const queryResult = await adapter.query({
              prompt: p.prompt,
              targetDomain,
              competitors,
              modelId: e.modelId ?? undefined,
              apiKey,
            });

            const sentiment = await classifySentiment(
              queryResult.rawAnswer,
              targetDomain,
            );

            await insertPromptSnapshot({
              promptId: p.id,
              engineId: e.id,
              brandMentioned: queryResult.brandMentioned,
              mentionRank: queryResult.mentionRank,
              sentiment,
              competitorsMentioned: queryResult.competitorsMentioned,
              citations: queryResult.citations,
              ourCitationUrl: queryResult.ourCitationUrl,
              rawAnswer: queryResult.rawAnswer,
              tokensIn: queryResult.tokensIn,
              tokensOut: queryResult.tokensOut,
              costCents: queryResult.costCents,
              source: "cron",
            });

            return {
              kind: "inserted" as const,
              costCents: queryResult.costCents,
            };
          } catch (err) {
            return {
              kind: "failed" as const,
              error: err instanceof Error ? err.message : String(err),
              promptId: p.id,
              engineId: e.id,
            };
          }
        });

        if (outcome.kind === "inserted") {
          result.inserted++;
          result.totalCostCents += outcome.costCents;
          recordSpend(budget, outcome.costCents);
        } else if (outcome.kind === "skipped") {
          result.skipped++;
        } else if (outcome.kind === "budget") {
          result.budgetAborted = true;
          await step.sendEvent("emit-budget-exceeded", {
            name: "cron/seo-aieo-budget-exceeded",
            data: {
              capCents: outcome.cap,
              spentCents: outcome.spent,
              attempted: result.attempted,
            },
          });
          break outer;
        } else {
          result.failed++;
          result.errors.push({
            promptId: outcome.promptId,
            engineId: outcome.engineId,
            error: outcome.error,
          });
        }
      }
    }

    console.log(
      `[seo-prompt-snapshot] done attempted=${result.attempted} inserted=${result.inserted} ` +
        `skipped=${result.skipped} failed=${result.failed} ` +
        `spend=$${(result.totalCostCents / 100).toFixed(2)} ` +
        `budget=$${(result.budgetCapCents / 100).toFixed(2)} aborted=${result.budgetAborted}`,
    );
    return { triggeredBy, ...result };
  },
);
