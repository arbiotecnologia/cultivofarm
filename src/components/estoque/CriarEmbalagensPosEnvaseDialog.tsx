import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  envaseId: string;
  loteId: string;
  produtoId?: string | null;
  volumeSugerido?: number;
  quantidadeSugerida?: number;
  onCreated?: () => void;
}

export function CriarEmbalagensPosEnvaseDialog({
  open, onOpenChange, envaseId, loteId, produtoId, volumeSugerido = 1, quantidadeSugerida = 1, onCreated,
}: Props) {
  const { toast } = useToast();
  const [volume, setVolume] = useState(volumeSugerido);
  const [quantidade, setQuantidade] = useState(quantidadeSugerida);
  const [unidade, setUnidade] = useState("L");
  const [local, setLocal] = useState("");
  const [tipo, setTipo] = useState("");
  const [gerarEtiqueta, setGerarEtiqueta] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("rpc_criar_embalagens_pos_envase", {
        p_payload: {
          envase_id: envaseId, lote_id: loteId, produto_id: produtoId ?? null,
          volume, unidade, quantidade_embalagens: quantidade,
          tipo_embalagem: tipo || null, local_estoque: local || null,
          gerar_etiqueta_automaticamente: gerarEtiqueta,
        },
      });
      if (error) throw error;
      toast({ title: "Embalagens criadas", description: `${data?.total_embalagens ?? quantidade} embalagem(ns)` });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar embalagens pós-envase</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantidade (1-500)</Label>
              <Input type="number" min={1} max={500} value={quantidade} onChange={(e) => setQuantidade(parseInt(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Volume</Label>
              <Input type="number" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} />
            </div>
            <div>
              <Label>Tipo embalagem</Label>
              <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="bombona_5L..." />
            </div>
          </div>
          <div>
            <Label>Local de estoque</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} />
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <Label>Gerar etiquetas automaticamente</Label>
              <p className="text-xs text-muted-foreground">Cada embalagem recebe uma etiqueta vinculada.</p>
            </div>
            <Switch checked={gerarEtiqueta} onCheckedChange={setGerarEtiqueta} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || quantidade < 1 || volume <= 0}>
            {loading ? "Criando..." : "Criar embalagens"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
