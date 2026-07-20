/**
 * Permissões da Central de Alertas Operacionais.
 * Cliente_produtor e financeiro NUNCA visualizam alertas internos nesta fase.
 */

export const ROLES_VER_ALERTAS: ReadonlyArray<string> = [
  "administrador",
  "gestor",
  "administrativo",
  "consultor_tecnico",
  "tecnico_agronomo",
  "operador_onfarm",
  "producao",
];

export const ROLES_GERAR_ALERTAS: ReadonlyArray<string> = [
  "administrador",
  "gestor",
  "administrativo",
];

export function podeVerAlertas(role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === "cliente_produtor" || role === "financeiro") return false;
  return ROLES_VER_ALERTAS.includes(role);
}

export function podeGerarAlertas(role: string | null | undefined): boolean {
  return !!role && ROLES_GERAR_ALERTAS.includes(role);
}
