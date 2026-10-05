import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTenantScopedStoragePath(path: string, organizationId: string): boolean {
  return UUID_RE.test(organizationId) && path.startsWith(`${organizationId}/`);
}

export async function getCurrentOrganizationId(): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (authError || !userId) throw new Error("Sessão ativa não encontrada.");

  const { data, error } = await supabase
    .from("profiles")
    .select("organization_id, ativo")
    .eq("user_id", userId)
    .eq("ativo", true)
    .maybeSingle();

  const organizationId = data?.organization_id;
  if (error || !organizationId || !UUID_RE.test(organizationId)) {
    throw new Error("Organização ativa não encontrada.");
  }
  return organizationId;
}

export async function buildTenantStoragePath(relativePath: string): Promise<string> {
  const normalized = relativePath.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("Caminho de arquivo inválido.");
  return `${await getCurrentOrganizationId()}/${normalized}`;
}