import "server-only";
import type {
  Branch,
  Database,
  Endpoint,
  LibsqlDatabase,
  Project,
  Role,
} from "@repo/control-plane-contract";
import type { ControlPlaneClient } from "./client";
import { ControlPlaneError } from "./errors";

export interface NeonBranchView {
  branch: Branch;
  roles: Role[];
  databases: Database[];
}

export interface NeonProjectView {
  project: Project;
  branches: NeonBranchView[];
  endpoints: Endpoint[];
}

export interface DatabasesOverview {
  neon: NeonProjectView[];
  libsql: {
    databases: LibsqlDatabase[];
    /** Set when the libSQL list could not be loaded; Postgres still renders. */
    error: string | null;
  };
}

async function loadProject(
  cp: ControlPlaneClient,
  project: Project,
): Promise<NeonProjectView> {
  const [{ branches }, { endpoints }] = await Promise.all([
    cp.listBranches(project.id),
    cp.listEndpoints(project.id),
  ]);
  const branchViews = await Promise.all(
    branches.map(async (branch) => {
      const [{ roles }, { databases }] = await Promise.all([
        cp.listRoles(project.id, branch.id),
        cp.listDatabases(project.id, branch.id),
      ]);
      return { branch, roles, databases };
    }),
  );
  return { project, branches: branchViews, endpoints };
}

async function loadLibsql(
  cp: ControlPlaneClient,
): Promise<DatabasesOverview["libsql"]> {
  try {
    const { libsql_databases } = await cp.listLibsqlDatabases();
    return { databases: libsql_databases, error: null };
  } catch (error) {
    if (!(error instanceof ControlPlaneError)) throw error;
    console.error("Loading libSQL databases failed:", error.message);
    return {
      databases: [],
      error: "libSQL databases could not be loaded right now.",
    };
  }
}

/** Everything the Databases tab renders, loaded for one console project. */
export async function loadDatabasesOverview(
  cp: ControlPlaneClient,
): Promise<DatabasesOverview> {
  const [{ projects }, libsql] = await Promise.all([
    cp.listProjects(),
    loadLibsql(cp),
  ]);
  const neon = await Promise.all(
    projects.map((project) => loadProject(cp, project)),
  );
  return { neon, libsql };
}
