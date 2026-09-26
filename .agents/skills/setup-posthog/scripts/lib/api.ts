import type { PostHogAction, PostHogProject } from "./types";

export async function fetchPostHog(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const baseUrl = "https://app.posthog.com";
  const url = `${baseUrl}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export async function getProjectInfo(
  apiKey: string,
): Promise<PostHogProject | null> {
  try {
    const response = await fetchPostHog("/api/projects/", apiKey);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const results = data.results || data;

    if (Array.isArray(results) && results.length > 0) {
      return results[0] as PostHogProject;
    }

    return null;
  } catch {
    return null;
  }
}

export async function createAction(
  apiKey: string,
  projectId: number,
  name: string,
  eventName: string,
  description?: string,
): Promise<PostHogAction | null> {
  try {
    const response = await fetchPostHog(
      `/api/projects/${projectId}/actions/`,
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          steps: [
            {
              event: eventName,
              selector: null,
              url: null,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create action: ${error}`);
      return null;
    }

    return (await response.json()) as PostHogAction;
  } catch (error) {
    console.error("Error creating action:", error);
    return null;
  }
}

export async function getExistingActions(
  apiKey: string,
  projectId: number,
): Promise<PostHogAction[]> {
  try {
    const response = await fetchPostHog(
      `/api/projects/${projectId}/actions/`,
      apiKey,
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.results || data) as PostHogAction[];
  } catch {
    return [];
  }
}
