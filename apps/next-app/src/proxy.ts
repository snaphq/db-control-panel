// Shared tenant-site proxy (tenant resolution, auth gates, agent discovery).
// `config` must stay literal in this file for Next.js to read the matcher.
export { proxy } from "@repo/site-kit/proxy";

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
