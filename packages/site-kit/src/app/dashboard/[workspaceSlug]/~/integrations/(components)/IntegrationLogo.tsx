import { cn } from "@repo/react-ui/lib/utils";

function hashToHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

interface IntegrationLogoProps {
  id: string;
  name: string;
  iconUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}

export function IntegrationLogo({
  id,
  name,
  iconUrl,
  size = "md",
  className,
}: IntegrationLogoProps) {
  const sizeClasses = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className={cn(
          "shrink-0 rounded-full bg-muted object-cover",
          sizeClasses,
          className,
        )}
      />
    );
  }
  const hue = hashToHue(id);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses,
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}
    >
      {initial}
    </div>
  );
}
