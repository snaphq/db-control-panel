"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useActionState } from "react";
import { type LoginState, loginAction } from "./actions";

const initialState: LoginState = { step: "email" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.step === "code" ? state.email : undefined}
          readOnly={state.step === "code"}
        />
      </div>
      {state.step === "code" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Sign-in code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
          <p className="text-sm text-muted-foreground">
            If this email is an admin, a 6-digit code is on its way.
          </p>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {state.step === "code" ? "Sign in" : "Email me a code"}
      </Button>
    </form>
  );
}
