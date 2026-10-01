import { createBranchRequestSchema } from "@repo/control-plane-contract";
import {
  checkPointInTime,
  localInputToUtc,
  toLocalInputValue,
} from "@repo/react-ui/components/databases/point-in-time";
import { describe, expect, it } from "vitest";

// Built from local-time components, so the expectations hold in any time zone.
const local = (...args: [number, number, number, number, number]) =>
  new Date(...args);

describe("localInputToUtc", () => {
  it("reads a datetime-local value as the browser's local time and returns UTC", () => {
    const noon = local(2026, 2, 1, 12, 30);
    expect(localInputToUtc("2026-03-01T12:30")).toBe(noon.toISOString());
    expect(localInputToUtc("2026-03-01T12:30:15")).toBe(
      new Date(2026, 2, 1, 12, 30, 15).toISOString(),
    );
  });

  it("returns an instant the control plane accepts", () => {
    const utc = localInputToUtc("2026-03-01T12:30");
    expect(
      createBranchRequestSchema.safeParse({
        name: "b",
        parent_timestamp: utc,
      }).success,
    ).toBe(true);
  });

  it("returns null for empty, partial or impossible values", () => {
    for (const value of [
      "",
      "2026-03-01",
      "2026-03-01 12:30",
      "2026-03-01T12:30Z",
      "2026-13-01T12:30",
      "2026-02-31T12:30",
      "2026-03-01T24:00",
      "tomorrow",
    ]) {
      expect(localInputToUtc(value), value).toBeNull();
    }
  });
});

describe("toLocalInputValue", () => {
  it("round-trips through localInputToUtc to the same minute", () => {
    const at = local(2026, 2, 1, 7, 5);
    const value = toLocalInputValue(at);
    expect(value).toBe("2026-03-01T07:05");
    expect(localInputToUtc(value)).toBe(at.toISOString());
  });
});

describe("checkPointInTime", () => {
  const now = local(2026, 2, 1, 12, 0);
  const day = 86_400;

  it("accepts a time inside the history window and returns its UTC instant", () => {
    const result = checkPointInTime("2026-03-01T09:15", day, now);
    expect(result).toEqual({
      ok: true,
      utc: local(2026, 2, 1, 9, 15).toISOString(),
    });
  });

  it("says nothing before anything is entered", () => {
    expect(checkPointInTime("", day, now)).toEqual({ ok: false, reason: null });
  });

  it("refuses a time that has not happened yet", () => {
    const result = checkPointInTime("2026-03-01T12:30", day, now);
    expect(result).toEqual({
      ok: false,
      reason: "That time has not happened yet.",
    });
  });

  it("refuses a time older than the project's history retention", () => {
    const result = checkPointInTime("2026-02-27T12:00", day, now);
    expect(result).toEqual({
      ok: false,
      reason: "History is kept for 1 day; pick a more recent time.",
    });
    expect(checkPointInTime("2026-03-01T10:30", 3600, now)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("1 hour"),
    });
    expect(checkPointInTime("2026-03-01T09:00", 7 * day, now).ok).toBe(true);
  });

  it("refuses text that is not a time", () => {
    expect(checkPointInTime("soon", day, now)).toEqual({
      ok: false,
      reason: "Enter a valid date and time.",
    });
  });
});
