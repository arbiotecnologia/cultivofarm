import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, ExternalLink, Loader2, Plus, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccess } from "@/lib/permissions";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { CustomerFiscalGuide } from "@/components/fiscal/FiscalGuidePanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OSDetalhesDialog } from "@/components/ordens-servico/OSDetalhesDialog";
import { formatDateDisplay } from "@/lib/date-utils";
import { formatOS } from "@/lib/osLabel";
import { etapaFromStatus, osStatusInfo, prioridadeMap, STATUS_PIPELINE } from "@/lib/osStatus";

// Agrupamentos amigáveis para o filtro de status
const STATUS_GROUPS: { value: string; label: string; statuses: string[] }[] = [
  { value: "all", label: "Todos os status", statuses: [] },
  { value: "abertas", label: "Abertas", statuses: ["aberta", "aprovada", "programada"] },
  { value: "em_producao", label: "Em produção", statuses: ["em_producao", "em_cq"] },
  { value: "envasadas", label: "Envasadas", statuses: ["envase", "pronto_entrega"] },
  { value: "entregues", label: "Entregues", statuses: ["entregue"] },
  { value: "concluidas", label: "Concluídas", statuses: ["finalizada"] },
];

const OS_SELECT =
  "id, numero_os, origem, status, prioridade, data_programada, created_at, volume_total_ml, produtos(nome), microrganismos(nome), fazendas(nome), talhoes(nome)";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles = [] } = useAuth();
  const canFiscal = FEATURE_FLAGS.fiscalCustomerProfilesUi === true && roles.some((r) => canAccess(r, "/configuracoes/fiscal/clientes"));

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente-detalhe", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select(
          "id, nome, codigo_cliente, cpf_cnpj, tipo_pessoa, email, telefone, endereco_municipio, endereco_estado, status_cliente, fazendas(id, nome)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: ordens = [], isLoading: loadingOS } = useQuery({
    queryKey: ["cliente-ordens", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_servico")
        .select(OS_SELECT)
        .eq("cliente_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Cliente não encontrado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalOS = ordens.length;
  const abertas = ordens.filter((o: any) => !["finalizada", "entregue"].includes(o.status)).length;
  const concluidas = totalOS - abertas;
  const ultima = ordens[0]?.data_programada || ordens[0]?.created_at;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{cliente.nome}</h1>
              {cliente.codigo_cliente && (
                <Badge variant="outline" className="font-mono text-[10px]">{cliente.codigo_cliente}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {cliente.cpf_cnpj || "—"}
              {(cliente.endereco_municipio || cliente.endereco_estado) && (
                <> · {cliente.endereco_municipio}{cliente.endereco_estado ? `/${cliente.endereco_estado}` : ""}</>
              )}
              {cliente.status_cliente && <> · <span className="font-semibold">{cliente.status_cliente}</span></>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/clientes?aba=produtores`}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver no cadastro</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={`/ordens-servico?novo=1&cliente=${cliente.id}`}><Plus className="h-3.5 w-3.5 mr-1.5" /> Nova OS</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total de OS" value={totalOS} />
        <SummaryCard label="OS abertas" value={abertas} />
        <SummaryCard label="OS concluídas" value={concluidas} />
        <SummaryCard label="Última OS" value={ultima ? formatDateDisplay(ultima) : "—"} />
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Fazendas vinculadas ({(cliente.fazendas ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(cliente.fazendas ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma fazenda cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(cliente.fazendas as any[]).map((f) => (
                <Link key={f.id} to={`/fazendas/${f.id}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/70">
                    {f.nome}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canFiscal && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Guia Fiscal</CardTitle></CardHeader>
          <CardContent className="pt-0"><CustomerFiscalGuide customerId={cliente.id} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Ordens de Serviço relacionadas ({totalOS})</CardTitle>
          {loadingOS && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="pt-0 p-0 sm:p-6 sm:pt-0">
          <OSTable ordens={ordens} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

export function OSTable({ ordens, onOpen }: { ordens: any[]; onOpen?: (o: any) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_desc");
  const [selected, setSelected] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const handleOpen = (o: any) => {
    if (onOpen) onOpen(o);
    else {
      setSelected(o);
      setOpen(true);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ordens.length };
    for (const g of STATUS_GROUPS) {
      if (g.value === "all") continue;
      c[g.value] = ordens.filter((o) => g.statuses.includes(o.status)).length;
    }
    return c;
  }, [ordens]);

  const filtered = useMemo(() => {
    const g = STATUS_GROUPS.find((s) => s.value === statusFilter);
    const base = !g || g.value === "all" ? ordens : ordens.filter((o) => g.statuses.includes(o.status));
    const prioWeight: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    const cmpDate = (a: any, b: any, asc: boolean) => {
      const ta = a ? new Date(a).getTime() : NaN;
      const tb = b ? new Date(b).getTime() : NaN;
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return asc ? ta - tb : tb - ta;
    };
    const arr = [...base];
    switch (sortBy) {
      case "prioridade":
        arr.sort((a, b) => (prioWeight[a.prioridade] ?? 99) - (prioWeight[b.prioridade] ?? 99));
        break;
      case "created_asc": arr.sort((a, b) => cmpDate(a.created_at, b.created_at, true)); break;
      case "prevista_asc": arr.sort((a, b) => cmpDate(a.data_programada, b.data_programada, true)); break;
      case "prevista_desc": arr.sort((a, b) => cmpDate(a.data_programada, b.data_programada, false)); break;
      case "created_desc":
      default: arr.sort((a, b) => cmpDate(a.created_at, b.created_at, false)); break;
    }
    return arr;
  }, [ordens, statusFilter, sortBy]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_GROUPS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">
                  {g.label} ({counts[g.value] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc" className="text-xs">Mais recentes (criação)</SelectItem>
              <SelectItem value="created_asc" className="text-xs">Mais antigas (criação)</SelectItem>
              <SelectItem value="prevista_asc" className="text-xs">Data prevista ↑</SelectItem>
              <SelectItem value="prevista_desc" className="text-xs">Data prevista ↓</SelectItem>
              <SelectItem value="prioridade" className="text-xs">Prioridade (alta → baixa)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} de {ordens.length} OS
        </span>
      </div>


      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4">Nenhuma OS encontrada para o filtro selecionado.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Produto / Micro</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Etapa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const st = osStatusInfo(o.status);
              const et = etapaFromStatus(o.status);
              const prio = prioridadeMap[o.prioridade] || { label: o.prioridade, variant: "secondary" as const };
              return (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleOpen(o)}>
                  <TableCell className="font-mono-data text-xs font-semibold">{formatOS(o)}</TableCell>
                  <TableCell className="text-xs">{formatDateDisplay(o.data_programada || o.created_at)}</TableCell>
                  <TableCell className="text-xs">{o.produtos?.nome || o.microrganismos?.nome || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[o.fazendas?.nome, o.talhoes?.nome].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono-data text-xs">
                    {o.volume_total_ml ? `${(o.volume_total_ml / 1000).toFixed(1)} L` : "—"}
                  </TableCell>
                  <TableCell><Badge variant={prio.variant} className="text-[10px]">{prio.label}</Badge></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${et.color}`}>
                      {et.label}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <OSDetalhesDialog os={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
