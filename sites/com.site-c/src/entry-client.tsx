// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";

const root = document.getElementById("app");

if (!root)
  throw new Error(
    "com.site-c: entry-server.tsx did not render an #app element",
  );

mount(() => <StartClient />, root);
