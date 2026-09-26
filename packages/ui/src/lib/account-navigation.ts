import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  HomeIcon,
  KeyRound,
  LifeBuoy,
  MessageSquare,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

export type AccountNavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
};

export type AccountNavSection = {
  title: string;
  id?: string;
  icon?: LucideIcon;
  items: AccountNavItem[];
  children?: AccountNavItem[];
};

export type AccountNavConfig = {
  main: AccountNavSection[];
};

/**
 * Account-scoped navigation. All hrefs are absolute and live under /account.
 */
export const accountNav: AccountNavConfig = {
  main: [
    {
      title: "",
      items: [
        { label: "Overview", icon: HomeIcon, href: "/account" },
        { label: "Billing", icon: CreditCard, href: "/account/billing" },
      ],
    },
    {
      id: "support",
      title: "Support",
      icon: LifeBuoy,
      items: [],
      children: [
        {
          label: "Cases",
          icon: MessageSquare,
          href: "/account/support/cases",
        },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      items: [],
      children: [
        {
          label: "General",
          icon: SlidersHorizontal,
          href: "/account/settings",
        },
        {
          label: "Authentication",
          icon: ShieldCheck,
          href: "/account/settings/authentication",
        },
        {
          label: "Operators",
          icon: KeyRound,
          href: "/account/settings/operators",
        },
      ],
    },
  ],
};
