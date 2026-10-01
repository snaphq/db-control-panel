import AnimatedGradientText from "@/components/magicui/animated-gradient-text";
import { cn } from "@repo/react-ui/lib/utils";
import { ChevronRight } from "lucide-react";

export function AnimatedGradientTextComponent() {
  return (
    <div className="z-10 flex items-center justify-center">
      <AnimatedGradientText>
        🎉 <hr className="mx-2 h-4 w-px shrink-0 bg-gray-300" />{" "}
        <span
          className={cn(
            "inline animate-gradient bg-linear-to-r from-[#ffaa40] via-[#9c40ff] to-[#ffaa40] [background-size:var(--bg-size)_100%] bg-clip-text text-transparent",
          )}
        >
          Introducing AlloyDB
        </span>
        <ChevronRight className="ml-1 size-3 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
      </AnimatedGradientText>
    </div>
  );
}
