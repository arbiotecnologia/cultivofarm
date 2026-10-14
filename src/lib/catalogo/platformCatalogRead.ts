import { z } from "zod";

export const PLATFORM_CATALOG_LIMIT = 50;
export const PLATFORM_CATALOG_MAX_OFFSET = 1_000_000;
export const PLATFORM_CATALOG_SEARCH_LIMIT = 120;

const COHERENT: Record<"biologico" | "quimico" | "fertilizante_adubo", readonly string[]> = {
  biologico: ["biofungicida", "bioinseticida", "inoculante", "solubilizador"],
  quimico: ["fungicida", "inseticida", "herbicida"], fertilizante_adubo: [],
};

export const platformCatalogPageSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    codigo: z.string().nullable(),
    nome: z.string(),
    tipo: z.enum(["inseticida", "fungicida", "solo", "inoculante", "solubilizador"]).nullable(),
    ativo: z.boolean(),
    b2b_enabled: z.boolean(),
    updated_at: z.string().nullable(),
    // Classificação explícita (NULL = pendente). Nunca derivada de `tipo`.
    familia_catalogo: z.enum(["biologico", "quimico", "fertilizante_adubo"]).nullable().optional().default(null),
    classe_catalogo: z.enum(["biofungicida", "bioinseticida", "inoculante", "solubilizador", "fungicida", "inseticida", "herbicida"])
      .nullable().optional().default(null),
  }).strip().refine((i) => i.classe_catalogo === null || (i.familia_catalogo !== null
    && COHERENT[i.familia_catalogo].includes(i.classe_catalogo)))).max(PLATFORM_CATALOG_LIMIT),
  has_more: z.boolean(),
}).strip();

export interface PlatformCatalogActor {
  user: { id: string } | null;
  session: { user: { id: string }; expires_at?: number } | null;
  profile: { id: string; user_id: string; ativo?: boolean; senha_provisoria?: boolean; organization_id?: string | null } | null;
  roles: readonly string[];
  loading: boolean;
  error: string | null;
}

/** Visibility fence only; the RPC independently authorizes the real actor. */
export function platformCatalogAccess(actor: PlatformCatalogActor) {
  const { user, session, profile, roles, loading, error } = actor;
  const ready = !loading && !error && !!user && session?.user.id === user.id &&
    profile?.user_id === user.id && profile.ativo === true &&
    profile.senha_provisoria === false && roles.includes("superadmin");
  const scope = JSON.stringify([ready, user?.id, session?.user.id, session?.expires_at,
    profile?.id, profile?.user_id, profile?.ativo, profile?.senha_provisoria,
    profile?.organization_id, [...roles].sort(), loading, error]);
  return { ready, scope };
}