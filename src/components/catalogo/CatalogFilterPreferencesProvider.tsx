import { useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CatalogFilterMemoryContext, createCatalogFilterMemory } from "@/lib/catalogo/catalogFilterPreferences";

/** Preferences only, below AuthProvider but above Routes and every access return. */
export function CatalogFilterPreferencesProvider({ children }: { children: ReactNode }) {
  const { user, profile, roles } = useAuth();
  const { pathname } = useLocation();
  const memory = useRef(createCatalogFilterMemory());
  const identity = user?.id && profile?.user_id === user.id && profile.organization_id &&
    pathname === "/portal-parceiro/catalogo"
    ? JSON.stringify([user.id, profile.organization_id, [...roles].sort(), "b2b"]) : null;
  // Never capture permission/partner data here or initiate a reader. The existing
  // guard/layout supplies resolved partner state; pause alone preserves preferences.
  memory.current.bind(identity, undefined);
  return <CatalogFilterMemoryContext.Provider value={memory.current}>{children}</CatalogFilterMemoryContext.Provider>;
}