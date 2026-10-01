"use client";

import { Loader2 } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { errorMessage } from "./api";

interface ActionButtonProps
  extends Omit<ComponentProps<typeof Button>, "onClick"> {
  onAction: () => Promise<void>;
}

/** Runs an async action, shows a spinner meanwhile and toasts a failure. */
export function ActionButton({
  onAction,
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      await onAction();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button {...props} onClick={run} disabled={disabled || pending}>
      {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
      {children}
    </Button>
  );
}
