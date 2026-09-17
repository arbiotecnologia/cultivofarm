/**
 * Fase SINIEF 3 — Painel de "Operações especiais — Ajuste SINIEF 49/2025".
 *
 * - Gated para administrador/financeiro; oculto/inerte para demais papéis.
 * - Só gera PRÉVIA de rascunho via builders puros da Fase 2.
 * - Não persiste, não emite, não chama Supabase. `canTransmit` sempre false.
 * - Textos em pt-BR. Produtos e microrganismos podem ser faturáveis direto.
 *   Serviços/NFS-e ficam explicitamente fora destes cenários.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldOff, Info, Plus, Trash2, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  buildFromForm,
  resolveOperationType,
  SINIEF_UI_OPTION_LABELS,
  type SinefFormItem,
  type SinefFormState,
  type SinefUiOption,
} from "@/lib/fiscal/sinief49/formAdapter";
import {
  SINIEF_LEGAL_BASIS,
} from "@/lib/fiscal/sinief49/constants";
import {
  SINIEF_OPERATION_LABELS,
  FIN_NFE_LABELS,
  ICMS_APPROVAL_LABELS,
  STOCK_LOSS_REASON_LABELS,
} from "@/lib/fiscal/sinief49/labels";
import { canUseSinief49Operations } from "@/lib/fiscal/sinief49/permissions";
import { useFiscalProdutosLite, type FiscalProdutoLite } from "@/hooks/useFiscalProdutosLite";
import {
  useFiscalMicrorganismosLite,
  type FiscalMicrorganismoLite,
} from "@/hooks/useFiscalMicrorganismosLite";
import { useProductFiscalListByIds } from "@/hooks/useProductFiscalProfiles";
import { useMicroorganismFiscalProfileList } from "@/hooks/useMicroorganismFiscalProfiles";
import { useDebounce } from "@/hooks/useDebounce";

/** Vigência exibida em pt-BR (03/08/2026); domínio mantém 2026-08-03. */
const SINIEF_LEGAL_EFFECTIVE_DATE_PT_BR = "03/08/2026" as const;

/** Rótulo pt-BR estável do status resolvido por item. */
type ProfileResolution =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "incomplete"; label: string }
  | { status: "configured"; label: string }
  | { status: "unknown" };

const PROFILE_STATUS_LABELS: Record<ProfileResolution["status"], string> = {
  loading: "Verificando perfil fiscal…",
  missing: "Perfil fiscal ausente",
  incomplete: "Perfil fiscal incompleto",
  configured: "Perfil fiscal configurado",
  unknown: "Perfil fiscal indisponível no momento",
};

const UI_OPTIONS: readonly SinefUiOption[] = [
  "ADVANCE_PAYMENT",
  "EFFECTIVE_SALE_AFTER_ADVANCE",
  "STOCK_LOSS",
  "VALUE_QUANTITY_REDUCTION",
  "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND",
  "DELIVERY_REFUSAL_PARTIAL",
] as const;

export interface SinefOperationsPanelProps {
  issuerCnpj: string;
  /** Somente prévia. Não recebe callback de persistência. */
  disabled?: boolean;
}

function emptyItem(seq: number): SinefFormItem {
  return {
    sequence: seq,
    sourceKind: "PRODUCT",
    sourceId: "",
    description: "",
    quantity: 1,
    unitValue: 0,
    cfop: "",
  };
}

export default function SinefOperationsPanel({
  issuerCnpj,
  disabled = false,
}: SinefOperationsPanelProps) {
  const { role } = useAuth();
  const allowed = canUseSinief49Operations(role);

  const [state, setState] = useState<SinefFormState>(() => ({
    uiOption: "ADVANCE_PAYMENT",
    refusalSubReason: "REFUSAL_TOTAL",
    issuerCnpj,
    taxSetupApproved: false,
    items: [emptyItem(1)],
  }));

  const opCanonical = useMemo(() => resolveOperationType(state), [state]);
  const preview = useMemo(
    () => buildFromForm({ ...state, issuerCnpj }),
    [state, issuerCnpj],
  );

  // Ids selecionados (nunca expostos ao usuário) para consulta em lote
  // dos perfis fiscais próprios de produtos e microrganismos.
  const productIds = useMemo(
    () =>
      state.items
        .filter((it) => it.sourceKind === "PRODUCT" && it.sourceId.trim().length > 0)
        .map((it) => it.sourceId),
    [state.items],
  );
  const microorganismIds = useMemo(
    () =>
      state.items
        .filter((it) => it.sourceKind === "MICROORGANISM" && it.sourceId.trim().length > 0)
        .map((it) => it.sourceId),
    [state.items],
  );
  const productProfilesQuery = useProductFiscalListByIds(productIds, {
    enabled: productIds.length > 0,
  });
  const microorganismProfilesQuery = useMicroorganismFiscalProfileList(
    microorganismIds,
    { enabled: microorganismIds.length > 0 },
  );

  const itemResolutions: ProfileResolution[] = useMemo(() => {
    return state.items.map((it): ProfileResolution => {
      const id = it.sourceId.trim();
      if (!id) return { status: "missing" };
      if (it.sourceKind === "PRODUCT") {
        if (productProfilesQuery.isLoading) return { status: "loading" };
        if (productProfilesQuery.isError) return { status: "unknown" };
        const row = (productProfilesQuery.data ?? []).find((r) => r.product_id === id);
        if (!row || !row.profile_id) return { status: "missing" };
        const label = row.profile_status ?? "PENDING";
        if (label.toUpperCase() === "ACTIVE" || label.toUpperCase() === "READY")
          return { status: "configured", label };
        return { status: "incomplete", label };
      }
      // MICROORGANISM
      if (microorganismProfilesQuery.isLoading) return { status: "loading" };
      if (microorganismProfilesQuery.isError) return { status: "unknown" };
      const row = (microorganismProfilesQuery.data ?? []).find(
        (r) => r.microorganism_id === id,
      );
      if (!row) return { status: "missing" };
      const label = row.profile_status ?? "PENDING";
      if (label.toUpperCase() === "ACTIVE" || label.toUpperCase() === "READY")
        return { status: "configured", label };
      return { status: "incomplete", label };
    });
  }, [
    state.items,
    productProfilesQuery.isLoading,
    productProfilesQuery.isError,
    productProfilesQuery.data,
    microorganismProfilesQuery.isLoading,
    microorganismProfilesQuery.isError,
    microorganismProfilesQuery.data,
  ]);

  const profilesBlockPreview = itemResolutions.some(
    (r) => r.status === "missing" || r.status === "incomplete" || r.status === "unknown" || r.status === "loading",
  );

  if (!allowed) return null;

  function patch(next: Partial<SinefFormState>) {
    setState((prev) => ({ ...prev, ...next }));
  }
  function patchItem(idx: number, upd: Partial<SinefFormItem>) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...upd } : it)),
    }));
  }
  function addItem() {
    setState((prev) => ({
      ...prev,
      items: [...prev.items, emptyItem(prev.items.length + 1)],
    }));
  }
  function removeItem(idx: number) {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  }

  const readonly = disabled;

  return (
    <div className="space-y-4" data-testid="sinief49-panel">
      <Alert>
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>Operações especiais — Ajuste SINIEF 49/2025</AlertTitle>
        <AlertDescription>
          Prévia de rascunho — não transmite documento fiscal. Nenhum campo
          desta seção é salvo enquanto a modelagem SINIEF não estiver aplicada.
          <span className="block text-xs text-muted-foreground mt-1">
            Base legal: {SINIEF_LEGAL_BASIS} · vigência {SINIEF_LEGAL_EFFECTIVE_DATE_PT_BR}.
          </span>
        </AlertDescription>
      </Alert>

      <fieldset disabled={readonly} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selecione a operação</CardTitle>
            <CardDescription>Escolha um dos seis cenários do Ajuste.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              aria-label="Operação SINIEF 49/2025"
              className="h-10 border rounded-md px-3 bg-background w-full"
              value={state.uiOption}
              onChange={(e) => patch({ uiOption: e.target.value as SinefUiOption })}
              data-testid="sinief49-op-select"
            >
              {UI_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {SINIEF_UI_OPTION_LABELS[o]}
                </option>
              ))}
            </select>

            {state.uiOption === "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND" && (
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Sub-motivo</Label>
                <select
                  aria-label="Sub-motivo da recusa"
                  className="h-10 border rounded-md px-3 bg-background w-full"
                  value={state.refusalSubReason ?? "REFUSAL_TOTAL"}
                  onChange={(e) =>
                    patch({
                      refusalSubReason: e.target.value as
                        | "REFUSAL_TOTAL"
                        | "RECIPIENT_NOT_FOUND",
                    })
                  }
                >
                  <option value="REFUSAL_TOTAL">Recusa total pelo destinatário</option>
                  <option value="RECIPIENT_NOT_FOUND">Destinatário não localizado</option>
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aprovação tributária (simulação)</CardTitle>
            <CardDescription>
              Este marcador é apenas para a prévia. Não substitui a
              aprovação real da contabilidade nem libera transmissão.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <input
                id="sinief-approved"
                type="checkbox"
                checked={state.taxSetupApproved}
                onChange={(e) => patch({ taxSetupApproved: e.target.checked })}
              />
              <Label htmlFor="sinief-approved" className="cursor-pointer">
                Simulação: configuração revisada pela contabilidade
              </Label>
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label>UF (opcional)</Label>
              <Input
                value={state.taxSetupUf ?? ""}
                onChange={(e) => patch({ taxSetupUf: e.target.value.toUpperCase().slice(0, 2) })}
              />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <Label>Regime (opcional)</Label>
              <Input
                value={state.taxSetupRegime ?? ""}
                onChange={(e) => patch({ taxSetupRegime: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {opCanonical !== "STOCK_LOSS" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destinatário</CardTitle>
              <CardDescription>
                Informe CNPJ (14 caracteres) do destinatário. Nas operações IN
                (redução/recusa/não localizado), use o CNPJ do destinatário
                original.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>CNPJ do destinatário</Label>
                <Input
                  value={state.recipient?.cnpj ?? ""}
                  onChange={(e) =>
                    patch({
                      recipient: {
                        kind: "EXTERNAL",
                        cnpj: e.target.value.replace(/[^0-9A-Z]/gi, "").toUpperCase().slice(0, 14),
                        name: state.recipient?.name,
                      },
                    })
                  }
                />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Razão social (opcional)</Label>
                <Input
                  value={state.recipient?.name ?? ""}
                  onChange={(e) =>
                    patch({
                      recipient: {
                        kind: "EXTERNAL",
                        cnpj: state.recipient?.cnpj ?? "",
                        name: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}

        {opCanonical === "ADVANCE_PAYMENT" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Antecipação — dados obrigatórios</CardTitle>
              <CardDescription>Pedido de origem e previsão de entrega.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Pedido de origem</Label>
                <Input
                  value={state.orderId ?? ""}
                  onChange={(e) => patch({ orderId: e.target.value })}
                />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Data prevista de entrega</Label>
                <Input
                  type="date"
                  value={state.expectedDeliveryDate ?? ""}
                  onChange={(e) => patch({ expectedDeliveryDate: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {opCanonical === "EFFECTIVE_SALE_AFTER_ADVANCE" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Antecipações vinculadas</CardTitle>
              <CardDescription>
                Informe as chaves de acesso (44 dígitos) e saldos remanescentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Estado do ICMS</Label>
                <select
                  className="h-10 border rounded-md px-3 bg-background w-full"
                  value={state.icmsApprovalState ?? "BLOCKED_PENDING_ACCOUNTING"}
                  onChange={(e) =>
                    patch({
                      icmsApprovalState: e.target.value as SinefFormState["icmsApprovalState"],
                    })
                  }
                >
                  <option value="APPROVED_BY_ACCOUNTING">
                    {ICMS_APPROVAL_LABELS.APPROVED_BY_ACCOUNTING}
                  </option>
                  <option value="BLOCKED_PENDING_ACCOUNTING">
                    {ICMS_APPROVAL_LABELS.BLOCKED_PENDING_ACCOUNTING}
                  </option>
                </select>
              </div>
              {(state.advanceReferences ?? []).map((r, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end border rounded p-2">
                  <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                    <Label>Chave da NF-e de antecipação</Label>
                    <Input
                      value={r.advanceAccessKey}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "").slice(0, 44);
                        setState((prev) => ({
                          ...prev,
                          advanceReferences: (prev.advanceReferences ?? []).map((x, i) =>
                            i === idx ? { ...x, advanceAccessKey: value } : x,
                          ),
                        }));
                      }}
                    />
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Label>Saldo remanescente</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={r.remainingValue}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setState((prev) => ({
                          ...prev,
                          advanceReferences: (prev.advanceReferences ?? []).map((x, i) =>
                            i === idx ? { ...x, remainingValue: value } : x,
                          ),
                        }));
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  patch({
                    advanceReferences: [
                      ...(state.advanceReferences ?? []),
                      { advanceAccessKey: "", remainingValue: 0 },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar antecipação
              </Button>
            </CardContent>
          </Card>
        )}

        {opCanonical === "STOCK_LOSS" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Baixa de estoque</CardTitle>
              <CardDescription>
                Motivo legal, justificativa e (se houver) lote/movimentação.
                O destinatário é o próprio emitente.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Motivo</Label>
                <select
                  className="h-10 border rounded-md px-3 bg-background w-full"
                  value={state.stockLossContext?.legalReasonCategory ?? "LOSS"}
                  onChange={(e) =>
                    patch({
                      stockLossContext: {
                        legalReasonCategory: e.target.value as SinefFormState["stockLossContext"] extends infer T
                          ? T extends { legalReasonCategory: infer C }
                            ? C
                            : never
                          : never,
                        legalReasonDetails:
                          state.stockLossContext?.legalReasonDetails ?? "",
                        loteId: state.stockLossContext?.loteId,
                        movimentacaoId: state.stockLossContext?.movimentacaoId,
                        occurredAt: state.stockLossContext?.occurredAt,
                      },
                    })
                  }
                >
                  {Object.entries(STOCK_LOSS_REASON_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Data do evento</Label>
                <Input
                  type="date"
                  value={state.stockLossContext?.occurredAt ?? ""}
                  onChange={(e) =>
                    patch({
                      stockLossContext: {
                        legalReasonCategory:
                          state.stockLossContext?.legalReasonCategory ?? "LOSS",
                        legalReasonDetails:
                          state.stockLossContext?.legalReasonDetails ?? "",
                        loteId: state.stockLossContext?.loteId,
                        movimentacaoId: state.stockLossContext?.movimentacaoId,
                        occurredAt: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                <Label>Justificativa</Label>
                <Textarea
                  value={state.stockLossContext?.legalReasonDetails ?? ""}
                  onChange={(e) =>
                    patch({
                      stockLossContext: {
                        legalReasonCategory:
                          state.stockLossContext?.legalReasonCategory ?? "LOSS",
                        legalReasonDetails: e.target.value,
                        loteId: state.stockLossContext?.loteId,
                        movimentacaoId: state.stockLossContext?.movimentacaoId,
                        occurredAt: state.stockLossContext?.occurredAt,
                      },
                    })
                  }
                />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>Estado do ICMS</Label>
                <select
                  className="h-10 border rounded-md px-3 bg-background w-full"
                  value={state.icmsApprovalState ?? "BLOCKED_PENDING_ACCOUNTING"}
                  onChange={(e) =>
                    patch({
                      icmsApprovalState: e.target.value as SinefFormState["icmsApprovalState"],
                    })
                  }
                >
                  <option value="APPROVED_BY_ACCOUNTING">
                    {ICMS_APPROVAL_LABELS.APPROVED_BY_ACCOUNTING}
                  </option>
                  <option value="BLOCKED_PENDING_ACCOUNTING">
                    {ICMS_APPROVAL_LABELS.BLOCKED_PENDING_ACCOUNTING}
                  </option>
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {(opCanonical === "VALUE_QUANTITY_REDUCTION" ||
          opCanonical === "DELIVERY_REFUSAL_TOTAL" ||
          opCanonical === "DELIVERY_REFUSAL_PARTIAL" ||
          opCanonical === "RECIPIENT_NOT_FOUND") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">NF-e original de referência</CardTitle>
              <CardDescription>
                Informe a chave (44 dígitos) do documento original e o CNPJ do
                destinatário original.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                <Label>Chave da NF-e original</Label>
                <Input
                  value={state.original?.originalAccessKey ?? ""}
                  onChange={(e) =>
                    patch({
                      original: {
                        originalAccessKey: e.target.value.replace(/\D/g, "").slice(0, 44),
                        originalRecipient: state.original?.originalRecipient ?? {
                          kind: "EXTERNAL",
                          cnpj: state.recipient?.cnpj ?? "",
                        },
                        originalItems: state.original?.originalItems ?? [],
                      },
                    })
                  }
                />
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <Label>CNPJ do destinatário original</Label>
                <Input
                  value={state.original?.originalRecipient.cnpj ?? state.recipient?.cnpj ?? ""}
                  onChange={(e) =>
                    patch({
                      original: {
                        originalAccessKey: state.original?.originalAccessKey ?? "",
                        originalRecipient: {
                          kind: "EXTERNAL",
                          cnpj: e.target.value.replace(/[^0-9A-Z]/gi, "").toUpperCase().slice(0, 14),
                        },
                        originalItems: state.original?.originalItems ?? [],
                      },
                    })
                  }
                />
              </div>
              {opCanonical === "RECIPIENT_NOT_FOUND" && (
                <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                  <Label>Evidências de tentativa de entrega</Label>
                  <Textarea
                    placeholder="Descreva canais, datas e comprovantes"
                    value={(state.deliveryAttempts ?? [])
                      .map((d) => `${d.attemptedAt} · ${d.channel} · ${d.proofReference}`)
                      .join("\n")}
                    onChange={(e) => {
                      const lines = e.target.value.split("\n").filter((l) => l.trim().length > 0);
                      const attempts = lines.map((l) => {
                        const [attemptedAt = "", channel = "", proofReference = ""] = l
                          .split("·")
                          .map((s) => s.trim());
                        return { attemptedAt, channel, proofReference };
                      });
                      patch({ deliveryAttempts: attempts });
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Itens</CardTitle>
              <CardDescription>
                Produtos e microrganismos são faturáveis diretamente. Microrganismo
                não depende de associação a produto composto. Serviços/NFS-e não
                pertencem a estes cenários.
              </CardDescription>
            </div>
            <Button size="sm" variant="secondary" type="button" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.items.map((it, idx) => (
              <div key={idx} className="border rounded p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Label>Tipo</Label>
                    <select
                      className="h-10 border rounded-md px-3 bg-background w-full"
                      value={it.sourceKind}
                      onChange={(e) =>
                        patchItem(idx, { sourceKind: e.target.value as SinefFormItem["sourceKind"] })
                      }
                    >
                      <option value="PRODUCT">Produto</option>
                      <option value="MICROORGANISM">Microrganismo</option>
                    </select>
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5 md:col-span-2">
                    <Label>Descrição</Label>
                    <Input
                      value={it.description}
                      onChange={(e) => patchItem(idx, { description: e.target.value })}
                    />
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Label>Qtd.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={it.quantity}
                      onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Label>Valor unit.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={it.unitValue}
                      onChange={(e) => patchItem(idx, { unitValue: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Label>CFOP</Label>
                    <Input
                      value={it.cfop}
                      onChange={(e) => patchItem(idx, { cfop: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-2">
                    {it.sourceKind === "PRODUCT" ? (
                      <ProdutoPicker
                        selectedName={it.description}
                        selectedId={it.sourceId}
                        disabled={readonly}
                        onPick={(p) =>
                          patchItem(idx, {
                            sourceId: p.id,
                            description: p.nome,
                          })
                        }
                        onClear={() => patchItem(idx, { sourceId: "", description: "" })}
                      />
                    ) : (
                      <MicrorganismoPicker
                        selectedName={it.description}
                        selectedId={it.sourceId}
                        disabled={readonly}
                        onPick={(m) =>
                          patchItem(idx, {
                            sourceId: m.id,
                            description: m.nome,
                          })
                        }
                        onClear={() => patchItem(idx, { sourceId: "", description: "" })}
                      />
                    )}
                    <ItemProfileStatusLine resolution={itemResolutions[idx]} />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Prévia do rascunho <Badge variant="outline">Não transmite</Badge>
            </CardTitle>
            <CardDescription>
              Gerada apenas pelos validadores puros da Fase 2.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <PreviewBlock preview={preview} blockedByProfiles={profilesBlockPreview} />
          </CardContent>
        </Card>
      </fieldset>
    </div>
  );
}

function PreviewBlock({
  preview,
  blockedByProfiles,
}: {
  preview: ReturnType<typeof buildFromForm>;
  blockedByProfiles: boolean;
}) {
  if (!preview.ok || !preview.draft) {
    return (
      <div className="space-y-2" data-testid="sinief49-preview-invalid">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Rascunho ainda inválido</AlertTitle>
          <AlertDescription>
            {preview.issues.length === 0
              ? "Preencha os campos obrigatórios."
              : "Corrija as pendências listadas abaixo."}
          </AlertDescription>
        </Alert>
        <ul className="list-disc pl-5">
          {preview.issues.map((it, i) => (
            <li key={i}>
              <span className="font-mono text-xs mr-2">{it.code}</span>
              {it.message}
              {it.path ? <span className="text-xs text-muted-foreground"> · {it.path}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (blockedByProfiles) {
    return (
      <div className="space-y-2" data-testid="sinief49-preview-blocked-profiles">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Prévia bloqueada — perfis fiscais pendentes</AlertTitle>
          <AlertDescription>
            Cadastre o perfil fiscal próprio de cada item selecionado antes de
            considerar a prévia válida. canTransmit permanece{" "}
            <strong>false</strong>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const d = preview.draft;
  const blocked = d.icmsApprovalState === "BLOCKED_PENDING_ACCOUNTING";
  return (
    <div className="space-y-2" data-testid="sinief49-preview-valid">
      <Alert>
        {blocked ? (
          <AlertTriangle className="h-4 w-4" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        )}
        <AlertTitle>
          {blocked ? "Válido para rascunho — bloqueado por validação contábil" : "Válido para rascunho"}
        </AlertTitle>
        <AlertDescription>
          canTransmit = <strong>false</strong>. Nada será transmitido nem persistido.
        </AlertDescription>
      </Alert>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
        <li>Cenário: <strong>{SINIEF_OPERATION_LABELS[d.operationType]}</strong></li>
        <li>Direção: <strong>{d.direction}</strong></li>
        <li>finNFe: <strong>{d.finNFe}</strong> · {FIN_NFE_LABELS[d.finNFe]}</li>
        <li>tpNFDebito: <strong>{d.tpNFDebito ?? "—"}</strong></li>
        <li>tpNFCredito: <strong>{d.tpNFCredito ?? "—"}</strong></li>
        <li>Natureza: <strong>{d.natureOperation}</strong></li>
        <li className="md:col-span-2">
          Itens ({d.items.length}):{" "}
          {d.items
            .map((it) => `#${it.sequence} ${it.sourceKind}/${it.description || "(sem descrição)"} — CFOP ${it.cfop}`)
            .join(" · ")}
        </li>
        {d.documentReferences.length > 0 && (
          <li className="md:col-span-2">
            Referências: {d.documentReferences.map((r) => `${r.relationType}=${r.referencedAccessKey ?? "?"}`).join(" · ")}
          </li>
        )}
        {d.stockLossContext && (
          <li className="md:col-span-2">
            Perda: {STOCK_LOSS_REASON_LABELS[d.stockLossContext.legalReasonCategory]} —{" "}
            {d.stockLossContext.legalReasonDetails}
          </li>
        )}
        <li className="md:col-span-2 text-xs text-muted-foreground">
          <Info className="inline h-3 w-3 mr-1" aria-hidden />
          Base legal: {d.legal.basis} · vigência {d.legal.effectiveDate} · idempotency {d.idempotencyKey}
        </li>
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponentes: pickers reutilizam hooks já existentes de leitura.
// Nenhum destes componentes importa Supabase diretamente.
// ────────────────────────────────────────────────────────────────────────────

interface PickerBaseProps {
  selectedName: string;
  selectedId: string;
  disabled?: boolean;
  onClear: () => void;
}

function ProdutoPicker({
  selectedName,
  selectedId,
  disabled,
  onPick,
  onClear,
}: PickerBaseProps & { onPick: (p: FiscalProdutoLite) => void }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const [open, setOpen] = useState(false);
  const q = useFiscalProdutosLite(debounced);
  useEffect(() => {
    if (debounced.trim().length >= 2) setOpen(true);
  }, [debounced]);
  return (
    <div className="grid min-w-0 content-start gap-1.5" data-testid="sinief49-produto-picker">
      <Label className="text-xs">Produto</Label>
      {selectedId ? (
        <div className="flex items-center justify-between rounded border px-2 py-1 text-sm">
          <span className="truncate" data-testid="sinief49-produto-selecionado">
            {selectedName || "Produto selecionado"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setTerm("");
            }}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Buscar produto por nome ou código"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
      {!selectedId && open && debounced.trim().length >= 2 && (
        <div className="max-h-40 overflow-auto rounded border bg-background">
          {q.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : q.isError ? (
            <div className="p-2 text-xs text-destructive">Falha ao consultar produtos. Tente novamente.</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">Nenhum produto encontrado.</div>
          ) : (
            <ul className="text-sm">
              {(q.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => {
                      onPick(p);
                      setTerm("");
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{p.nome}</span>
                    {p.codigo ? (
                      <span className="ml-2 text-xs text-muted-foreground">{p.codigo}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MicrorganismoPicker({
  selectedName,
  selectedId,
  disabled,
  onPick,
  onClear,
}: PickerBaseProps & { onPick: (m: FiscalMicrorganismoLite) => void }) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 250);
  const [open, setOpen] = useState(false);
  const q = useFiscalMicrorganismosLite(debounced);
  useEffect(() => {
    if (debounced.trim().length >= 2) setOpen(true);
  }, [debounced]);
  return (
    <div className="grid min-w-0 content-start gap-1.5" data-testid="sinief49-microrganismo-picker">
      <Label className="text-xs">Microrganismo (faturável direto)</Label>
      {selectedId ? (
        <div className="flex items-center justify-between rounded border px-2 py-1 text-sm">
          <span className="truncate" data-testid="sinief49-microrganismo-selecionado">
            {selectedName || "Microrganismo selecionado"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              setTerm("");
            }}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder="Buscar microrganismo por nome"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
      {!selectedId && open && debounced.trim().length >= 2 && (
        <div className="max-h-40 overflow-auto rounded border bg-background">
          {q.isLoading ? (
            <div className="p-2 text-xs text-muted-foreground">Buscando…</div>
          ) : q.isError ? (
            <div className="p-2 text-xs text-destructive">Falha ao consultar microrganismos. Tente novamente.</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">Nenhum microrganismo encontrado.</div>
          ) : (
            <ul className="text-sm">
              {(q.data ?? []).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted"
                    onClick={() => {
                      onPick(m);
                      setTerm("");
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{m.nome}</span>
                    {m.nome_cientifico ? (
                      <span className="ml-2 text-xs italic text-muted-foreground">
                        {m.nome_cientifico}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemProfileStatusLine({ resolution }: { resolution: ProfileResolution | undefined }) {
  if (!resolution) return null;
  const label = PROFILE_STATUS_LABELS[resolution.status];
  const variant =
    resolution.status === "configured"
      ? "default"
      : resolution.status === "loading"
      ? "secondary"
      : "destructive";
  return (
    <p
      className="mt-1 text-xs"
      data-testid={`sinief49-perfil-status-${resolution.status}`}
    >
      <Badge variant={variant as "default" | "secondary" | "destructive"}>{label}</Badge>
    </p>
  );
}
