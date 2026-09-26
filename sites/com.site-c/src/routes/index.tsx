import { Navigate } from "@solidjs/router";

/** The dashboard lives at /overview; send the bare path there. */
export default function Index() {
  return <Navigate href="/overview" />;
}
