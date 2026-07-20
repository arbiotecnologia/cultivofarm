import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tag, Printer } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  embalagemId: string;
  onDone?: () => void;
}

export function GerarEtiquetaEmbalagemDialog({ open, onOpenChange, embalagemId, onDone }: Props) {
  const { toast } = useToast();
  const [emb, setEmb] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [createdEtiquetaId, setCreatedEtiquetaId] = useState<string | null>(null);
  const [tipoEtiqueta, setTipoEtiqueta] = useState("principal");
  const [conservacao, setConservacao] = useState("");
  const [usoRecomendado, setUsoRecomendado] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (!open || !embalagemId) return;
    setCreatedEtiquetaId(null);
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("estoque_embalagens")
        .select("id, codigo_embalagem, lote_id, produto_id, envase_id, cliente_id, fazenda_id, volume, unidade, etiqueta_id")
        .eq("id", embalagemId)
        .maybeSingle();
      setEmb(data);
      setLoading(false);
    })();
  }, [open, embalagemId]);

  const submit = async () => {
    if (!emb) return;
    setGenerating(true);
    try {
      const { data: gen, error: genErr } = await (supabase as any).rpc("rpc_gerar_etiqueta_produto", {
        p_payload: {
          lote_id: emb.lote_id,
          produto_id: emb.produto_id,
          envase_id: emb.envase_id,
          cliente_id: emb.cliente_id,
          fazenda_id: emb.fazenda_id,
          volume: emb.volume,
          unidade: emb.unidade,
          quantidade_embalagens: 1,
          tipo_etiqueta: tipoEtiqueta,
          conservacao: conservacao || null,
          uso_recomendado: usoRecomendado || null,
          observacoes: observacoes || null,
        },
      });
      if (genErr) throw genErr;
      const etqId = (gen as any)?.etiqueta_id;
      if (!etqId) throw new Error("RPC não retornou etiqueta_id");

      const { error: vincErr } = await (supabase as any).rpc("rpc_vincular_etiqueta_embalagem", {
        p_embalagem_id: emb.id,
        p_etiqueta_id: etqId,
      });
      if (vincErr) throw vincErr;

      setCreatedEtiquetaId(etqId);
      toast({ title: "Etiqueta gerada e vinculada" });
      onDone?.();
    } catch (e: any) {
      toast({ title: "Erro ao gerar etiqueta", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> Gerar nova etiqueta</DialogTitle>
          <DialogDescription>
            {emb?.codigo_embalagem ? `Embalagem ${emb.codigo_embalagem}` : "Carregando..."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando embalagem...</p>
        ) : createdEtiquetaId ? (
          <div className="space-y-2 text-sm">
            <p>Etiqueta criada e vinculada com sucesso.</p>
            <Button
              variant="outline"
              onClick={() => window.open(`/etiquetas/${createdEtiquetaId}/imprimir`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-1" /> Imprimir etiqueta
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {emb?.etiqueta_id && (
              <p className="text-xs text-amber-700">
                Esta embalagem já possui uma etiqueta vinculada. Gerar nova vai substituir o vínculo.
              </p>
            )}
            <div>
              <Label>Tipo</Label>
              <Select value={tipoEtiqueta} onValueChange={setTipoEtiqueta}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="reduzida">Reduzida</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="transporte">Transporte</SelectItem>
                  <SelectItem value="amostra">Amostra</SelectItem>
                  <SelectItem value="interna">Interna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conservação</Label>
              <Input value={conservacao} onChange={(e) => setConservacao(e.target.value)} placeholder="Ex.: Refrigerado 2-8°C" />
            </div>
            <div>
              <Label>Uso recomendado</Label>
              <Input value={usoRecomendado} onChange={(e) => setUsoRecomendado(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {!createdEtiquetaId && (
            <Button onClick={submit} disabled={generating || loading || !emb}>
              {generating ? "Gerando..." : "Gerar etiqueta"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
