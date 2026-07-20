import { useState } from "react";
import { useConsolidatedDashboard } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl as fmt } from "@/lib/financial/format";

export default function DashboardConsolidadoB2B() {
  const today = new Date().toISOString().slice(0, 10);
  const thirty = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(thirty);
  const [to, setTo] = useState(today);
  const [partnerType, setPartnerType] = useState<string>("all");
  const [region, setRegion] = useState<string>("");

  const { data, isLoading } = useConsolidatedDashboard({
    from, to,
    partner_type: partnerType === "all" ? undefined : partnerType,
    region: region || undefined,
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Comercial B2B Consolidado</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada do módulo Comercial B2B.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tipo de parceiro</label>
            <Select value={partnerType} onValueChange={setPartnerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="distribuidor">Distribuidor</SelectItem>
                <SelectItem value="revenda">Revenda</SelectItem>
                <SelectItem value="cooperativa">Cooperativa</SelectItem>
                <SelectItem value="produtor_parceiro">Produtor Parceiro</SelectItem>
                <SelectItem value="canal_estrategico">Canal Estratégico</SelectItem>
                <SelectItem value="representante">Representante</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Região</label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="ex: Sul" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : data && (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            <Kpi label="Parceiros Ativos" value={String(data.parceiros_ativos ?? 0)} />
            <Kpi label="Parceiros Inativos" value={String(data.parceiros_inativos ?? 0)} />
            <Kpi label="Novos no Período" value={String(data.parceiros_novos ?? 0)} />
            <Kpi label="Receita Aprovada" value={fmt(data.receita_aprovada ?? 0)} highlight />
            <Kpi label="Receita Entregue" value={fmt(data.receita_entregue ?? 0)} highlight />
            <Kpi label="Receita Faturada" value={fmt(data.receita_faturada ?? 0)} highlight />
            <Kpi label="Pedidos em Ajuste" value={String(data.pedidos_em_ajuste ?? 0)} />
            <Kpi label="Aguardando Aprovação" value={String(data.pedidos_aguardando_aprovacao ?? 0)} />
            <Kpi label="Campanhas Ativas" value={String(data.campanhas_ativas ?? 0)} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-2xl mt-1">{value}</div>
    </div>
  );
}
