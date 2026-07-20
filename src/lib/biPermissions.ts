import { AppRole } from "./permissions";

export type BISection = 
  | "visao_geral" 
  | "visitas_tecnicas" 
  | "conversao" 
  | "laboratorio" 
  | "qualidade" 
  | "estoque" 
  | "entregas" 
  | "gargalos" 
  | "exportacao";

export const SECTION_PERMISSIONS: Record<BISection, AppRole[]> = {
  visao_geral: ["administrador", "gestor", "administrativo"],
  visitas_tecnicas: ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo", "administrativo"],
  conversao: ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo", "administrativo"],
  laboratorio: ["administrador", "gestor", "producao", "operador_onfarm", "administrativo"],
  qualidade: ["administrador", "gestor", "producao", "operador_onfarm", "administrativo"],
  estoque: ["administrador", "gestor", "producao", "operador_onfarm", "administrativo"],
  entregas: ["administrador", "gestor", "producao", "operador_onfarm", "administrativo", "consultor_tecnico", "tecnico_agronomo"],
  gargalos: ["administrador", "gestor", "administrativo"],
  exportacao: ["administrador", "gestor", "administrativo"],
};

export function canAccessBISection(role: string | null, section: BISection): boolean {
  if (!role) return false;
  if (role === "administrador" || role === "gestor") return true;
  
  // Financeiro não acessa BI Operacional
  if (role === "financeiro") return false;
  
  // Cliente Produtor não acessa BI geral
  if (role === "cliente_produtor") return false;

  const allowedRoles = SECTION_PERMISSIONS[section] || [];
  return allowedRoles.includes(role as AppRole);
}
