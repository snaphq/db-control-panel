"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/react-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/react-ui/components/ui/form";
import { Input } from "@repo/react-ui/components/ui/input";
import { Textarea } from "@repo/react-ui/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params.workspaceSlug as string;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
    },
  });

  // Fetch organization ID on mount
  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const response = await fetch("/api/auth/organization/list");
        if (!response.ok) return;

        const orgs = await response.json();
        const orgList = Array.isArray(orgs) ? orgs : orgs?.data || [];
        const currentOrg = orgList.find(
          (org: { slug: string }) => org.slug === workspaceSlug,
        );

        if (currentOrg) {
          setOrganizationId(currentOrg.id);
        }
      } catch (error) {
        console.error("Failed to fetch organization:", error);
      }
    };

    fetchOrganization();
  }, [workspaceSlug]);

  // Auto-generate slug from name
  const watchName = form.watch("name");
  useEffect(() => {
    if (watchName) {
      const generatedSlug = watchName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", generatedSlug);
    }
  }, [watchName, form]);

  // Check slug availability
  const watchSlug = form.watch("slug");
  useEffect(() => {
    if (!watchSlug || !organizationId) {
      setSlugAvailable(null);
      return;
    }

    const checkSlug = async () => {
      setIsCheckingSlug(true);
      try {
        const response = await fetch(
          `/api/projects/check-slug?slug=${encodeURIComponent(watchSlug)}&organizationId=${organizationId}`,
        );
        if (response.ok) {
          const data = await response.json();
          setSlugAvailable(data.available);
        }
      } catch (error) {
        console.error("Failed to check slug:", error);
      } finally {
        setIsCheckingSlug(false);
      }
    };

    const debounce = setTimeout(checkSlug, 300);
    return () => clearTimeout(debounce);
  }, [watchSlug, organizationId]);

  async function onSubmit(data: FormValues) {
    if (!organizationId) {
      toast.error("Organization not found");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          description: data.description || undefined,
          organizationId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create project");
      }

      const project = await response.json();
      toast.success("Project created successfully");
      router.push(`/dashboard/${workspaceSlug}/${project.slug}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create project",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex justify-center items-start px-4 pt-8">
      <Card className="w-full max-w-[600px]">
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
          <CardDescription>
            Create a new project in your workspace to organize your work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Awesome Project" {...field} />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for your project.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Slug</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input placeholder="my-awesome-project" {...field} />
                        {isCheckingSlug && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Used in the URL: /dashboard/{workspaceSlug}/
                      <strong>{field.value || "slug"}</strong>
                      {slugAvailable === true && (
                        <span className="ml-2 text-green-600">Available</span>
                      )}
                      {slugAvailable === false && (
                        <span className="ml-2 text-red-600">Already taken</span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A brief description of your project..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || slugAvailable === false}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Project
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
