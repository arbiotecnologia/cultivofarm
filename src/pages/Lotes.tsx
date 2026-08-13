import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { AuxiliaryScreenBanner } from "@/components/AuxiliaryScreenBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { formatDateDisplay } from "@/lib/date-utils";

interface Lote {
  id: string;
  codigo_lote: string;
  volume_produzido: number | null;
  data_producao: string;
  responsavel_producao: string | null;
  tanque: string | null;
  status: string;
  produto_id: string | null;
  microrganismo_id: string | null;
  programacao_id: string | null;
  produtos?: { nome: string } | null;
  microrganismos?: { nome: string; nome_cientifico: string | null } | null;
  partner_order_numero?: string | null;
  partner_nome?: string | null;
}

const statusMap: Record<string, { label: string; color: string }> = {
  em_producao: { label: "Em Produção", color: "bg-status-producao/15 text-status-producao border-status-producao/30" },
  aguardando_cq: { label: "Aguardando CQ", color: "bg-status-cq/15 text-status-cq border-status-cq/30" },
  aprovado: { label: "Aprovado", color: "bg-status-aprovado/15 text-status-aprovado border-status-aprovado/30" },
  reprovado: { label: "Reprovado", color: "bg-status-reprovado/15 text-status-reprovado border-status-reprovado/30" },
};

const microNome = (m: { nome: string; nome_cientifico: string | null } | null | undefined) => {
  if (!m) return "";
  const sp = m.nome_cientifico || "";
  return sp ? `${sp}${m.nome ? ` — ${m.nome}` : ""}` : m.nome;
};

const getItemNome = (l: Lote) => {
  if (l.produtos?.nome) return l.produtos.nome;
  if (l.microrganismos) return microNome(l.microrganismos);
  return "—";
};

export default function Lotes() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [envasePorLote, setEnvasePorLote] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const { enviarParaCQ } = useEsteiraLaboratorio();

  const fetchAll = async () => {
    // Filtro padrão: últimos 90 dias (lotes antigos permanecem acessíveis via busca/detalhe)
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: l }, { data: ev }] = await Promise.all([
      supabase.from("lotes").select("*, produtos(nome), microrganismos(nome, nome_cientifico)").gte("created_at", since90).order("created_at", { ascending: false }).limit(200),
      supabase.from("envase").select("lote_id, volume_por_unidade, quantidade").gte("created_at", since90),
    ]);

    if (l) {
      // Enrich each lote with partner_order info via programacao -> ordem_servico -> partner_orders
      const progIds = Array.from(new Set((l as any[]).map((x) => x.programacao_id).filter(Boolean)));
      let partnerByProg: Record<string, { numero: string; partner: string }> = {};
      if (progIds.length) {
        const { data: progs } = await supabase
          .from("programacao_producao")
          .select("id, ordem_servico_id, ordens_servico:ordem_servico_id(partner_order_id, partner_orders:partner_order_id(numero, partner_id, partner_accounts:partner_id(nome_fantasia, razao_social)))")
          .in("id", progIds);
        for (const p of (progs ?? []) as any[]) {
          const po = p.ordens_servico?.partner_orders;
          if (po) {
            partnerByProg[p.id] = {
              numero: po.numero,
              partner: po.partner_accounts?.nome_fantasia ?? po.partner_accounts?.razao_social ?? "",
            };
          }
        }
      }
      const enriched = (l as any[]).map((x) => {
        const info = x.programacao_id ? partnerByProg[x.programacao_id] : null;
        return {
          ...x,
          partner_order_numero: info?.numero ?? null,
          partner_nome: info?.partner ?? null,
        };
      });
      setLotes(enriched as Lote[]);
    }
    if (ev) {
      const map: Record<string, number> = {};
      for (const e of ev as any[]) {
        const v = Number(e.volume_por_unidade || 0) * Number(e.quantidade || 0);
        map[e.lote_id] = (map[e.lote_id] || 0) + v;
      }
      setEnvasePorLote(map);
    }
  };

  useEffect(() => {
    fetchAll();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fetchAll(); }, 1200);
    };
    const channel = supabase
      .channel("lotes-envase-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "lotes" }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "envase" }, debouncedFetch)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);


  const handleStatusChange = async (id: string, status: string) => {
    const lote = lotes.find(l => l.id === id);
    if (!lote?.programacao_id) return;

    const { data: prog } = await supabase
      .from("programacao_producao")
      .select("ordem_servico_id, ordem_servico_onfarm_id")
      .eq("id", lote.programacao_id)
      .single();

    if (!prog) return;

    const osId = prog.ordem_servico_onfarm_id || prog.ordem_servico_id;
    const origem = prog.ordem_servico_onfarm_id ? "onfarm" : "manual";

    if (status === "aguardando_cq") {
      if (osId) {
        await enviarParaCQ(lote.programacao_id, osId, origem);
        fetchAll();
        return;
      }
    }

    // Outros status técnicos podem ser alterados manualmente apenas por ADMIN
    const { error } = await supabase.from("lotes").update({ status: status as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status do lote atualizado!");
    fetchAll();
  };

  const filtered = lotes.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.codigo_lote.toLowerCase().includes(q) ||
      getItemNome(l).toLowerCase().includes(q) ||
      l.responsavel_producao?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <AuxiliaryScreenBanner
        title="Lotes — consulta e registros"
        description="A geração de lotes acontece dentro da esteira do Cockpit Laboratório, vinculada à OS em produção. Use esta tela para consulta, rastreabilidade e ações pontuais."
      />
      <PageHeader
        title="Lotes"
        description="Consulta e histórico de lotes produzidos"
        action={
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/cockpit-laboratorio")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Ir para o Cockpit
          </Button>
        }
      />

      <Card>
        <CardHeader className="p-3 sm:p-6 border-b sm:border-none">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input placeholder="Buscar lotes..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm h-11 sm:h-10 text-base sm:text-sm" />
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-3" : "p-0 sm:p-6 sm:pt-0"}>
          <ResponsiveTable
            mobileCards={
              filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Nenhum lote registrado</div>
              ) : (
                filtered.map((l) => {
                  const st = statusMap[l.status] || { label: l.status, color: "" };
                  const produzido = Number(l.volume_produzido || 0);
                  const envasado = envasePorLote[l.id] || 0;
                  const pct = produzido > 0 ? Math.min(100, Math.round((envasado / produzido) * 100)) : 0;
                  const isMicro = !!l.microrganismo_id;
                  return (
                    <MobileCard
                      key={l.id}
                      title={l.codigo_lote}
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {isMicro ? "Microrganismo" : "Produto"}
                          </Badge>
                          {getItemNome(l)}
                        </span> as any
                      }
                      status={<Badge variant="outline" className={cn("text-[10px]", st.color)}>{st.label}</Badge>}
                      content={[
                        { label: "Volume", value: produzido ? `${(produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` : "—" },
                        { label: "Envasado", value: produzido ? `${(envasado / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / ${(produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L (${pct}%)` : "—" },
                        { label: "Data", value: formatDateDisplay(l.data_producao) },
                        { label: "Tanque", value: l.tanque || "—" },
                        { label: "Resp.", value: l.responsavel_producao || "—" },
                      ]}
                      actions={l.status === "em_producao" && (
                        <Button className="w-full" size="sm" variant="outline" onClick={() => handleStatusChange(l.id, "aguardando_cq")}>
                          Enviar p/ Controle de Qualidade <ArrowRight className="ml-2 h-3 w-3" />
                        </Button>
                      )}
                    />
                  );
                })
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Envasado</TableHead>
                  <TableHead>Tanque</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum lote registrado</TableCell></TableRow>
                ) : filtered.map((l) => {
                  const st = statusMap[l.status] || { label: l.status, color: "" };
                  const produzido = Number(l.volume_produzido || 0);
                  const envasado = envasePorLote[l.id] || 0;
                  const saldo = produzido - envasado;
                  const pct = produzido > 0 ? Math.min(100, Math.round((envasado / produzido) * 100)) : 0;
                  const completo = produzido > 0 && saldo <= 0;
                  const isMicro = !!l.microrganismo_id;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono-data font-medium">{l.codigo_lote}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                            {isMicro ? "Micro" : "Produto"}
                          </Badge>
                          <span>{getItemNome(l)}</span>
                          {l.partner_order_numero && (
                            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[9px] px-1.5 py-0" variant="outline" title={l.partner_nome ?? ""}>
                              B2B · {l.partner_order_numero}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono-data">{produzido ? `${(produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` : "—"}</TableCell>
                      <TableCell className="min-w-[160px]">
                        {produzido > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs font-mono-data">
                              <span>{(envasado / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / {(produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</span>
                              {completo && <Badge variant="outline" className="text-[10px] bg-status-aprovado/15 text-status-aprovado border-status-aprovado/30">Completo</Badge>}
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full transition-all", completo ? "bg-status-aprovado" : "bg-primary")} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="font-mono-data">{l.tanque || "—"}</TableCell>
                      <TableCell>{l.responsavel_producao || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.color}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {l.status === "em_producao" && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(l.id, "aguardando_cq")}>
                            → Enviar p/ CQ
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ResponsiveTable>
        </CardContent>
      </Card>
    </div>
  );
}
