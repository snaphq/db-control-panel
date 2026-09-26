export const EXPIRATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

export const DEFAULT_EXPIRATION = "30d";

export const SELECT_CLASS_NAME =
  "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ExpirationOptions() {
  return EXPIRATIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>
      {opt.label}
    </option>
  ));
}
