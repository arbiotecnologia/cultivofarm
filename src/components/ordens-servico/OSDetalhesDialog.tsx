import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RastreabilidadeProducaoTab } from "./RastreabilidadeProducaoTab";
import { formatOS } from "@/lib/osLabel";
import { Badge } from "@/components/ui/badge";
import { Check, History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Canonical client schema snapshot predates this installed, closed RPC.
// Narrow only its existing audited signature; no second client or broad any.
const approveOSRPC = supabase.rpc.bind(supabase) as unknown as (
  name: "rpc_aprovar_os_v1", args: { p_os_id: string; p_origem: string },
) => ReturnType<typeof supabase.rpc>;

interface Props {
  os: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OSDetalhesDialog({ os, open, onOpenChange }: Props) {
  const { roles = [] } = useAuth();
  const access = useStorageAccessScope(JSON.stringify(["os-approval", os?.id, os?.origem, open]));
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  useEffect(() => { setApprovedId(null); setSaving(false); }, [os?.id, open, access.scope]);
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
        data.success !== true || data.status !== "aprovada") {
        toast.error("Não foi possível aprovar a OS. Verifique sua autorização e a programação vinculada.");
        return;
      }
      setApprovedId(id);
      toast.success("OS aprovada.");
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
              <p className="text-sm text-muted-foreground">
                {isB2B
                  ? `Parceiro B2B: ${partnerNome}${partnerNumero ? ` · Pedido ${partnerNumero}` : ""}`
                  : `${clienteNome || "—"} · ${fazenda || "—"} / ${talhao || "—"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6">
                {os.origem === 'onfarm' ? 'Visita Técnica' : 'Manual'}
              </Badge>
              <Badge className="h-6 bg-primary/10 text-primary border-primary/20">
                {(approvedId === os.id ? "aprovada" : os.status || "Não informado").replace(/_/g, ' ').toUpperCase()}
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
                <RastreabilidadeProducaoTab osId={os.id} osTipo={os.origem} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
