import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Copy, RefreshCw, AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const ENTITIES = ["accounts_receivable", "accounts_payable", "receivable_payments", "payable_payments", "financial_documents", "recurring_financial_templates", "fiscal_invoices"];

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  baixa: "secondary",
  media: "outline",
  alta: "default",
  critica: "destructive",
};

export default function AuditoriaFinanceira() {
  return (
    <div className="space-y-4">
      <PageHeader title="Auditoria financeira" description="Eventos auditados e diagnóstico de inconsistências" />
      <Tabs defaultValue="eventos">
        <TabsList>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="inconsistencias">Inconsistências</TabsTrigger>
        </TabsList>
        <TabsContent value="eventos" className="space-y-4 mt-4">
          <EventosTab />
        </TabsContent>
        <TabsContent value="inconsistencias" className="space-y-4 mt-4">
          <InconsistenciasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EventosTab() {
  const [ent, setEnt] = useState("ALL");
  const [q, setQ] = useState("");

  const { data: logs = [] } = useQuery({
    queryKey: ["fin-audit", ent],
    queryFn: async () => {
      // Filtro padrão: últimos 30 dias (auditoria antiga acessível via drill-down específico)
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let qry = supabase.from("financial_audit_log").select("id, entity_type, entity_id, action, performed_at, performed_by, details").gte("performed_at", since30).order("performed_at", { ascending: false }).limit(200);
      if (ent !== "ALL") qry = qry.eq("entity_type", ent);
      const { data, error } = await qry;
      if (error) throw error; return data;
    },
    staleTime: 60_000,
  });


  const filtered = logs.filter((l: any) => !q || (l.entity_id || "").includes(q));

  return (
    <>
      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Select value={ent} onValueChange={setEnt}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as entidades</SelectItem>
            {ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Filtrar por ID" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Entidade</TableHead><TableHead>ID</TableHead><TableHead>Ação</TableHead><TableHead>Usuário</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem registros</TableCell></TableRow> :
              filtered.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{formatDateTimeDisplay(l.performed_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs">{(l.entity_id || "").slice(0, 8)}</TableCell>
                  <TableCell><Badge variant={l.action === "DELETE" ? "destructive" : l.action === "INSERT" ? "default" : "secondary"}>{l.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{(l.performed_by || "").slice(0, 8) || "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}

type Inconsistencia = {
  code: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  description: string;
  recommended_action: string;
};

function InconsistenciasTab() {
  const [sev, setSev] = useState("ALL");

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fin-inconsistencias"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_financial_inconsistencies" as any);
      if (error) throw error;
      return (data || []) as Inconsistencia[];
    },
  });

  const filtered = sev === "ALL" ? data : data.filter((d) => d.severity === sev);

  const counts = data.reduce((acc, d) => { acc[d.severity] = (acc[d.severity] || 0) + 1; return acc; }, {} as Record<string, number>);

  const exportCsv = () => {
    const rows = [["codigo", "gravidade", "entidade", "id", "descricao", "acao_recomendada"]];
    filtered.forEach((d) => rows.push([d.code, d.severity, d.entity_type, d.entity_id, d.description, d.recommended_action]));
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inconsistencias-financeiras-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <AlertaAutomaticoBanner />
      <Card><CardContent className="p-4 flex flex-wrap items-center gap-3">
        <Select value={sev} onValueChange={setSev}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as gravidades</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="destructive">Crítica {counts.critica || 0}</Badge>
          <Badge>Alta {counts.alta || 0}</Badge>
          <Badge variant="outline">Média {counts.media || 0}</Badge>
          <Badge variant="secondary">Baixa {counts.baixa || 0}</Badge>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Reprocessar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</Button>
        </div>
      </CardContent></Card>

      {data.length === 0 && !isLoading && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma inconsistência detectada. ✅
        </CardContent></Card>
      )}

      {filtered.length > 0 && (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Gravidade</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Ação recomendada</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((d, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[d.severity] || "secondary"} className="capitalize">{d.severity}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="font-mono text-xs">{d.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs">{(d.entity_id || "").slice(0, 8)}</TableCell>
                  <TableCell className="text-sm max-w-md">{d.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">{d.recommended_action}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(d.entity_id); toast.success("ID copiado"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {isLoading && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
          Analisando inconsistências…
        </CardContent></Card>
      )}
    </>
  );
}

type AlertaAutomatico = {
  id: string;
  run_at: string;
  total_count: number;
  by_severity: Record<string, number>;
  status: "open" | "ack";
  acked_at: string | null;
};

function AlertaAutomaticoBanner() {
  const qc = useQueryClient();
  const { data: alerta } = useQuery({
    queryKey: ["fin-inconsistency-alert-open"],
    queryFn: async (): Promise<AlertaAutomatico | null> => {
      const { data, error } = await supabase
        .from("financial_inconsistency_alerts" as never)
        .select("id, run_at, total_count, by_severity, status, acked_at")
        .eq("status", "open")
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as AlertaAutomatico | null) ?? null;
    },
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("financial_inconsistency_alerts" as never)
        .update({ status: "ack", acked_at: new Date().toISOString(), acked_by: u.user?.id ?? null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta reconhecido");
      qc.invalidateQueries({ queryKey: ["fin-inconsistency-alert-open"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao reconhecer"),
  });

  if (!alerta) return null;

  const sev = alerta.by_severity ?? {};
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 flex flex-wrap items-center gap-3">
        <BellRing className="h-5 w-5 text-destructive shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">
            Alerta automático: {alerta.total_count} inconsistência(s) detectada(s) em {formatDateTimeDisplay(alerta.run_at)}
          </p>
          <p className="text-xs text-muted-foreground">
            Crítica {sev.critica ?? 0} • Alta {sev.alta ?? 0} • Média {sev.media ?? 0} • Baixa {sev.baixa ?? 0}
          </p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto" disabled={ack.isPending} onClick={() => ack.mutate(alerta.id)}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Reconhecer
        </Button>
      </CardContent>
    </Card>
  );
}
