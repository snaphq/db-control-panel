"use client";

import type { PricingTier } from "@repo/billing/stripe/queries";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { CreateWorkspaceSheet } from "./CreateWorkspaceSheet";

interface Ctx {
  open: () => void;
  close: () => void;
}

const CreateWorkspaceCtx = createContext<Ctx | null>(null);

interface ProviderProps {
  children: ReactNode;
  pricingTiers: PricingTier[];
  canCreateFree: boolean;
  canUseTrial?: boolean;
  defaultOpen?: boolean;
}

export function CreateWorkspaceProvider({
  children,
  pricingTiers,
  canCreateFree,
  canUseTrial = true,
  defaultOpen = false,
}: ProviderProps) {
  const [open, setOpen] = useState(defaultOpen);

  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("createWorkspace") === "1") {
      setOpen(true);
    }
  }, []);

  return (
    <CreateWorkspaceCtx.Provider value={{ open: openSheet, close: closeSheet }}>
      {children}
      <CreateWorkspaceSheet
        open={open}
        onOpenChange={setOpen}
        pricingTiers={pricingTiers}
        canCreateFree={canCreateFree}
        canUseTrial={canUseTrial}
      />
    </CreateWorkspaceCtx.Provider>
  );
}

export function useCreateWorkspace(): Ctx {
  const ctx = useContext(CreateWorkspaceCtx);
  if (!ctx) {
    return {
      open: () => {
        if (typeof window !== "undefined") {
          window.location.href = "/workspace/new";
        }
      },
      close: () => {},
    };
  }
  return ctx;
}
