"use client";

import { ReferralCodesTable } from "@/components/admin/referrals/ReferralCodesTable";
import { ReferralGrantsTable } from "@/components/admin/referrals/ReferralGrantsTable";
import { ReferralSettingsForm } from "@/components/admin/referrals/ReferralSettingsForm";
import { ReferralsTable } from "@/components/admin/referrals/ReferralsTable";
import { useState } from "react";

type Tab = "codes" | "referrals" | "grants" | "settings";

interface Metrics {
  totalCodes: number;
  activeCodes: number;
  totalReferrals: number;
  convertedReferrals: number;
  totalCreditsAppliedCents: number;
  pendingGrants: number;
}

interface ReferralConfig {
  id: string;
  enabled: boolean;
  referrerCreditAmount: number;
  refereeCreditAmount: number;
  currency: string;
  minPlanTier: string | null;
  autoApply: boolean;
  approvalWindowDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  initialMetrics: Metrics;
  initialConfig: ReferralConfig;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "codes", label: "Codes" },
  { id: "referrals", label: "Referrals" },
  { id: "grants", label: "Grants" },
  { id: "settings", label: "Settings" },
];

function MetricCard({
  label,
  value,
}: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function ReferralAdminPage({ initialMetrics, initialConfig }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("codes");

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Total Codes" value={initialMetrics.totalCodes} />
        <MetricCard label="Active Codes" value={initialMetrics.activeCodes} />
        <MetricCard
          label="Total Referrals"
          value={initialMetrics.totalReferrals}
        />
        <MetricCard
          label="Converted"
          value={initialMetrics.convertedReferrals}
        />
      </div>

      {/* Tab nav */}
      <div className="border-b">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "codes" && <ReferralCodesTable />}
      {activeTab === "referrals" && <ReferralsTable />}
      {activeTab === "grants" && <ReferralGrantsTable />}
      {activeTab === "settings" && (
        <ReferralSettingsForm initialConfig={initialConfig} />
      )}
    </div>
  );
}
