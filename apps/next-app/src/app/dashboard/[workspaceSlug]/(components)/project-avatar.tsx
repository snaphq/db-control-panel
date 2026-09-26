import { cn } from "@repo/ui/lib/utils";

function hashToHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

interface ProjectAvatarProps {
  id: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
}

export function ProjectAvatar({
  id,
  name,
  size = "md",
  className,
}: ProjectAvatarProps) {
  const hue = hashToHue(id);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeClasses = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-semibold text-white",
        sizeClasses,
        className,
      )}
      style={{
        backgroundColor: `hsl(${hue} 65% 45%)`,
      }}
    >
      {initial}
    </div>
  );
}
