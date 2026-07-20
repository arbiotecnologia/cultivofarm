
/**
 * Helper para padronizar a exibição do código e nome do cliente em todo o sistema.
 */

interface ClienteSimplificado {
  codigo_cliente?: string | null;
  nome_fantasia?: string | null;
  nome?: string | null;
  razao_social?: string | null;
}

/**
 * Retorna o rótulo formatado do cliente: "0001 · Nome Fantasia"
 */
export function getClienteLabel(cliente?: ClienteSimplificado | null): string {
  if (!cliente) return "—";
  
  const codigo = cliente.codigo_cliente;
  const nome = cliente.nome_fantasia || cliente.nome || cliente.razao_social || "Sem Nome";
  
  if (!codigo) return nome;
  return `${codigo} · ${nome}`;
}

/**
 * Retorna o rótulo de "parte" de uma OS: cliente quando houver,
 * senão o parceiro vinculado via partner_orders → partner_accounts.
 */
export function getOSPartyLabel(os?: any): string {
  if (!os) return "—";
  const clienteLabel = getClienteLabel(os.clientes);
  if (clienteLabel !== "—") return clienteLabel;
  const partner = os.partner_orders?.partner_accounts;
  if (partner) {
    const codigo = partner.codigo;
    const nome = partner.nome_fantasia || partner.razao_social || "Parceiro";
    return codigo ? `${codigo} · ${nome}` : nome;
  }
  return "—";
}

/**
 * Retorna apenas o código formatado do cliente ou string vazia
 */
export function getClienteCodigo(cliente?: ClienteSimplificado | null): string {
  return cliente?.codigo_cliente || "";
}

/**
 * Retorna o rótulo completo para documentos/relatórios
 */
export function getClienteFullLabel(cliente?: ClienteSimplificado | null): string {
  if (!cliente) return "—";
  
  const codigo = cliente.codigo_cliente;
  const nome = cliente.nome_fantasia || cliente.nome || "Sem Nome";
  const razao = cliente.razao_social;
  
  let label = codigo ? `${codigo} — ${nome}` : nome;
  if (razao && razao !== nome) {
    label += ` (${razao})`;
  }
  
  return label;
}
