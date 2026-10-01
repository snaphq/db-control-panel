import type {
  Branch,
  CreateBranchRequest,
  Project,
} from "@repo/control-plane-contract";

/** What the Postgres cards can ask the panel to do. Each throws on failure. */
export interface NeonActions {
  canManage: boolean;
  createBranch: (neonId: string, body: CreateBranchRequest) => Promise<void>;
  requestDeleteBranch: (neonId: string, branch: Branch) => void;
  requestDeleteProject: (project: Project) => void;
  requestResetPassword: (
    neonId: string,
    branchId: string,
    role: string,
  ) => void;
  endpointAction: (
    neonId: string,
    endpointId: string,
    action: "start" | "suspend",
  ) => Promise<void>;
  setDataApi: (
    neonId: string,
    branchId: string,
    database: string,
    enabled: boolean,
  ) => Promise<void>;
}
