import { useAuth } from "./useAuth";

/**
 * Retorna true se o usuário pode visualizar/gerenciar documentos de clientes.
 * Apenas perfis 'administrador' e 'administrativo'.
 */
export function useCanManageClienteDocs(): boolean {
  const { role } = useAuth();
  return role === "administrador" || role === "administrativo";
}
