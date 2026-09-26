import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { siteConfig } from "./site.config";
import "./styles/globals.css";
import "./styles/nav.css";
import "./styles/components.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>{siteConfig.name}</Title>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
