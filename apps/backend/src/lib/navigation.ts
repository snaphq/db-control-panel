import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Building2,
  CreditCard,
  DollarSign,
  Filter,
  FolderKanban,
  Gift,
  Layers,
  LayoutDashboard,
  LineChart,
  Package,
  Plug,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Ticket,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
};

export type AdminNavSection = {
  title: string;
  id?: string;
  icon?: LucideIcon;
  items: AdminNavItem[];
  children?: AdminNavItem[];
};

export type AdminNavConfig = {
  main: AdminNavSection[];
  bottom: AdminNavItem[];
};

export const adminNav: AdminNavConfig = {
  main: [
    {
      title: "",
      items: [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          href: "/dashboard",
        },
        { label: "Users", icon: Users, href: "/users" },
        { label: "Tenants", icon: Building2, href: "/tenants" },
        {
          label: "Organizations",
          icon: Building2,
          href: "/organizations",
        },
        { label: "Projects", icon: FolderKanban, href: "/projects" },
        { label: "Agents", icon: Bot, href: "/agents" },
        {
          label: "Agent Auth",
          icon: ShieldCheck,
          href: "/agent-auth",
        },
      ],
    },
    {
      id: "billing",
      title: "Billing",
      icon: Wallet,
      items: [],
      children: [
        { label: "Payments", icon: CreditCard, href: "/payments" },
        { label: "Products", icon: Package, href: "/stripe/products" },
        { label: "Prices", icon: DollarSign, href: "/stripe/prices" },
        { label: "Coupons", icon: Ticket, href: "/stripe/coupons" },
        { label: "Promo Codes", icon: Tag, href: "/stripe/promo-codes" },
        { label: "Plan Tiers", icon: Tag, href: "/billing/plan-tiers" },
        {
          label: "Plan Features",
          icon: Layers,
          href: "/billing/plan-features",
        },
        {
          label: "Org Overrides",
          icon: Shield,
          href: "/billing/org-features",
        },
        { label: "Pricing Page", icon: Package, href: "/pricing" },
        { label: "Referrals", icon: Gift, href: "/referrals" },
      ],
    },
    {
      id: "platform",
      title: "Platform",
      icon: Wrench,
      items: [],
      children: [
        { label: "Members", icon: UserCog, href: "/members" },
        { label: "Sessions", icon: Activity, href: "/sessions" },
        { label: "Traffic", icon: LineChart, href: "/analytics" },
        {
          label: "Funnels",
          icon: Filter,
          href: "/analytics/funnels",
        },
        { label: "Integrations", icon: Plug, href: "/integrations" },
        {
          label: "AI Provider",
          icon: Sparkles,
          href: "/ai-provider",
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
          href: "/settings",
        },
        {
          label: "App Settings",
          icon: Sliders,
          href: "/billing/settings",
        },
      ],
    },
  ],
  bottom: [],
};
