import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Props {
  kind: "receivable" | "payable";
  contaId: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criado",
  UPDATE: "Atualizado",
  DELETE: "Removido",
  PAYMENT_REVERSAL_CREATED: "Estorno criado",
  FINANCIAL_DOCUMENT_UPLOADED: "Documento anexado",
  FINANCIAL_DOCUMENT_DELETED: "Documento removido",
  FISCAL_STATUS_UPDATED: "Status NF-e alterado",
};

export function HistoricoTab({ kind, contaId }: Props) {
  const parentType = kind === "receivable" ? "accounts_receivable" : "accounts_payable";
  const instType = kind === "receivable" ? "accounts_receivable_installments" : "accounts_payable_installments";
  const payType = kind === "receivable" ? "receivable_payments" : "payable_payments";
  const fkCol = kind === "receivable" ? "receivable_id" : "payable_id";

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["fin-history", kind, contaId],
    enabled: !!contaId,
    queryFn: async () => {
      // ids relacionados
      const { data: insts } = await supabase.from(instType as any).select("id").eq(fkCol, contaId!);
      const instIds = (insts || []).map((i: any) => i.id);
      let payIds: string[] = [];
      if (instIds.length) {
        const { data: pays } = await supabase.from(payType as any).select("id").in("installment_id", instIds);
        payIds = (pays || []).map((p: any) => p.id);
      }
      const allIds = [contaId!, ...instIds, ...payIds];
      const { data, error } = await supabase
        .from("financial_audit_log")
        .select("*")
        .in("entity_id", allIds)
        .order("performed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>;
  if (!logs.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sem histórico ainda.</p>;

  return (
    <div className="space-y-2">
      {logs.map((l: any) => (
        <div key={l.id} className="border rounded-md p-3 text-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant={l.action.includes("REVERSAL") || l.action === "DELETE" ? "destructive" : "secondary"}>
                {ACTION_LABEL[l.action] ?? l.action}
              </Badge>
              <span className="text-xs text-muted-foreground">{l.entity_type}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTimeDisplay(l.performed_at)}</span>
          </div>
          {l.new_data && (
            <pre className="text-xs mt-2 bg-muted p-2 rounded overflow-x-auto max-h-32">{JSON.stringify(l.new_data, null, 2).slice(0, 400)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
