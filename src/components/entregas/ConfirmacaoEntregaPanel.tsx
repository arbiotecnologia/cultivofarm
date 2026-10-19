import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, CheckCircle2, DollarSign, ExternalLink } from "lucide-react";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import { DELIVERY_RECEIPT_BUCKET, deliveryReceiptLocator } from "@/lib/entregas/comprovanteLocator";
import { Loader2 } from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  RECIBO_ASSINADO: "Recibo assinado",
  FOTO_ENTREGA: "Foto da entrega",
  COMPROVANTE: "Comprovante",
  OUTRO: "Outro",
};

interface Props {
  entrega: any;
}

export function ConfirmacaoEntregaPanel({ entrega }: Props) {
  const access = useStorageAccessScope(`entrega:${entrega?.id}`);
  const { data: scopedDocs = [] } = useQuery({
    queryKey: ["entrega-docs", entrega?.id, access.scope],
    enabled: access.ready && !!entrega?.id,
    queryFn: async () => {
      const current = access.capture();
      const { data, error } = await supabase
        .from("entrega_documentos" as any)
        .select("*")
        .eq("entrega_id", entrega.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return current() ? data as any[] : [];
    },
  });
  const docs = access.ready ? scopedDocs : [];

  const { data: confirmador } = useQuery({
    queryKey: ["profile", entrega?.confirmado_por, access.scope],
    enabled: access.ready && !!entrega?.confirmado_por,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, email")
        .eq("user_id", entrega.confirmado_por)
        .maybeSingle();
      return data;
    },
  });

  const navigate = useNavigate();
  const { data: receivable } = useQuery({
    queryKey: ["ar-of-entrega", entrega?.receivable_id, access.scope],
    enabled: access.ready && !!entrega?.receivable_id,
    queryFn: async () => {
      const q: any = supabase
        .from("accounts_receivable")
        .select("id, total_amount, status, fiscal_invoice_status")
        .eq("id", entrega.receivable_id)
        .maybeSingle();
      const { data } = await q;
      return data;
    },
  });


  // Snapshot da lista exibida: troca de documentos/escopo descarta bytes.
  const opener = useAuthenticatedAttachmentOpener(
    JSON.stringify(["delivery-documents", entrega?.id ?? null, docs.map((d) => [d.id, d.arquivo_path])]),
    DELIVERY_RECEIPT_BUCKET,
  );
  const erroArquivo = () => toast({
    title: "Não foi possível preparar o arquivo",
    description: "O arquivo está indisponível no momento. Tente novamente.",
    variant: "destructive",
  });
  const preparar = (path: unknown) => {
    if (!access.ready || !opener.ready) return;
    const locator = deliveryReceiptLocator(entrega?.id, path);
    if (!locator) { erroArquivo(); return; }
    void opener.open(locator, erroArquivo);
  };

  if (!entrega) return null;
  const confirmada = entrega.status === "entregue" && entrega.entregue_em;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4" />
          Confirmação da Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!confirmada ? (
          <p className="text-muted-foreground">Esta entrega ainda não foi formalmente confirmada.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Info label="Status"><Badge variant="outline">Entregue</Badge></Info>
            <Info label="Data/hora">{entrega.entregue_em ? formatDateTimeDisplay(entrega.entregue_em) : "—"}</Info>
            <Info label="Recebido por">{entrega.recebido_por_nome || "—"}</Info>
            <Info label="Cargo / função">{entrega.recebido_por_cargo || "—"}</Info>
            <Info label="Documento">{entrega.recebido_por_documento || "—"}</Info>
            <Info label="Confirmado por">{confirmador?.nome || confirmador?.email || "—"}</Info>
            {entrega.observacoes_confirmacao && (
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">Observações</div>
                <div className="whitespace-pre-wrap">{entrega.observacoes_confirmacao}</div>
              </div>
            )}
          </div>
        )}

        {/* Bloco Financeiro */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <DollarSign className="h-4 w-4" /> Financeiro
          </div>
          {(() => {
            const fs = entrega.financial_status as string | undefined;
            if (fs === "BILLED") {
              return (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Faturado</Badge>
                    <span className="font-mono text-xs">CR-{String(entrega.receivable_id || "").slice(0, 8)}</span>
                    {receivable && <span className="text-muted-foreground">— {brl(Number(receivable.total_amount || 0))}</span>}
                  </div>
                  {receivable?.fiscal_invoice_status && (
                    <div className="text-xs text-muted-foreground">NF-e: {receivable.fiscal_invoice_status}</div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate(`/financeiro/receber?id=${entrega.receivable_id}`)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir conta a receber
                  </Button>
                </div>
              );
            }
            if (fs === "PENDING_BILLING") {
              return (
                <div className="space-y-1 text-sm">
                  <Badge variant="secondary">Pendente de faturamento</Badge>
                  <div className="text-xs text-muted-foreground">Acesse a fila para gerar o lançamento financeiro.</div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/financeiro/entregas-nao-faturadas")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ir para faturamento
                  </Button>
                </div>
              );
            }
            if (fs === "NOT_BILLABLE") {
              return (
                <div className="space-y-1 text-sm">
                  <Badge variant="outline">Sem cobrança</Badge>
                  {entrega.not_billable_reason && (
                    <div className="text-xs"><span className="text-muted-foreground">Motivo:</span> {entrega.not_billable_reason}</div>
                  )}
                </div>
              );
            }
            if (fs === "CANCELED") {
              return <Badge variant="destructive">Cancelado</Badge>;
            }
            return <span className="text-xs text-muted-foreground">—</span>;
          })()}
        </div>


        <div>
          <div className="text-xs font-medium mb-2 text-muted-foreground">Documentos anexados ({docs.length})</div>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 p-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Badge variant="secondary">{TIPO_LABEL[d.tipo_documento] || d.tipo_documento}</Badge>
                    <span className="truncate">{d.nome_arquivo}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{formatDateDisplay(d.uploaded_at)}</span>
                  </div>
                  {(() => {
                    const locator = deliveryReceiptLocator(entrega.id, d.arquivo_path);
                    if (locator && opener.urls[locator]) {
                      return (
                        <Button size="sm" variant="ghost" aria-label={`Baixar ${d.nome_arquivo}`} onClick={() => opener.download(locator, d.nome_arquivo || "anexo")}>
                          <Download className="h-4 w-4" />
                        </Button>
                      );
                    }
                    const busy = !!locator && opener.loadingPaths.includes(locator);
                    return (
                      <Button size="sm" variant="ghost" aria-label={`Preparar ${d.nome_arquivo}`} disabled={busy} onClick={() => preparar(d.arquivo_path)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      </Button>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
