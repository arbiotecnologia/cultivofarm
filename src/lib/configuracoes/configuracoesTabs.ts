// Resolução da aba ativa de /configuracoes a partir do parâmetro `tab` da URL.
// Extraída da página para ser testável e para manter a aba na URL: assim a aba
// sobrevive a remontagens transitórias (pausa de autorização) sem reter nada
// sensível — o parâmetro é apenas o nome da aba, validado contra permissões.

export type ConfiguracoesTabPermissions = {
  isAdmin: boolean;
  canFin: boolean;
  canMeuPlano: boolean;
  isPlatformSuperadmin: boolean;
};

export const CONFIGURACOES_OPEN_TABS = ["perfil", "empresa", "catalogos", "sla-b2b"] as const;

export function resolveConfiguracoesTab(
  tabParam: string | null,
  perms: ConfiguracoesTabPermissions,
): string {
  if (tabParam === "usuarios" && perms.isAdmin) return "usuarios";
  if (tabParam === "financeiro" && perms.canFin) return "financeiro";
  if (tabParam === "meu-plano" && perms.canMeuPlano) return "meu-plano";
  if (tabParam === "aparencia" && perms.isPlatformSuperadmin) return "aparencia";
  if (tabParam && (CONFIGURACOES_OPEN_TABS as readonly string[]).includes(tabParam)) return tabParam;
  return "perfil";
}
