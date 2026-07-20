// Helpers para rótulos e agrupamento de lotes envasados na tela de Entregas.
// Garante que produto/microrganismo/cliente nunca apareçam vazios no seletor.

import { getClienteLabel } from "@/lib/clienteLabel";
import { formatOS, formatOSFromId } from "@/lib/osLabel";

export function formatProdutoOuMicro(item: any): string {
  const produtoNome = item?.produtos?.nome || item?._produto_label;
  if (produtoNome && produtoNome !== "—") return produtoNome;

  const micro = item?.microrganismos;
  if (micro) {
    if (micro.nome_cientifico && micro.nome) return `${micro.nome_cientifico} — ${micro.nome}`;
    return micro.nome_cientifico || micro.nome || "Microrganismo";
  }

  // Tentativa via OS reservada
  const osProd = item?._os_produto_nome;
  if (osProd) return osProd;

  return "Produto não identificado";
}

export function formatLoteCodigo(item: any): string {
  return item?.lotes?.codigo_lote || item?._lote_codigo || "LOTE —";
}

export function formatEmbalagem(item: any): string | null {
  const envase = item?._envase;
  if (!envase) return null;
  const volume = envase.volume_por_unidade;
  const tipo = envase.tipo_embalagem;
  if (volume && tipo) return `${tipo} · ${volume} mL`;
  if (volume) return `${volume} mL`;
  if (tipo) return tipo;
  return null;
}

export function formatClienteOuStatus(item: any): { label: string; isReservado: boolean } {
  if (item?._cliente_nome) return { label: item._cliente_nome, isReservado: true };
  if (item?.status === "reservado") return { label: "Reservado (sem cliente)", isReservado: true };
  return { label: "Estoque livre", isReservado: false };
}

export type LoteGrupo = {
  key: string;
  tipo: "os" | "cliente" | "livre";
  titulo: string;
  subtitulo?: string;
  itens: any[];
};

/**
 * Agrupa itens envasados em três seções:
 *   1. Reservado para OS (um sub-grupo por OS)
 *   2. Reservado para cliente sem OS
 *   3. Estoque livre
 */
export function groupLotesPorOS(itens: any[]): LoteGrupo[] {
  const porOS = new Map<string, LoteGrupo>();
  const porCliente = new Map<string, LoteGrupo>();
  const livre: any[] = [];

  for (const it of itens) {
    if (it.reservado_para_os_id) {
      const key = `os:${it.reservado_para_os_id}`;
      let grupo = porOS.get(key);
      if (!grupo) {
        const osLabel =
          it._os_label ||
          formatOSFromId(it.reservado_para_os_id);
        const cliente = it._cliente_nome || "Cliente —";
        grupo = {
          key,
          tipo: "os",
          titulo: osLabel,
          subtitulo: cliente,
          itens: [],
        };
        porOS.set(key, grupo);
      }
      grupo.itens.push(it);
    } else if (it.reservado_para_cliente_id) {
      const key = `cli:${it.reservado_para_cliente_id}`;
      let grupo = porCliente.get(key);
      if (!grupo) {
        grupo = {
          key,
          tipo: "cliente",
          titulo: it._cliente_nome || "Cliente reservado",
          subtitulo: "Sem OS vinculada",
          itens: [],
        };
        porCliente.set(key, grupo);
      }
      grupo.itens.push(it);
    } else {
      livre.push(it);
    }
  }

  const grupos: LoteGrupo[] = [
    ...Array.from(porOS.values()),
    ...Array.from(porCliente.values()),
  ];
  if (livre.length) {
    grupos.push({
      key: "livre",
      tipo: "livre",
      titulo: "Estoque livre",
      subtitulo: "Sem reserva — vincule a uma OS ao registrar",
      itens: livre,
    });
  }
  return grupos;
}

export function searchMatch(item: any, termo: string): boolean {
  if (!termo) return true;
  const t = termo.toLowerCase().trim();
  const haystack = [
    formatLoteCodigo(item),
    formatProdutoOuMicro(item),
    item._cliente_nome,
    item._os_label,
    item.microrganismos?.nome_cientifico,
    item.microrganismos?.nome,
    item.produtos?.nome,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(t);
}
