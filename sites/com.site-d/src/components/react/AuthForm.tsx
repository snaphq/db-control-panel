import { useState } from "react";

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

/**
 * Client island for the dashboard sign-in and sign-up forms. Posts JSON to
 * Better Auth's email endpoints (mounted at /api/auth) and reloads on
 * success so the server-rendered dashboard picks up the session cookie.
 */
export default function AuthForm({ mode }: AuthFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const endpoint =
      mode === "sign-in"
        ? "/api/auth/sign-in/email"
        : "/api/auth/sign-up/email";
    const body =
      mode === "sign-in" ? { email, password } : { name, email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Something went wrong. Try again.");
        setPending(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {mode === "sign-up" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            autoComplete="name"
            className="rounded-lg border border-zinc-300 px-3 py-2"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          autoComplete="email"
          className="rounded-lg border border-zinc-300 px-3 py-2"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Password</span>
        <input
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          className="rounded-lg border border-zinc-300 px-3 py-2"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Working…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>
    </form>
  );
}
