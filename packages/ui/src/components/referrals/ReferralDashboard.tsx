"use client";

import type { ReferralStats } from "@repo/billing";
import { Copy, Gift, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

interface ReferralDashboardProps {
  stats: ReferralStats;
  eligible: boolean;
  userId: string;
}

interface ReferralCodeResponse {
  code: string;
  shareUrl: string;
  isActive: boolean;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DashboardContent({
  stats,
  shareUrl,
  loadingCode,
}: {
  stats: ReferralStats;
  shareUrl: string | null;
  loadingCode: boolean;
}) {
  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Share link card */}
      <div className="rounded-lg border bg-card p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-green-500" />
          <h3 className="font-semibold text-base">Your referral link</h3>
        </div>
        {loadingCode ? (
          <div className="h-9 bg-muted animate-pulse rounded-md" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate">
              {shareUrl ?? "Generating your link…"}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!shareUrl}
              className="shrink-0"
            >
              <Copy size={14} className="mr-1.5" />
              Copy
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Share this link with friends. When they upgrade to a paid plan, you
          both earn credits.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total referrals" value={stats.totalReferrals} />
        <StatCard label="Trial" value={stats.trialCount} />
        <StatCard label="Refund period" value={stats.refundPeriodCount} />
        <StatCard label="Converted" value={stats.convertedCount} />
        <StatCard label="Cancelled" value={stats.cancelledCount} />
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-1 border-green-500/40 bg-green-50/50 dark:bg-green-950/20">
          <p className="text-sm text-muted-foreground">Credits earned</p>
          <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
            ${(stats.totalCreditsEarnedCents / 100).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ReferralDashboard({ stats, eligible }: ReferralDashboardProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    setLoadingCode(true);
    fetch("/api/referral/code")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch referral code");
        return res.json() as Promise<ReferralCodeResponse>;
      })
      .then((data) => {
        setShareUrl(data.shareUrl);
      })
      .catch(() => {
        toast.error("Could not load your referral link.");
      })
      .finally(() => {
        setLoadingCode(false);
      });
  }, [eligible]);

  if (!eligible) {
    return (
      <div className="relative">
        {/* Blurred background content */}
        <div className="blur-sm pointer-events-none opacity-60">
          <DashboardContent
            stats={stats}
            shareUrl="https://example.com/r/XXXXXXXX"
            loadingCode={false}
          />
        </div>

        {/* Upgrade overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border bg-card shadow-lg p-8 flex flex-col items-center gap-4 max-w-sm w-full text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Users size={24} className="text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                Upgrade to access referrals
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Referral links are available on paid plans. Upgrade to start
                earning credits.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="../../settings/billing">View plans</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent
      stats={stats}
      shareUrl={shareUrl}
      loadingCode={loadingCode}
    />
  );
}
