/// <reference types="astro/client" />
import type { Tenant } from "@repo/database";

declare global {
  namespace App {
    interface Locals {
      /** Resolved from the Host header by src/middleware.ts before any page
       * or endpoint runs. Pages and endpoints must read the tenant from here
       * and never from a client-supplied parameter. */
      tenant: Tenant;
    }
  }
}
