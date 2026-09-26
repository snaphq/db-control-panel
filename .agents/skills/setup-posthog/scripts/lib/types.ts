export interface SetupResult {
  credentialsVerified: boolean;
  projectId?: string;
  projectName?: string;
  actionsCreated: string[];
  workflowsCreated: string[];
  emailTemplatesCreated: string[];
  envUpdated: boolean;
}

export interface PostHogProject {
  id: number;
  name: string;
  organization: string;
}

export interface PostHogAction {
  id: number;
  name: string;
  description?: string;
  steps: Array<{
    event: string;
    selector?: string | null;
    url?: string | null;
  }>;
}

export interface VerifyCredentialsResult {
  valid: boolean;
  project: PostHogProject | null;
  apiKey: string;
}
