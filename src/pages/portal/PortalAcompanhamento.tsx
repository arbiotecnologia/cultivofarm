import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, FlaskConical, Truck, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { formatDateDisplay } from "@/lib/date-utils";
import PortalOrdensServico from "./PortalOrdensServico";
import PortalProducao from "./PortalProducao";
import PortalEntregas from "./PortalEntregas";
import {
  labelOS,
  labelProducao,
  labelEntrega,
  OS_STATUS_FINAL,
  PRODUCAO_STATUS_FINAL,
  ENTREGA_STATUS_FINAL,
} from "@/lib/portal/statusAcompanhamento";

type TabId = "ordens-servico" | "producao" | "entregas" | "historico";
const VALID_TABS: TabId[] = ["ordens-servico", "producao", "entregas", "historico"];

type HistoricoItem = {
  id: string;
  tipo: "OS" | "Produção" | "Entrega";
  titulo: string;
  status: string;
  statusLabel: string;
  data: string | null;
  fazenda?: string | null;
  produto?: string | null;
};

function HistoricoTab() {
  const { clienteId, loading: cl } = usePortalCliente();
  const [items, setItems] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<string>("todos");
  const [fazenda, setFazenda] = useState<string>("todas");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!clienteId) return;
    (async () => {
      setLoading(true);
      const osFinal = Array.from(OS_STATUS_FINAL) as any[];
      const prodFinal = Array.from(PRODUCAO_STATUS_FINAL) as any[];
      const entFinal = Array.from(ENTREGA_STATUS_FINAL) as any[];


      const [osM, osOF, entregas] = await Promise.all([
        supabase
          .from("ordens_servico")
          .select("id, numero_os, status, updated_at, created_at, fazendas(nome), produtos(nome)")
          .eq("cliente_id", clienteId)
          .in("status", osFinal),
        supabase
          .from("ordens_servico_onfarm")
          .select("id, numero_os, status, updated_at, created_at, fazendas(nome), produtos(nome)")
          .eq("cliente_id", clienteId)
          .in("status", osFinal),
        supabase
          .from("entregas")
          .select("id, status, data_saida, created_at, ordens_servico(numero_os, produtos(nome))")
          .eq("cliente_id", clienteId)
          .in("status", entFinal),
      ]);

      const osIdsManual = (osM.data ?? []).map((o: any) => o.id);
      const osIdsOnfarm = (osOF.data ?? []).map((o: any) => o.id);
      let producao: any[] = [];
      if (osIdsManual.length || osIdsOnfarm.length) {
        const filters: string[] = [];
        if (osIdsManual.length) filters.push(`ordem_servico_id.in.(${osIdsManual.join(",")})`);
        if (osIdsOnfarm.length) filters.push(`ordem_servico_onfarm_id.in.(${osIdsOnfarm.join(",")})`);
        const { data } = await supabase
          .from("programacao_producao")
          .select("id, status, data_programada, created_at, produtos(nome), microrganismos(nome)")
          .or(filters.join(","))
          .in("status", prodFinal);
        producao = data ?? [];
      }

      const merged: HistoricoItem[] = [
        ...(osM.data ?? []).map((o: any) => ({
          id: `os-${o.id}`,
          tipo: "OS" as const,
          titulo: o.numero_os ?? "OS",
          status: o.status,
          statusLabel: labelOS(o.status),
          data: o.updated_at ?? o.created_at,
          fazenda: o.fazendas?.nome ?? null,
          produto: o.produtos?.nome ?? null,
        })),
        ...(osOF.data ?? []).map((o: any) => ({
          id: `osf-${o.id}`,
          tipo: "OS" as const,
          titulo: o.numero_os ?? "OS de Produção",
          status: o.status,
          statusLabel: labelOS(o.status),
          data: o.updated_at ?? o.created_at,
          fazenda: o.fazendas?.nome ?? null,
          produto: o.produtos?.nome ?? null,
        })),
        ...producao.map((p: any) => ({
          id: `prod-${p.id}`,
          tipo: "Produção" as const,
          titulo: p.produtos?.nome ?? p.microrganismos?.nome ?? "Bioinsumo",
          status: p.status,
          statusLabel: labelProducao(p.status),
          data: p.data_programada ?? p.created_at,
          produto: p.produtos?.nome ?? p.microrganismos?.nome ?? null,
        })),
        ...(entregas.data ?? []).map((e: any) => ({
          id: `ent-${e.id}`,
          tipo: "Entrega" as const,
          titulo: e.ordens_servico?.numero_os ?? "Entrega",
          status: e.status,
          statusLabel: labelEntrega(e.status),
          data: e.data_saida ?? e.created_at,
          produto: e.ordens_servico?.produtos?.nome ?? null,
        })),
      ];

      merged.sort((a, b) => new Date(b.data ?? 0).getTime() - new Date(a.data ?? 0).getTime());
      setItems(merged);
      setLoading(false);
    })();
  }, [clienteId]);

  const fazendas = Array.from(new Set(items.map((i) => i.fazenda).filter(Boolean))) as string[];
  const filtered = items.filter((i) => {
    if (tipo !== "todos" && i.tipo !== tipo) return false;
    if (fazenda !== "todas" && i.fazenda !== fazenda) return false;
    if (busca && !(`${i.titulo} ${i.produto ?? ""}`.toLowerCase().includes(busca.toLowerCase()))) return false;
    return true;
  });

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Buscar por número ou produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="OS">Ordens de Serviço</SelectItem>
            <SelectItem value="Produção">Produção</SelectItem>
            <SelectItem value="Entrega">Entregas</SelectItem>
          </SelectContent>
        </Select>
        {fazendas.length > 0 && (
          <Select value={fazenda} onValueChange={setFazenda}>
            <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as fazendas</SelectItem>
              {fazendas.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12 border border-dashed rounded-lg">
          Nenhum item finalizado no período.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <Card key={i.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>
                    <span className="font-semibold truncate">{i.titulo}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    {i.produto && <span>{i.produto}</span>}
                    {i.fazenda && <span>📍 {i.fazenda}</span>}
                    {i.data && <span>📅 {formatDateDisplay(i.data)}</span>}
                  </div>
                </div>
                <Badge>{i.statusLabel}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalAcompanhamento() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const active: TabId = (VALID_TABS as string[]).includes(raw ?? "")
    ? (raw as TabId)
    : "ordens-servico";
  const highlightedOsId = searchParams.get("os");
  const highlightedOnfarmOsId = searchParams.get("os_onfarm");

  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "ordens-servico") next.delete("tab");
    else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Acompanhamento</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe suas ordens de serviço, a produção dos bioinsumos, entregas e histórico.
        </p>
      </div>

      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="ordens-servico" className="gap-1">
            <ClipboardList className="h-4 w-4" /> Ordens de Serviço
          </TabsTrigger>
          <TabsTrigger value="producao" className="gap-1">
            <FlaskConical className="h-4 w-4" /> Produção
          </TabsTrigger>
          <TabsTrigger value="entregas" className="gap-1">
            <Truck className="h-4 w-4" /> Entregas
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1">
            <History className="h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ordens-servico" className="mt-4">
          <PortalOrdensServico
            embedded
            highlightedOsId={highlightedOsId}
            highlightedOnfarmOsId={highlightedOnfarmOsId}
          />
        </TabsContent>
        <TabsContent value="producao" className="mt-4">
          <PortalProducao
            embedded
            highlightedOsId={highlightedOsId}
            highlightedOnfarmOsId={highlightedOnfarmOsId}
          />
        </TabsContent>
        <TabsContent value="entregas" className="mt-4">
          <PortalEntregas embedded />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

