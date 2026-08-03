import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { EtiquetaProdutoPrint, EtiquetaData } from "@/components/etiquetas/EtiquetaProdutoPrint";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { toast } from "sonner";

export default function EtiquetaProdutoPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [etiqueta, setEtiqueta] = useState<EtiquetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMotivo, setOpenMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("produto_etiquetas")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        toast.error("Etiqueta não encontrada");
      } else {
        setEtiqueta(data as any);
      }
      setLoading(false);
    })();
  }, [id]);

  const registrarImpressao = async (motivoReimpressao?: string) => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.rpc("rpc_marcar_etiqueta_impressa", {
      p_etiqueta_id: id,
      ...(motivoReimpressao ? { p_motivo: motivoReimpressao } : {}),
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Falha ao registrar impressão");
      return;
    }
    setOpenMotivo(false);
    setMotivo("");
    window.print();
  };

  const handlePrint = () => {
    const status = (etiqueta as any)?.status;
    if (status && status !== "gerada") {
      setOpenMotivo(true);
      return;
    }
    void registrarImpressao();
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!etiqueta) return <div className="p-6">Etiqueta não encontrada</div>;

  const cqLiberado = (etiqueta as any).cq_liberado;
  const cancelada = (etiqueta as any).status === "cancelada";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">Etiqueta {etiqueta.codigo_etiqueta}</h1>
          {cancelada && <Badge variant="destructive">Cancelada</Badge>}
          {cqLiberado === false && <Badge variant="outline">CQ não liberado</Badge>}
        </div>
        <Button onClick={handlePrint} disabled={saving || cancelada}>
          <Printer className="h-4 w-4 mr-2" />
          {(etiqueta as any).status === "gerada" ? "Imprimir" : "Reimprimir"}
        </Button>
      </div>
      <div className="flex justify-center">
        <EtiquetaProdutoPrint etiqueta={etiqueta} />
      </div>

      <Dialog open={openMotivo} onOpenChange={setOpenMotivo}>
        <DialogContent className="print:hidden">
          <DialogHeader>
            <DialogTitle>Motivo da reimpressão</DialogTitle>
            <DialogDescription>
              A reimpressão é auditada: informe o motivo (mínimo 3 caracteres).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: etiqueta danificada durante a aplicação"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMotivo(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => registrarImpressao(motivo.trim())}
              disabled={saving || motivo.trim().length < 3}
            >
              Confirmar reimpressão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          @page { size: auto; margin: 5mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
