import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Tag, Printer, Link as LinkIcon, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildRastreioUrl } from "./QRCodeRastreioProduto";

interface Props {
  readOnly?: boolean;
  envaseId?: string;
  loteId?: string;
  etiquetaId?: string | null;
  traceToken?: string | null;
  status?: string | null;
  onChanged?: () => void;
}

export function EtiquetaProdutoActions({ readOnly = false, envaseId, loteId, etiquetaId, traceToken, status, onChanged }: Props) {
  const [openGerar, setOpenGerar] = useState(false);
  const [tipo, setTipo] = useState("principal");
  const [conservacao, setConservacao] = useState("");
  const [uso, setUso] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  const gerar = async () => {
    if (readOnly) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("rpc_gerar_etiqueta_produto", {
      p_lote_id: loteId || null,
      p_payload: {
        envase_id: envaseId || null,
        lote_id: loteId || null,
        tipo_etiqueta: tipo,
        conservacao: conservacao || null,
        uso_recomendado: uso || null,
        observacoes: obs || null,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const id = (data as any)?.etiqueta_id;
    toast.success(`Etiqueta ${(data as any)?.codigo_etiqueta} gerada`);
    setOpenGerar(false);
    onChanged?.();
    if (id) window.open(`/etiquetas/${id}/imprimir`, "_blank");
  };

  const imprimir = () => {
    if (!etiquetaId) return;
    window.open(`/etiquetas/${etiquetaId}/imprimir`, "_blank");
  };

  const copiarLink = async () => {
    if (!traceToken) return;
    await navigator.clipboard.writeText(buildRastreioUrl(traceToken));
    toast.success("Link de rastreio copiado");
  };

  const isCancelada = status === "cancelada";

  if (!etiquetaId && readOnly) return <span className="text-muted-foreground">—</span>;

  if (!etiquetaId) {
    return (
      <Dialog open={openGerar} onOpenChange={setOpenGerar}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Tag className="h-3 w-3 mr-1" /> Gerar etiqueta
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar etiqueta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">Principal (100×60mm)</SelectItem>
                  <SelectItem value="reduzida">Reduzida (50×30mm)</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="transporte">Transporte</SelectItem>
                  <SelectItem value="amostra">Amostra</SelectItem>
                  <SelectItem value="interna">Interna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Conservação (opcional)</Label>
              <Input value={conservacao} onChange={(e) => setConservacao(e.target.value)} placeholder="Padrão Cultivo Farm" />
            </div>
            <div className="space-y-1">
              <Label>Uso (opcional)</Label>
              <Input value={uso} onChange={(e) => setUso(e.target.value)} placeholder="Padrão Cultivo Farm" />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={gerar} disabled={loading}>
              {loading ? "Gerando..." : "Gerar e abrir impressão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="outline" onClick={imprimir}>
        <Eye className="h-3 w-3 mr-1" /> Ver
      </Button>
      <Button size="sm" variant="outline" onClick={imprimir} disabled={isCancelada}>
        <Printer className="h-3 w-3 mr-1" /> {status === "gerada" ? "Imprimir" : "Reimprimir"}
      </Button>
      <Button size="sm" variant="outline" onClick={copiarLink}>
        <LinkIcon className="h-3 w-3 mr-1" /> Link
      </Button>
    </div>
  );
}
