import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, ExternalLink, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/date-utils";
import { OSTable } from "@/pages/ClienteDetalhe";

const fmtBRL = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const OS_SELECT =
  "id, numero_os, origem, status, prioridade, data_programada, created_at, volume_total_ml, produtos(nome), microrganismos(nome), fazendas(nome), talhoes(nome), partner_orders!inner(partner_id, numero)";

export default function ParceiroDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: parceiro, isLoading } = useQuery({
    queryKey: ["parceiro-detalhe", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select(
          "id, codigo, razao_social, nome_fantasia, cnpj, partner_type, segmento, porte, ativo, commercial_city, commercial_state, email_comercial, telefone_comercial, partner_contacts(id, nome, cargo, email, telefone, is_principal)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: pedidos = [], isLoading: loadingPed } = useQuery({
    queryKey: ["parceiro-pedidos", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_orders")
        .select("id, numero, status, total, created_at, estimated_delivery_date")
        .eq("partner_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ordens = [], isLoading: loadingOS } = useQuery({
    queryKey: ["parceiro-ordens", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_servico")
        .select(OS_SELECT)
        .eq("partner_orders.partner_id", id!)
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

  if (!parceiro) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Parceiro não encontrado.</CardContent>
        </Card>
      </div>
    );
  }

  const totalPedidos = pedidos.length;
  const pedidosAbertos = pedidos.filter((p: any) => !["entregue", "cancelado", "finalizado"].includes(p.status)).length;
  const valorTotal = pedidos.reduce((s: number, p: any) => s + (Number(p.total) || 0), 0);
  const ticketMedio = totalPedidos ? valorTotal / totalPedidos : 0;
  const osAbertas = ordens.filter((o: any) => !["finalizada", "entregue"].includes(o.status)).length;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">{parceiro.nome_fantasia || parceiro.razao_social}</h1>
              {parceiro.codigo && (
                <Badge variant="outline" className="font-mono text-[10px]">{parceiro.codigo}</Badge>
              )}
              <Badge variant={parceiro.ativo ? "secondary" : "destructive"} className="text-[10px]">
                {parceiro.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {parceiro.razao_social}
              {parceiro.cnpj && <> · {parceiro.cnpj}</>}
              {(parceiro.commercial_city || parceiro.commercial_state) && (
                <> · {parceiro.commercial_city}{parceiro.commercial_state ? `/${parceiro.commercial_state}` : ""}</>
              )}
              {parceiro.segmento && <> · {parceiro.segmento}</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/clientes?aba=parceiros"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver no cadastro</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/comercial/pedidos-b2b"><Plus className="h-3.5 w-3.5 mr-1.5" /> Novo pedido</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Pedidos B2B" value={totalPedidos} />
        <SummaryCard label="Pedidos abertos" value={pedidosAbertos} />
        <SummaryCard label="OS abertas" value={osAbertas} />
        <SummaryCard label="Valor acumulado" value={fmtBRL(valorTotal)} />
        <SummaryCard label="Ticket médio" value={fmtBRL(ticketMedio)} />
      </div>

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Pedidos B2B ({totalPedidos})</CardTitle>
          {loadingPed && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="pt-0 p-0 sm:p-6 sm:pt-0">
          {pedidos.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">Nenhum pedido registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entrega prev.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p: any) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/comercial/pedidos-b2b?focus=${p.id}`)}
                  >
                    <TableCell className="font-mono-data text-xs font-semibold">{p.numero}</TableCell>
                    <TableCell className="text-xs">{formatDateDisplay(p.created_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{p.status}</Badge></TableCell>
                    <TableCell className="text-xs">{p.estimated_delivery_date ? formatDateDisplay(p.estimated_delivery_date) : "—"}</TableCell>
                    <TableCell className="text-right font-mono-data text-xs">{fmtBRL(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Ordens de Serviço B2B ({ordens.length})</CardTitle>
          {loadingOS && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="pt-0 p-0 sm:p-6 sm:pt-0">
          <OSTable ordens={ordens} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Contatos ({(parceiro.partner_contacts ?? []).length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(parceiro.partner_contacts ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum contato cadastrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(parceiro.partner_contacts as any[]).map((c) => (
                <div key={c.id} className="border rounded-md p-2 text-xs">
                  <div className="font-semibold flex items-center gap-1.5">
                    {c.nome}
                    {c.is_principal && <Badge variant="secondary" className="text-[9px]">Principal</Badge>}
                  </div>
                  {c.cargo && <div className="text-muted-foreground">{c.cargo}</div>}
                  <div className="text-muted-foreground mt-0.5">
                    {[c.email, c.telefone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
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
