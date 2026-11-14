import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmbalagemEstoqueCard, Embalagem, EmbalagemAction } from "@/components/estoque/EmbalagemEstoqueCard";
import { ConferenciaEmbalagemQR } from "@/components/estoque/ConferenciaEmbalagemQR";
import { ReservarEmbalagemEntregaDialog } from "@/components/estoque/ReservarEmbalagemEntregaDialog";
import { MotivoEmbalagemDialog } from "@/components/estoque/MotivoEmbalagemDialog";
import { VincularEtiquetaEmbalagemDialog } from "@/components/estoque/VincularEtiquetaEmbalagemDialog";
import { GerarEtiquetaEmbalagemDialog } from "@/components/estoque/GerarEtiquetaEmbalagemDialog";
import { GerarEtiquetasLoteDialog } from "@/components/estoque/GerarEtiquetasLoteDialog";
import { useToast } from "@/hooks/use-toast";
import { Package } from "lucide-react";

const STATUSES = ["em_estoque","reservado","separado","entregue","cancelado","descartado","vencido","bloqueado_cq","bloqueado_operacional"];

export default function EstoqueEmbalagens() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<Embalagem[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [busca, setBusca] = useState("");
  const [semEtiqueta, setSemEtiqueta] = useState(false);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [selected, setSelected] = useState<Embalagem | null>(null);
  const [reservarOpen, setReservarOpen] = useState(false);
  const [gerarEtiquetaOpen, setGerarEtiquetaOpen] = useState(false);
  const [vincularExistenteOpen, setVincularExistenteOpen] = useState(false);
  const [loteEtiquetasOpen, setLoteEtiquetasOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [descartarOpen, setDescartarOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("estoque_embalagens").select("*").order("created_at", { ascending: false }).limit(500);
    if (status !== "all") q = q.eq("status", status);
    if (semEtiqueta) q = q.is("etiqueta_id", null);
    if (busca) q = q.ilike("codigo_embalagem", `%${busca}%`);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, semEtiqueta]);

  const resumo = useMemo(() => {
    const r: Record<string, number> = {};
    items.forEach((i) => { r[i.status] = (r[i.status] ?? 0) + 1; });
    r.sem_etiqueta = items.filter((i) => !i.etiqueta_id).length;
    const hoje = new Date();
    r.vencidas = items.filter((i) => i.validade_em && new Date(i.validade_em) < hoje).length;
    return r;
  }, [items]);

  const handleAction = async (action: EmbalagemAction, e: Embalagem) => {
    setSelected(e);
    switch (action) {
      case "etiqueta":
        if (e.etiqueta_id) {
          navigate(`/etiquetas/${e.etiqueta_id}/imprimir`);
        } else {
          toast({ title: "Sem etiqueta vinculada" });
        }
        break;
      case "gerar_etiqueta":
        setGerarEtiquetaOpen(true);
        break;
      case "vincular_existente":
        setVincularExistenteOpen(true);
        break;
      case "rastrear":
        if (e.etiqueta_id) {
          // Buscar trace_token e abrir página pública
          (async () => {
            const { data } = await (supabase as any)
              .from("produto_etiquetas")
              .select("trace_token")
              .eq("id", e.etiqueta_id)
              .maybeSingle();
            if (data?.trace_token) {
              window.open(`/rastrear-produto/${data.trace_token}`, "_blank");
            } else {
              toast({ title: "Sem token de rastreio" });
            }
          })();
        }
        break;
      case "qr":
        try {
          await navigator.clipboard.writeText(e.codigo_embalagem);
          toast({ title: "Código copiado", description: e.codigo_embalagem });
        } catch {
          toast({ title: e.codigo_embalagem });
        }
        break;
      case "reservar":
        setReservarOpen(true);
        break;
      case "cancelar":
        setCancelarOpen(true);
        break;
      case "descartar":
        setDescartarOpen(true);
        break;
    }
  };

  const runMotivoRpc = async (rpc: string, motivo: string, closer: (o: boolean) => void) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const { error } = await (supabase as any).rpc(rpc, { p_embalagem_id: selected.id, p_motivo: motivo });
      if (error) throw error;
      toast({ title: "Operação registrada" });
      closer(false);
      await load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 min-w-0">
        <Package className="h-6 w-6 shrink-0" />
        <h1 className="text-xl sm:text-2xl font-semibold truncate">Estoque por embalagem</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {["em_estoque","reservado","separado","entregue","cancelado","sem_etiqueta","vencidas"].map((k) => (
          <Card key={k}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground capitalize">{k.replace(/_/g," ")}</div>
              <div className="text-2xl font-bold">{resumo[k] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input placeholder="Buscar código" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={semEtiqueta ? "default" : "outline"} onClick={() => setSemEtiqueta((v) => !v)}>
            Sem etiqueta
          </Button>
          <Button onClick={load} disabled={loading}>Atualizar</Button>
          <Button
            variant="secondary"
            className="sm:col-span-4"
            onClick={() => setLoteEtiquetasOpen(true)}
            disabled={loading || !items.some((i) => !i.etiqueta_id)}
          >
            Gerar etiquetas em lote (1 por embalagem)
          </Button>
        </CardContent>
      </Card>

      <GerarEtiquetasLoteDialog
        open={loteEtiquetasOpen}
        onOpenChange={setLoteEtiquetasOpen}
        embalagens={items.map((i) => ({
          id: i.id,
          lote_id: i.lote_id,
          codigo_embalagem: i.codigo_embalagem,
          etiqueta_id: i.etiqueta_id,
        }))}
        onDone={load}
      />

      <ConferenciaEmbalagemQR />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((e) => <EmbalagemEstoqueCard key={e.id} embalagem={e} onAction={handleAction} />)}
        {!items.length && !loading && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhuma embalagem encontrada.</p>
        )}
      </div>

      {selected && (
        <>
          <ReservarEmbalagemEntregaDialog
            open={reservarOpen}
            onOpenChange={setReservarOpen}
            embalagemId={selected.id}
            onDone={load}
          />
          <GerarEtiquetaEmbalagemDialog
            open={gerarEtiquetaOpen}
            onOpenChange={setGerarEtiquetaOpen}
            embalagemId={selected.id}
            onDone={load}
          />
          <VincularEtiquetaEmbalagemDialog
            open={vincularExistenteOpen}
            onOpenChange={setVincularExistenteOpen}
            embalagemId={selected.id}
            onDone={load}
          />
          <MotivoEmbalagemDialog
            open={cancelarOpen}
            onOpenChange={setCancelarOpen}
            title="Cancelar embalagem"
            description={`Cancelar a embalagem ${selected.codigo_embalagem}. Esta ação registra motivo e auditoria.`}
            confirmLabel="Cancelar embalagem"
            loading={actionLoading}
            onConfirm={(m) => runMotivoRpc("rpc_cancelar_embalagem", m, setCancelarOpen)}
          />
          <MotivoEmbalagemDialog
            open={descartarOpen}
            onOpenChange={setDescartarOpen}
            title="Descartar embalagem"
            description={`Descartar a embalagem ${selected.codigo_embalagem}. Esta ação registra motivo e auditoria.`}
            confirmLabel="Descartar embalagem"
            loading={actionLoading}
            onConfirm={(m) => runMotivoRpc("rpc_descartar_embalagem", m, setDescartarOpen)}
          />
        </>
      )}
    </div>
  );
}
