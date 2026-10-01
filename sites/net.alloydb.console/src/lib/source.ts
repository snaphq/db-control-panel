import { loader } from "@repo/fumadocs";
import { docs } from "../.source/server";

export const docsSource = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
