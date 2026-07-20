import { useEffect, useState } from "react";
import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getClienteLabel } from "@/lib/clienteLabel";
import { brl } from "@/lib/financial/format";
import type { CustomerStatement } from "./types";

export default function RelatorioPorCliente() {
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string; codigo_cliente?: string }>>([]);
  useEffect(() => {
    supabase.from("clientes").select("id, nome, codigo_cliente").order("nome").limit(500).then(({ data }) => setClientes(data ?? []));
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const first = today.slice(0, 8) + "01";
  return (
    <ReportShell<CustomerStatement>
      title="Extrato Financeiro por Cliente"
      reportType="customer_statement"
      defaultFilters={{ _customer_id: "", _from: first, _to: today }}
      renderFilters={(filters, set) => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Cliente</Label>
            <Select value={(filters._customer_id as string) ?? ""} onValueChange={(v) => set({ ...filters, _customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>De</Label><Input type="date" value={(filters._from as string) ?? ""} onChange={(e) => set({ ...filters, _from: e.target.value })} /></div>
          <div><Label>Até</Label><Input type="date" value={(filters._to as string) ?? ""} onChange={(e) => set({ ...filters, _to: e.target.value })} /></div>
        </div>
      )}
      renderPreview={(data) => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Entregue", v: data?.delivered },
            { l: "Faturado", v: data?.billed },
            { l: "Recebido", v: data?.received },
            { l: "Saldo em aberto", v: data?.open_balance },
          ].map((k) => (
            <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-lg font-bold">{brl(k.v)}</p></CardContent></Card>
          ))}
        </div>
      )}
    />
  );
}
