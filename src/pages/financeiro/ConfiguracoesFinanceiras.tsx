import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Settings } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracoesFinanceiras() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["fin-settings"],
    queryFn: async () => { const { data, error } = await supabase.from("financial_settings").select("*").maybeSingle(); if (error) throw error; return data; },
  });

  const upd = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("financial_settings").update({ ...patch, updated_by: user?.id, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["fin-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Configurações financeiras" description="Ajustes gerais do módulo financeiro" />
      <Card>
        <CardHeader><CardTitle>Comprovantes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <Label className="m-0">Exigir comprovante em recebimentos</Label>
              <p className="text-xs text-muted-foreground">Bloqueia a baixa de contas a receber sem anexo.</p>
            </div>
            <Switch checked={!!s?.require_receipt_on_receivable_payment} onCheckedChange={(v) => upd.mutate({ require_receipt_on_receivable_payment: v })} />
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <Label className="m-0">Exigir comprovante em pagamentos</Label>
              <p className="text-xs text-muted-foreground">Bloqueia a baixa de contas a pagar sem anexo.</p>
            </div>
            <Switch checked={!!s?.require_receipt_on_payable_payment} onCheckedChange={(v) => upd.mutate({ require_receipt_on_payable_payment: v })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
