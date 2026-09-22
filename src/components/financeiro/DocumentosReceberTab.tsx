import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";
import { DocumentosPanel } from "./DocumentosPanel";
import { agregarDocumentosReceber, temComprovanteRecebimento } from "@/lib/financeiro/comprovantesReceber";
import { fmtDate } from "@/lib/financial/format";

interface Props {
  contaId: string | null | undefined;
  canDelete?: boolean;
}

/**
 * Aba Documentos do drawer de conta a receber.
 *
 * Agrega documentos anexados direto à conta (RECEIVABLE) e comprovantes
 * anexados às baixas das parcelas (PAYMENT_RECEIVABLE), sem remapear
 * ownerId nem duplicar registros. Permite anexar comprovante a um
 * recebimento já existente, sem nova RPC de baixa.
 */
export function DocumentosReceberTab({ contaId, canDelete = false }: Props) {
  const [pagamentoAberto, setPagamentoAberto] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["fin-docs-receber-agg", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data: parcelas, error: e1 } = await supabase
        .from("accounts_receivable_installments")
        .select("id, installment_number, receivable_id")
        .eq("receivable_id", contaId!)
        .order("installment_number");
      if (e1) throw e1;
      const parcelaIds = (parcelas ?? []).map((i: any) => i.id as string);

      let pagamentos: any[] = [];
      if (parcelaIds.length) {
        const { data: pgs, error: e2 } = await supabase
          .from("receivable_payments")
          .select("id, installment_id, payment_date, is_reversal, reversed_payment_id")
          .in("installment_id", parcelaIds)
          .order("payment_date", { ascending: false });
        if (e2) throw e2;
        pagamentos = pgs ?? [];
      }
      const payIds = pagamentos.map((p) => p.id as string);

      const docsDiretos = await supabase
        .from("financial_documents")
        .select("*")
        .eq("owner_type", "RECEIVABLE")
        .eq("owner_id", contaId!)
        .is("deleted_at", null);
      if (docsDiretos.error) throw docsDiretos.error;

      let docsPagamento: any[] = [];
      if (payIds.length) {
        const res = await supabase
          .from("financial_documents")
          .select("*")
          .eq("owner_type", "PAYMENT_RECEIVABLE")
          .in("owner_id", payIds)
          .is("deleted_at", null);
        if (res.error) throw res.error;
        docsPagamento = res.data ?? [];
      }

      const agregados = agregarDocumentosReceber(
        contaId!,
        [...(docsDiretos.data ?? []), ...docsPagamento],
        pagamentos,
        parcelas ?? [],
      );
      return {
        agregados,
        pagamentosVigentes: pagamentos
          .filter((p) => !p.is_reversal && !pagamentos.some((r) => r.reversed_payment_id === p.id))
          .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date))),
      };
    },
  });

  const mapa = data ? { [contaId!]: data.agregados.filter((d) => !d.estornado && d.doc.document_type === "RECEIPT").map((d) => String(d.doc.document_type)) } : {};
  const temVigente = data ? temComprovanteRecebimento(mapa, contaId!) : false;

  if (!contaId) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Documentos da conta</h4>
          <Badge variant={temVigente ? "secondary" : "outline"}>
            {temVigente ? "Comprovante de recebimento vigente" : "Sem comprovante vigente"}
          </Badge>
        </div>
        {isError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span>Não foi possível carregar os documentos.</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground italic">Carregando documentos…</p>
        ) : data!.agregados.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum documento anexado.</p>
        ) : (
          <div className="space-y-1">
            {data!.agregados.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 border rounded p-2 text-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate">{String(a.doc.file_name ?? "")}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.origem === "conta"
                        ? "Anexado à conta"
                        : `Baixa · parcela ${a.parcelaNumero ?? "—"}${a.dataPagamento ? ` · ${fmtDate(a.dataPagamento)}` : ""}`}
                    </div>
                  </div>
                </div>
                {a.estornado && <Badge variant="destructive">Estornado</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Anexar comprovante a um recebimento</h4>
        <p className="text-xs text-muted-foreground mb-2">
          O anexo é vinculado ao recebimento já registrado — nenhuma nova baixa é criada.
        </p>
        {isError ? null : isLoading ? (
          <p className="text-xs text-muted-foreground italic">Carregando recebimentos…</p>
        ) : data!.pagamentosVigentes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum recebimento vigente.</p>
        ) : (
          <div className="space-y-2">
            {data!.pagamentosVigentes.map((p: any) => (
              <div key={p.id} className="border rounded-md">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-muted/40"
                  onClick={() => setPagamentoAberto((v) => (v === p.id ? null : p.id))}
                >
                  {pagamentoAberto === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium">{fmtDate(p.payment_date)}</span>
                  <span className="text-muted-foreground text-xs">recebimento</span>
                </button>
                {pagamentoAberto === p.id && (
                  <div className="p-2 border-t">
                    <DocumentosPanel
                      ownerType="PAYMENT_RECEIVABLE"
                      ownerId={p.id}
                      defaultType="RECEIPT"
                      canDelete={canDelete}
                      onChanged={() => refetch()}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
