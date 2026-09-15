import { createOpenAI } from "@ai-sdk/openai";
import { fetchSafeProvider, validateProviderBaseUrl } from "./provider-egress";

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY environment variable is not set");
  if (!process.env.AI_DEFAULT_MODEL)
    throw new Error("AI_DEFAULT_MODEL environment variable is not set");

  const baseURL = process.env.OPENAI_BASE_URL;
  if (!baseURL) {
    throw new Error("OPENAI_BASE_URL environment variable is not set");
  }
  validateProviderBaseUrl(baseURL);

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL,
    fetch: fetchSafeProvider,
  });
}

export function getDefaultModel() {
  return getOpenAI().chat(process.env.AI_DEFAULT_MODEL ?? "");
}

// Lazy proxy so the module can be imported without env vars present at load time
export const openai = new Proxy({} as ReturnType<typeof createOpenAI>, {
  get(_t, prop) {
    return (getOpenAI() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const defaultModel = new Proxy(
  {} as ReturnType<ReturnType<typeof createOpenAI>["chat"]>,
  {
    get(_t, prop) {
      return (getDefaultModel() as unknown as Record<string | symbol, unknown>)[
        prop
      ];
    },
  },
);
