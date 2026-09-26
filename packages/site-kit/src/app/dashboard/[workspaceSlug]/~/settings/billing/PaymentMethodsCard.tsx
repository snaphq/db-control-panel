"use client";

import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import { CreditCard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PaymentMethodsCardProps {
  workspaceSlug: string;
  organizationId: string;
  canManageBilling: boolean;
}

type PaymentCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export function PaymentMethodsCard({
  workspaceSlug,
  organizationId,
  canManageBilling,
}: PaymentMethodsCardProps) {
  const [cards, setCards] = useState<PaymentCard[] | null>(null);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/organizations/${workspaceSlug}/payment-methods`,
        );
        const data = await res.json();
        if (!cancelled && res.ok) setCards(data.cards ?? []);
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setCardsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  async function openPortal(): Promise<void> {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to open portal");
      window.location.href = data.portalUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open portal");
      setPortalLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
        <CardDescription>
          Payments for domains, add-ons, and other usage are made using the
          default card.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {cardsLoading ? (
          <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading payment methods…
          </div>
        ) : cards && cards.length > 0 ? (
          <ul className="divide-y">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm capitalize">
                    {card.brand} •••• {card.last4}
                  </span>
                  {card.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  Valid until {card.expMonth}/{card.expYear}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-4 text-sm text-muted-foreground">
            No payment methods on file.
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between border-t bg-muted/30 py-3">
        <p className="text-sm text-muted-foreground">
          At most, three credit cards can be added.
        </p>
        <Button
          size="sm"
          disabled={
            !canManageBilling ||
            portalLoading ||
            (cards !== null && cards.length >= 3)
          }
          onClick={openPortal}
        >
          {portalLoading && (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          )}
          {cards && cards.length > 0 ? "Manage Cards" : "Add Card"}
        </Button>
      </CardFooter>
    </Card>
  );
}
