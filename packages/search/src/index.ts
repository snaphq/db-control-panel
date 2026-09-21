export const DEFAULT_MAX_QUERY_LENGTH = 256;
export const DEFAULT_MAX_QUERY_TOKENS = 32;

export type SearchQualifierKey =
  | "archived"
  | "description"
  | "email"
  | "name"
  | "slug"
  | "status"
  | "type";

export type SearchWarningCode =
  | "empty_qualifier"
  | "query_too_long"
  | "too_many_tokens"
  | "unsupported_value"
  | "unknown_qualifier"
  | "unterminated_quote";

export interface SearchWarning {
  code: SearchWarningCode;
  message: string;
  token?: string;
}

export interface SearchTerm {
  negated: boolean;
  value: string;
}

export interface SearchQualifier {
  key: SearchQualifierKey;
  negated: boolean;
  value: string;
}

export interface SearchQuery {
  qualifiers: SearchQualifier[];
  raw: string;
  terms: SearchTerm[];
  warnings: SearchWarning[];
}

interface Token {
  text: string;
}

const QUALIFIER_ALIASES: Record<string, SearchQualifierKey> = {
  archived: "archived",
  description: "description",
  desc: "description",
  email: "email",
  mail: "email",
  name: "name",
  slug: "slug",
  state: "status",
  status: "status",
  type: "type",
};

function tokenize(input: string): { tokens: Token[]; unterminated: boolean } {
  const tokens: Token[] = [];
  let current = "";
  let hasContent = false;
  let escaped = false;
  let inQuote = false;

  const flush = () => {
    if (!hasContent) return;
    tokens.push({ text: current });
    current = "";
    hasContent = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (escaped) {
      current += character;
      hasContent = true;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      hasContent = true;
      escaped = true;
      continue;
    }

    if (character === '"') {
      hasContent = true;
      inQuote = !inQuote;
      continue;
    }

    if (!inQuote && /\s/.test(character)) {
      flush();
      continue;
    }

    hasContent = true;
    current += character;
  }

  if (escaped) current += "\\";
  flush();
  return { tokens, unterminated: inQuote };
}

function warning(
  code: SearchWarningCode,
  message: string,
  token?: string,
): SearchWarning {
  return token ? { code, message, token } : { code, message };
}

/**
 * Parse a small, deterministic search language without touching the database.
 *
 * Bare terms are ANDed by executors. A leading '-' negates a term or
 * qualifier. Supported qualifiers are name:, slug:, description:/desc:,
 * email:/mail:, status:/state:, archived:, and type:. Values may be quoted and
 * escaped with a backslash. Individual executors decide which qualifiers are
 * meaningful for their entity and return warnings for the rest.
 */
export function parseSearchQuery(
  input: string,
  options?: {
    maxLength?: number;
    maxTokens?: number;
  },
): SearchQuery {
  const raw = input ?? "";
  const maxLength = options?.maxLength ?? DEFAULT_MAX_QUERY_LENGTH;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_QUERY_TOKENS;
  const warnings: SearchWarning[] = [];
  const bounded = raw.slice(0, maxLength);

  if (raw.length > maxLength) {
    warnings.push(
      warning(
        "query_too_long",
        `Search queries are limited to ${maxLength} characters.`,
      ),
    );
  }

  const tokenized = tokenize(bounded);
  if (tokenized.unterminated) {
    warnings.push(
      warning(
        "unterminated_quote",
        "A closing quote was missing; the remaining text was treated as a phrase.",
      ),
    );
  }

  const tokens = tokenized.tokens.slice(0, maxTokens);
  if (tokenized.tokens.length > maxTokens) {
    warnings.push(
      warning(
        "too_many_tokens",
        `Search queries are limited to ${maxTokens} terms.`,
      ),
    );
  }

  const terms: SearchTerm[] = [];
  const qualifiers: SearchQualifier[] = [];

  for (const token of tokens) {
    let value = token.text;
    let negated = false;
    if (value.startsWith("-") && value.length > 1) {
      negated = true;
      value = value.slice(1);
    }

    const colon = value.indexOf(":");
    if (colon <= 0) {
      if (value) terms.push({ negated, value });
      continue;
    }

    const alias = value.slice(0, colon).toLowerCase();
    const qualifierKey = QUALIFIER_ALIASES[alias];
    const qualifierValue = value.slice(colon + 1).trim();

    if (!qualifierKey) {
      warnings.push(
        warning(
          "unknown_qualifier",
          `Unknown search qualifier \"${alias}:\"; searched as text.`,
          token.text,
        ),
      );
      terms.push({ negated, value });
      continue;
    }

    if (!qualifierValue) {
      warnings.push(
        warning(
          "empty_qualifier",
          `The ${alias}: qualifier needs a value.`,
          token.text,
        ),
      );
      continue;
    }

    qualifiers.push({ key: qualifierKey, negated, value: qualifierValue });
  }

  return { raw, terms, qualifiers, warnings };
}
