import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./index";

describe("parseSearchQuery", () => {
  it("parses bare terms and repeated qualifiers", () => {
    expect(parseSearchQuery('alpha name:"Project One" -slug:legacy')).toEqual({
      raw: 'alpha name:"Project One" -slug:legacy',
      terms: [{ negated: false, value: "alpha" }],
      qualifiers: [
        { key: "name", negated: false, value: "Project One" },
        { key: "slug", negated: true, value: "legacy" },
      ],
      warnings: [],
    });
  });

  it("supports escaped quotes and qualifier aliases", () => {
    const parsed = parseSearchQuery('desc:"say \\"hello\\"" desc:docs');
    expect(parsed.qualifiers).toEqual([
      { key: "description", negated: false, value: 'say "hello"' },
      { key: "description", negated: false, value: "docs" },
    ]);
  });

  it("returns actionable warnings for invalid input", () => {
    const parsed = parseSearchQuery('name: -unknown:value "open', {
      maxTokens: 2,
    });
    expect(parsed.warnings.map((item) => item.code)).toEqual([
      "unterminated_quote",
      "too_many_tokens",
      "empty_qualifier",
      "unknown_qualifier",
    ]);
    expect(parsed.qualifiers).toEqual([]);

    expect(parseSearchQuery("a".repeat(10), { maxLength: 8 }).warnings).toEqual(
      [
        {
          code: "query_too_long",
          message: "Search queries are limited to 8 characters.",
        },
      ],
    );
  });

  it("keeps unknown qualifiers searchable instead of dropping text", () => {
    const parsed = parseSearchQuery("owner:ashutosh");
    expect(parsed.terms).toEqual([{ negated: false, value: "owner:ashutosh" }]);
    expect(parsed.warnings[0]?.code).toBe("unknown_qualifier");
  });
});
