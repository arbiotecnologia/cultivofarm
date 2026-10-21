import type { PendingRecomendacao } from "@/lib/offlineDb";

/** Canonical enums inspected read-only on swzpzcwiasxmjutrmvkm, 2026-10-21. */
export const REC_ENUM_OPTIONS = {
  objetivo_recomendacao: [
    ["preventivo", "Preventivo"], ["corretivo", "Corretivo"], ["reducao_pressao", "Redução de pressão"],
    ["tratamento_solo", "Tratamento do solo"], ["reequilibrio_biologico", "Reequilíbrio biológico"],
    ["suporte_fisiologico", "Suporte fisiológico"], ["manejo_integrado", "Manejo integrado"],
  ],
  estrategia_manejo: [
    ["biologico", "Biológico"], ["manejo_integrado", "Manejo integrado"], ["monitoramento", "Monitoramento"],
    ["correcao_operacional", "Correção operacional"], ["ajuste_aplicacao", "Ajuste da aplicação"],
    ["ajuste_janela", "Ajuste da janela"], ["outro", "Outro"],
  ],
  modo_aplicacao: [
    ["foliar", "Foliar"], ["aplicacao_no_colo_da_planta", "No colo da planta"], ["via_solo", "Via solo"],
    ["tratamento_semente", "Tratamento de sementes"], ["sulco_plantio", "Sulco de plantio"],
    ["jato_dirigido", "Jato dirigido"], ["outro", "Outro"],
  ],
} satisfies Record<string, readonly (readonly [string, string])[]>;

export function recomendacaoValidationError(payload: PendingRecomendacao["payload"]): string | null {
  for (const field of Object.keys(REC_ENUM_OPTIONS) as (keyof typeof REC_ENUM_OPTIONS)[]) {
    const value = payload[field];
    if (value != null && value !== "" && !REC_ENUM_OPTIONS[field].some(([key]) => key === value)) {
      return "Revise objetivo, estratégia e modo de aplicação: selecione uma opção válida. A pendência foi preservada.";
    }
  }
  return null;
}

/** Expected is the observed server version, never a local edit counter. */
export function recomendacaoExpectedVersion(row: { versao: number; isPending: boolean } | null): number {
  const version = row?.versao ?? 1;
  if (!Number.isInteger(version) || version < 1) throw new Error("version_conflict");
  return version;
}

export interface RecomendacaoOwner { userId: string; organizationId: string }
export function recomendacaoOwnedBy(entry: PendingRecomendacao, actor: RecomendacaoOwner): boolean {
  return entry.ownerUserId === actor.userId && entry.ownerOrganizationId === actor.organizationId;
}