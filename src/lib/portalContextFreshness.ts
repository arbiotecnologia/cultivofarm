import { createContext } from "react";

// Query lifecycle only, never authorization or cached portal grants.
export const PortalContextFreshness = createContext(false);
export const PortalContextFreshnessProvider = PortalContextFreshness.Provider;