"use client";
import { useSession } from "@repo/auth/client";
import { Button } from "@repo/react-ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BorderBeam } from "../magicui/border-beam";
import { AnimatedGradientTextComponent } from "./AnimatedGradientComponent";
export default function HeroSection() {
  const { data: session } = useSession();
  const isSignedIn = Boolean(session?.user);
  const ctaHref = isSignedIn ? "/dashboard" : "/auth/sign-in";
  const ctaLabel = isSignedIn ? "Dashboard" : "Get Started";

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="my-5">
        <AnimatedGradientTextComponent />
      </div>
      <h1 className="scroll-m-20 text-4xl sm:text-4xl md:text-6xl font-semibold tracking-tight lg:text-6xl text-center max-w-[1000px]">
        Nextjs Starter Kit
      </h1>
      <p className="mx-auto max-w-[700px] text-gray-500 md:text-lg text-center mt-2 dark:text-gray-400">
        Build a SAAS with a solid foundation.
      </p>
      <div className="flex gap-3">
        <Link href={ctaHref} className="mt-5">
          <Button className="animate-buttonheartbeat rounded-md bg-blue-600 hover:bg-blue-300 text-sm font-semibold text-white">
            {ctaLabel}
          </Button>
        </Link>
        <Link href="#" target="_blank" className="mt-5">
          <Button
            variant="outline"
            className="flex gap-1 text-blue-600 hover:text-blue-600 hover:bg-blue-100"
          >
            Join Discord
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
      <div>
        <div className="relative flex max-w-6xl justify-center overflow-hidden mt-7">
          <div className="relative rounded-xl">
            <img
              src="/dash-light.jpg"
              alt="Dashboard preview"
              className="block w-[1200px] rounded-[inherit] border object-contain shadow-lg dark:hidden"
            />
            <img
              src="/dash.jpg"
              alt="Dashboard preview"
              className="dark:block w-[1200px] rounded-[inherit] border object-contain shadow-lg hidden"
            />
            <BorderBeam size={250} duration={12} delay={9} />
          </div>
        </div>
      </div>
    </div>
  );
}
