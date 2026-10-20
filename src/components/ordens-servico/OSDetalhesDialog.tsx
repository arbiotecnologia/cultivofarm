import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RastreabilidadeProducaoTab, type TraceItem } from "./RastreabilidadeProducaoTab";
import { GerarLoteDialog, type GerarLoteTarget } from "@/components/cockpit/GerarLoteDialog";
import { formatOS } from "@/lib/osLabel";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Check, FlaskConical, History } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Canonical client schema snapshot predates this installed, closed RPC.
// Narrow only its existing audited signature; no second client or broad any.
const approveOSRPC = supabase.rpc.bind(supabase) as unknown as (
  name: "rpc_aprovar_os_v1", args: { p_os_id: string; p_origem: string },
) => ReturnType<typeof supabase.rpc>;

const programOSRPC = supabase.rpc.bind(supabase) as unknown as (
  name: "rpc_programar_os_v1", args: { p_os_id: string; p_origem: string; p_data_programada: string },
) => ReturnType<typeof supabase.rpc>;

export const MANUAL_LOT_GENERATION_REVIEWED = true;

interface Props {
  os: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing list reader refresh; called only after a confirmed, still-current write. */
  onChanged?: () => void;
}

export function OSDetalhesDialog({ os, open, onOpenChange, onChanged }: Props) {
  const { roles = [] } = useAuth();
  const access = useStorageAccessScope(JSON.stringify(["os-approval", os?.id, os?.origem, open]));
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [programmedId, setProgrammedId] = useState<string | null>(null);
  const [programDate, setProgramDate] = useState("");
  const [traceRefresh, setTraceRefresh] = useState(0);
  const [trace, setTrace] = useState<TraceItem | null>(null);
  const [loteTarget, setLoteTarget] = useState<GerarLoteTarget | null>(null);
  const onTrace = useCallback((item: TraceItem | null) => setTrace(item), []);
  const programOrigin = ["onfarm", "on_farm", "ordem_servico_onfarm"].includes(os?.origem) ? "onfarm" :
    ["manual", "os", "ordem_servico"].includes(os?.origem) ? "manual" : null;
  useEffect(() => { setApprovedId(null); setProgrammedId(null); setProgramDate(""); setSaving(false); setLoteTarget(null); setTrace(null); }, [os?.id, open, access.scope]);
  // Gerar Lote: somente exibição; o servidor revalida tudo. Baseado na leitura canônica atual da OS.
  const canGenerateLot = MANUAL_LOT_GENERATION_REVIEWED && !!os && open && access.ready && programOrigin === "manual" &&
    !os.partner_order_id && !os.partner_order_item_id && !!trace && trace.os_id === os.id &&
    trace.origem_os === "manual" && trace.status_os === "programada" && !trace.codigo_lote && !trace.lote_id && !!trace.data_programada &&
    typeof trace.programacao_id === "string" && !!trace.programacao_id &&
    roles.some((role) => role === "administrador" || role === "gestor" || role === "producao");
  const openLot = () => {
    if (!canGenerateLot || !trace?.programacao_id) return;
    setLoteTarget({
      programacao_id: trace.programacao_id, os_id: os.id, origem: "manual", numero_os: trace.numero_os ?? os.numero_os,
      produto_id: os.produto_id ?? null, microrganismo_id: os.microrganismo_id ?? null,
      produto_nome: (os.produtos as any)?.nome ?? (os.microrganismos as any)?.nome,
      volume_solicitado: typeof trace.volume_solicitado_l === "number" && Number.isFinite(trace.volume_solicitado_l) ? trace.volume_solicitado_l : undefined,
    });
  };
  const canProgram = !!os && open && access.ready && programOrigin === "manual" &&
    !os.partner_order_id && !os.partner_order_item_id && programmedId !== os.id &&
    (os.status === "aprovada" || approvedId === os.id) &&
    roles.some((role) => role === "administrador" || role === "gestor" || role === "producao");
  const program = async () => {
    if (!canProgram || !programOrigin || pending.current || !/^\d{4}-\d{2}-\d{2}$/.test(programDate)) return;
    const current = access.capture();
    const id = os.id;
    const date = programDate;
    pending.current = true;
    setSaving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const { data, error } = await programOSRPC("rpc_programar_os_v1", {
        p_os_id: id, p_origem: programOrigin, p_data_programada: date,
      }).abortSignal(controller.signal);
      if (!current()) return;
      if (error || !data || typeof data !== "object" || Array.isArray(data) ||
        !("success" in data) || data.success !== true || !("status" in data) || data.status !== "programada") {
        toast.error("Não foi possível programar a OS. Confira sua autorização e a programação existente.");
        return;
      }
      setProgrammedId(id);
      setProgramDate("");
      toast.success("OS programada. Fabricação não iniciada.");
      setTraceRefresh((value) => value + 1);
      onChanged?.();
    } catch {
      if (current()) toast.error("Programação não confirmada. Consulte a OS antes de tentar novamente.");
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      if (current()) setSaving(false);
    }
  };
  const approve = async () => {
    if (!os || !open || pending.current || !access.ready ||
      !roles.some((role) => role === "administrador" || role === "gestor") ||
      os.status !== "aberta" || os.origem === "b2b" || os.partner_order_id || os.partner_order_item_id) return;
    const current = access.capture();
    const id = os.id;
    pending.current = true;
    setSaving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const { data, error } = await approveOSRPC("rpc_aprovar_os_v1", {
        p_os_id: id, p_origem: os.origem === "onfarm" ? "onfarm" : "manual",
      }).abortSignal(controller.signal);
      if (!current()) return;
      if (error || !data || typeof data !== "object" || Array.isArray(data) ||
        !("success" in data) || data.success !== true || !("status" in data) || data.status !== "aprovada") {
        toast.error("Não foi possível aprovar a OS. Verifique sua autorização e a programação vinculada.");
        return;
      }
      setApprovedId(id);
      toast.success("OS aprovada.");
      setTraceRefresh((value) => value + 1);
      onChanged?.();
    } catch {
      if (current()) toast.error("Não foi possível confirmar a aprovação. Consulte a OS antes de tentar novamente.");
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      if (current()) setSaving(false);
    }
  };
  if (!os) return null;

  const partner = (os as any)?.partner_orders?.partner_accounts;
  const partnerNome = partner?.nome_fantasia || partner?.razao_social;
  const partnerNumero = (os as any)?.partner_orders?.numero;
  const clienteNome = (os.clientes as any)?.nome;
  const fazenda = (os.fazendas as any)?.nome;
  const talhao = (os.talhoes as any)?.nome;
  const isB2B = !clienteNome && !!partnerNome;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 sm:p-0">
        <DialogHeader className="p-4 sm:p-6 pb-2 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold flex flex-wrap items-center gap-2">
                Ordem de Serviço: <span className="font-mono text-primary">{formatOS(os)}</span>
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {isB2B
                  ? `Parceiro B2B: ${partnerNome}${partnerNumero ? ` · Pedido ${partnerNumero}` : ""}`
                  : `${clienteNome || "—"} · ${fazenda || "—"} / ${talhao || "—"}`}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6">
                {os.origem === 'onfarm' ? 'Visita Técnica' : 'Manual'}
              </Badge>
              <Badge className="h-6 bg-primary/10 text-primary border-primary/20">
                {(programmedId === os.id ? "programada" : approvedId === os.id ? "aprovada" : os.status || "Não informado").replace(/_/g, ' ').toUpperCase()}
              </Badge>
              {os.status === "aberta" && approvedId !== os.id && os.origem !== "b2b" && !os.partner_order_id && !os.partner_order_item_id &&
                roles.some((role) => role === "administrador" || role === "gestor") && (
                <Button onClick={() => void approve()} disabled={saving || !access.ready}>
                  <Check className="h-4 w-4 mr-2" />Aprovar OS
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {canProgram && (
          <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 border-b">
            <div className="space-y-1">
              <Label htmlFor="os-program-date">Data programada</Label>
              <Input id="os-program-date" type="date" value={programDate} disabled={saving}
                onChange={(event) => setProgramDate(event.target.value)} className="w-44" />
            </div>
            <Button onClick={() => void program()} disabled={saving || !programDate}>
              <CalendarCheck className="h-4 w-4 mr-2" />Programar OS
            </Button>
          </div>
        )}

        {canGenerateLot && (
          <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-b">
            <Button onClick={openLot} disabled={saving}>
              <FlaskConical className="h-4 w-4 mr-2" />Gerar lote
            </Button>
            <p className="text-xs text-muted-foreground">Registra o lote de produção; não inicia controle de qualidade, envase nem estoque.</p>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="rastreabilidade" className="h-full flex flex-col">
            <div className="px-4 sm:px-6 border-b bg-muted/20">
              <TabsList className="h-12 w-full justify-start bg-transparent gap-6 p-0">
                <TabsTrigger 
                  value="rastreabilidade" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 flex items-center gap-2 text-sm font-bold"
                >
                  <History className="h-4 w-4" />
                  Rastreabilidade da Produção
                </TabsTrigger>
                {/* 
                Reservado para futuras abas de detalhes da OS como:
                - Detalhes Técnicos
                - Financeiro
                - Fotos / Arquivos
                */}
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden px-4 sm:px-6 py-4">
              <TabsContent value="rastreabilidade" className="mt-0 h-full">
                <RastreabilidadeProducaoTab osId={os.id} osTipo={os.origem} numeroOS={os.numero_os} refreshKey={traceRefresh} onItem={onTrace} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
      {loteTarget && canGenerateLot && <GerarLoteDialog
        open
        onOpenChange={(value) => { if (!value) setLoteTarget(null); }}
        target={loteTarget}
        onCreated={() => { setTraceRefresh((value) => value + 1); onChanged?.(); }}
      />}
    </Dialog>
  );
}
