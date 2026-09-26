"use client";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import PageWrapper from "@site/components/Container/PageWrapper";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function OnboardingForm() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Auto-generate slug from workspace name if user hasn't manually edited it
  useEffect(() => {
    if (!slugTouched && workspaceName) {
      setSlug(generateSlug(workspaceName));
    }
  }, [workspaceName, slugTouched]);

  // Check slug availability
  const checkSlugAvailability = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck || slugToCheck.length < 2) {
      setSlugError(null);
      return;
    }

    setIsCheckingSlug(true);
    try {
      const response = await fetch(
        `/api/auth/organization/check-slug?slug=${encodeURIComponent(slugToCheck)}`,
      );
      const result = await response.json();

      if (!result.available) {
        setSlugError(
          result.suggestion
            ? `Slug already taken. Try "${result.suggestion}"`
            : "Slug already taken",
        );
      } else {
        setSlugError(null);
      }
    } catch {
      // Silently fail - we'll catch duplicates on submit
      setSlugError(null);
    } finally {
      setIsCheckingSlug(false);
    }
  }, []);

  // Debounce slug check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (slug) {
        checkSlugAvailability(slug);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, checkSlugAvailability]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setSlug(generateSlug(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (slugError) {
      toast.error("Please fix the slug error before submitting.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: workspaceName,
          slug: slug || generateSlug(workspaceName),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        toast.error(
          result.error || "Failed to create workspace. Please try again.",
        );
        return;
      }

      toast.success("Workspace created successfully!");
      router.push("/dashboard");
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create workspace. Please try again.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="flex w-full justify-center my-20">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Create Your Workspace</CardTitle>
            <CardDescription>
              Set up your workspace to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace Name</Label>
                <Input
                  id="workspaceName"
                  type="text"
                  placeholder="My Workspace"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  required
                  minLength={2}
                />
                <p className="text-xs text-muted-foreground">
                  Choose a name for your workspace
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Workspace URL</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/</span>
                  <Input
                    id="slug"
                    type="text"
                    placeholder="my-workspace"
                    value={slug}
                    onChange={handleSlugChange}
                    required
                    minLength={2}
                    className={slugError ? "border-destructive" : ""}
                  />
                </div>
                {isCheckingSlug && (
                  <p className="text-xs text-muted-foreground">
                    Checking availability...
                  </p>
                )}
                {slugError && (
                  <p className="text-xs text-destructive">{slugError}</p>
                )}
                {!slugError && slug && !isCheckingSlug && (
                  <p className="text-xs text-muted-foreground">
                    Your workspace URL will be: /{slug}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !!slugError || isCheckingSlug}
              >
                {isLoading ? "Creating workspace..." : "Create Workspace"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
