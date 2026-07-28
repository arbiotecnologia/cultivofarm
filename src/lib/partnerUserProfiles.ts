/**
 * Mapeamento partner_users -> profiles.
 *
 * ATENÇÃO: `profiles` possui DUAS colunas uuid:
 *   - `id`      → chave primária da linha do profile
 *   - `user_id` → id do usuário de autenticação (auth.users.id)
 *
 * `partner_users.user_id`, `partner_technician_clients.technician_user_id`,
 * `user_roles.user_id` etc. referenciam SEMPRE `profiles.user_id`.
 * Casar por `profiles.id` produz lista vazia (usuário "sem cadastro").
 */
import { supabase } from "@/integrations/supabase/client";

export interface BasicProfile {
  user_id: string;
  nome: string | null;
  email: string | null;
}

/** Coluna correta para casar ids de usuários de autenticação com `profiles`. */
export const PROFILE_USER_ID_COLUMN = "user_id" as const;

/** Rótulo exibido quando o vínculo aponta para um usuário sem profile no sistema. */
export const MISSING_PROFILE_LABEL = "Usuário sem cadastro no sistema";

/** Busca profiles pelos ids de autenticação e devolve um mapa por `user_id`. */
export async function fetchProfilesByUserIds(
  userIds: string[],
): Promise<Map<string, BasicProfile>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, nome, email")
    .in(PROFILE_USER_ID_COLUMN, ids);
  if (error) throw error;

  return new Map(
    (data ?? []).map((p: any) => [
      p.user_id as string,
      { user_id: p.user_id, nome: p.nome ?? null, email: p.email ?? null } as BasicProfile,
    ]),
  );
}

/** Nome exibível de um usuário vinculado, com fallback explícito. */
export function displayPartnerUserName(
  profile: BasicProfile | undefined,
  userId: string,
): string {
  return profile?.nome || profile?.email || `${MISSING_PROFILE_LABEL} (${userId.slice(0, 8)})`;
}
