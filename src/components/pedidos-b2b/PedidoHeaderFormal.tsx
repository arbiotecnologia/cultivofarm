import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { fmtL } from "@/lib/envaseFormat";
import {
  partnerOrderStatusLabel,
  partnerOrderStatusVariant,
} from "@/lib/partnerOrderStatus";
import type { PedidoFormalHeaderData } from "@/hooks/usePedidoFormalHeader";
import type { SimulacaoFormalHeaderData } from "@/hooks/useSimulacaoFormalHeader";
import { FlaskConical, ClipboardList } from "lucide-react";
import { formatCpfCnpjSafe, formatCNPJSafe } from "@/lib/masks";
import { scopeCan, type ViewerScope } from "./viewerScope";

type Documento = PedidoFormalHeaderData | SimulacaoFormalHeaderData;

const SIM_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada_gestor: "Enviada ao gestor",
  convertida_pedido: "Convertida em pedido",
  arquivada: "Arquivada",
};

const SIM_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  rascunho: "outline",
  enviada_gestor: "secondary",
  convertida_pedido: "default",
  arquivada: "outline",
};

function statusLabel(doc: Documento) {
  if (doc.tipo === "pedido") return partnerOrderStatusLabel(doc.status);
  return SIM_STATUS_LABEL[doc.status] ?? doc.status;
}

function statusVariant(doc: Documento) {
  if (doc.tipo === "pedido") return partnerOrderStatusVariant(doc.status);
  return SIM_STATUS_VARIANT[doc.status] ?? "outline";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="text-sm space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-muted-foreground shrink-0 whitespace-nowrap">{label}</span>
      <span className="text-right break-words min-w-0">{value ?? "—"}</span>
    </div>
  );
}

export function PedidoHeaderFormal({
  doc,
  viewerScope = "comercial",
}: {
  doc: Documento;
  viewerScope?: ViewerScope;
}) {
  const isPedido = doc.tipo === "pedido";
  const total = isPedido ? doc.total : doc.total_cheio;
  const cli = doc.cliente;
  const partner = doc.partner;

  const enderecoCliente = cli
    ? [
        cli.endereco_logradouro,
        cli.endereco_numero,
        cli.endereco_bairro,
        cli.endereco_municipio && cli.endereco_estado
          ? `${cli.endereco_municipio} / ${cli.endereco_estado}`
          : cli.endereco_municipio || cli.endereco_estado,
        cli.endereco_cep,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const partnerEntrega = isPedido && partner ? (partner as any) : null;
  const enderecoEntrega = partnerEntrega
    ? [
        partnerEntrega.entrega_logradouro,
        partnerEntrega.entrega_numero,
        partnerEntrega.entrega_bairro,
        partnerEntrega.entrega_cidade && partnerEntrega.entrega_estado
          ? `${partnerEntrega.entrega_cidade} / ${partnerEntrega.entrega_estado}`
          : partnerEntrega.entrega_cidade || partnerEntrega.entrega_estado,
        partnerEntrega.entrega_cep,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4 space-y-4">
        {/* Título / identificação */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {isPedido ? (
                <ClipboardList className="h-6 w-6 text-primary" />
              ) : (
                <FlaskConical className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isPedido ? "Pedido" : "Simulação"}
              </div>
              <div className="text-xl font-bold font-mono leading-tight">
                {doc.numero}
              </div>
              {!isPedido && doc.titulo && (
                <div className="text-sm text-muted-foreground">{doc.titulo}</div>
              )}
              {isPedido && doc.origin_simulation_id && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <FlaskConical className="h-3 w-3" /> Originado de simulação técnica
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusVariant(doc) as any}>{statusLabel(doc)}</Badge>
            {isPedido && doc.financial_status && scopeCan.financialStatus(viewerScope) && (
              <Badge variant="outline" className="text-[10px]">
                Financeiro: {doc.financial_status}
              </Badge>
            )}
            <div className="text-lg font-bold">{brl(total)}</div>
          </div>
        </div>

        {/* Blocos 2x2 no desktop */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. Identificação (datas) */}
          <Section title="Identificação">
            <Row label="Emissão" value={fd(doc.created_at)} />
            {isPedido ? (
              <>
                <Row
                  label="Entrega desejada"
                  value={doc.requested_delivery_date ? fd(doc.requested_delivery_date) : "—"}
                />
                <Row
                  label="Entrega prevista"
                  value={doc.estimated_delivery_date ? fd(doc.estimated_delivery_date) : "—"}
                />
                <Row
                  label="Aprovado em"
                  value={doc.approved_at ? fd(doc.approved_at) : "—"}
                />
              </>
            ) : (
              <>
                <Row label="Atualizada" value={doc.updated_at ? fd(doc.updated_at) : "—"} />
                <Row
                  label="Convertida"
                  value={doc.converted_at ? fd(doc.converted_at) : "—"}
                />
                {doc.converted_order && (
                  <Row
                    label="Pedido gerado"
                    value={<span className="font-mono">{doc.converted_order.numero}</span>}
                  />
                )}
              </>
            )}
            {(doc.cultura || doc.area_total_ha) && (
              <Row
                label="Cultura / área"
                value={
                  [doc.cultura, doc.area_total_ha ? `${doc.area_total_ha} ha` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
              />
            )}
          </Section>

          {/* 2. Cliente / Produtor */}
          <Section title="Cliente / Produtor">
            {cli ? (
              <>
                <div className="font-semibold text-foreground">
                  {cli.razao_social ?? "—"}
                </div>
                {cli.nome_fantasia && (
                  <div className="text-xs text-muted-foreground">{cli.nome_fantasia}</div>
                )}
                <Row label="CNPJ/CPF" value={formatCpfCnpjSafe(cli.cpf_cnpj)} />
                <Row label="IE" value={cli.inscricao_estadual ?? "—"} />
                <Row
                  label="Contato"
                  value={cli.telefone || cli.email || "—"}
                />
                {enderecoCliente && (
                  <div className="text-xs text-muted-foreground pt-1">
                    {enderecoCliente}
                  </div>
                )}
                {(cli as any).propriedade_nome_snapshot && (
                  <div className="text-xs text-muted-foreground">
                    Propriedade: {(cli as any).propriedade_nome_snapshot}
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground italic">Sem cliente vinculado</span>
            )}
          </Section>

          {/* 3. Parceiro e responsáveis */}
          <Section title="Parceiro e responsáveis">
            {partner ? (
              <>
                <div className="font-semibold text-foreground">
                  {partner.nome_fantasia ?? partner.razao_social}
                </div>
                {partner.codigo && (
                  <div className="text-xs text-muted-foreground">Cód. {partner.codigo}</div>
                )}
                <Row label="CNPJ" value={formatCNPJSafe(partner.cnpj)} />
              </>
            ) : (
              <span className="text-muted-foreground italic">—</span>
            )}
            {scopeCan.responsaveisInternos(viewerScope) && (
              <>
                <Row
                  label="Criado por"
                  value={
                    doc.criador?.nome_completo ??
                    doc.criador?.email ??
                    <span className="text-muted-foreground">—</span>
                  }
                />
                {isPedido ? (
                  <Row
                    label="Aprovador"
                    value={
                      doc.aprovador?.nome_completo ??
                      doc.aprovador?.email ??
                      <span className="text-muted-foreground">—</span>
                    }
                  />
                ) : (
                  doc.convertido_por && (
                    <Row
                      label="Convertido por"
                      value={doc.convertido_por.nome_completo ?? doc.convertido_por.email}
                    />
                  )
                )}
              </>
            )}
            {enderecoEntrega && (
              <div className="text-xs text-muted-foreground pt-1">
                Entrega parceiro: {enderecoEntrega}
              </div>
            )}
          </Section>

          {/* 4. Comercial / financeiro */}
          <Section title="Comercial e financeiro">
            {isPedido ? (
              <>
                <Row label="Subtotal" value={brl(doc.subtotal)} />
                {scopeCan.discountDetails(viewerScope) && (
                  <Row label="Desconto" value={brl(doc.desconto_total)} />
                )}
                <Row label="Total" value={<strong>{brl(doc.total)}</strong>} />
                {scopeCan.paymentCondition(viewerScope) && (
                  <>
                    <Row
                      label="Pagamento"
                      value={
                        doc.payment_method ??
                        partner?.condicao_pagamento_padrao ??
                        cli?.condicao_pagamento ??
                        "—"
                      }
                    />
                    <Row
                      label="Vencimento"
                      value={doc.payment_due_date ? fd(doc.payment_due_date) : "—"}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground italic">
                  Simulação: valor de tabela, sem desconto.
                </div>
                <Row label="Subtotal" value={brl(doc.total_cheio)} />
                <Row label="Total" value={<strong>{brl(doc.total_cheio)}</strong>} />
                {doc.volume_total_litros > 0 && (
                  <Row label="Volume total" value={fmtL(doc.volume_total_litros * 1000)} />
                )}
                {(() => {
                  const validUntil = doc.valid_until
                    ?? new Date(new Date(doc.created_at).getTime() + 30 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 10);
                  const expired = new Date(validUntil + "T23:59:59") < new Date();
                  return (
                    <Row
                      label="Validade"
                      value={
                        <span className="inline-flex items-center gap-1">
                          {fd(validUntil)}
                          {expired && (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                              Expirada
                            </Badge>
                          )}
                        </span>
                      }
                    />
                  );
                })()}
                {scopeCan.paymentCondition(viewerScope) && (
                  <Row
                    label="Condição referência"
                    value={partner?.condicao_pagamento_padrao ?? "—"}
                  />
                )}
              </>

            )}
          </Section>
        </div>

        {((scopeCan.observacoesGerais(viewerScope) && doc.observacoes) ||
          (isPedido && scopeCan.commercialNotes(viewerScope) && doc.commercial_notes) ||
          (!isPedido && doc.objetivo_tecnico)) && (
          <div className="border-t pt-3 grid gap-3 sm:grid-cols-2">
            {scopeCan.observacoesGerais(viewerScope) && doc.observacoes && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Observações
                </div>
                <div className="text-sm whitespace-pre-wrap">{doc.observacoes}</div>
              </div>
            )}
            {!isPedido && doc.objetivo_tecnico && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Objetivo técnico
                </div>
                <div className="text-sm whitespace-pre-wrap">{doc.objetivo_tecnico}</div>
              </div>
            )}
            {isPedido && scopeCan.commercialNotes(viewerScope) && doc.commercial_notes && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Notas comerciais
                </div>
                <div className="text-sm whitespace-pre-wrap">{doc.commercial_notes}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
