import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/** Valores do enum do servidor -> rótulos em português (o enum não muda). */
const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "entrega_parcial", rotulo: "Entrega parcial" },
  { valor: "produto_recusado", rotulo: "Produto recusado" },
  { valor: "volume_divergente", rotulo: "Volume divergente" },
  { valor: "recebedor_ausente", rotulo: "Recebedor ausente" },
  { valor: "endereco_incorreto", rotulo: "Endereço incorreto" },
  { valor: "produto_avariado", rotulo: "Produto avariado" },
  { valor: "atraso", rotulo: "Atraso" },
  { valor: "observacao", rotulo: "Observação" },
  { valor: "ressalva_recebimento", rotulo: "Ressalva no recebimento" },
  { valor: "outro", rotulo: "Outro" },
];

const GRAVIDADES: { valor: string; rotulo: string }[] = [
  { valor: "baixa", rotulo: "Baixa" },
  { valor: "media", rotulo: "Média" },
  { valor: "alta", rotulo: "Alta" },
  { valor: "critica", rotulo: "Crítica" },
];

const LIMITE_LISTA = 20;
const DESCRICAO_MAX = 1000;
const MSG_ERRO_ACAO = "Não foi possível registrar a ocorrência. Tente novamente.";

const rotuloTipo = (v: string) => TIPOS.find((t) => t.valor === v)?.rotulo ?? v;
const rotuloGravidade = (v: string) => GRAVIDADES.find((g) => g.valor === v)?.rotulo ?? v;

const FORM_INICIAL = { tipo: "observacao", descricao: "", gravidade: "baixa" };

export function EntregaOcorrenciasPanel({ entregaId, canAdd = true }: { entregaId: string; canAdd?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [erroDescricao, setErroDescricao] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  // Impede que a resposta de uma entrega anterior altere a entrega atual.
  const entregaAtivaRef = useRef(entregaId);

  useEffect(() => {
    entregaAtivaRef.current = entregaId;
    enviandoRef.current = false;
    setOpen(false);
    setForm(FORM_INICIAL);
    setErroDescricao(null);
  }, [entregaId]);

  const { data: items, isLoading, isError, refetch } = useQuery({
    queryKey: ["entrega-ocorrencias", entregaId],
    enabled: !!entregaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_ocorrencias" as any)
        .select("id, tipo, gravidade, descricao, registrado_em")
        .eq("entrega_id", entregaId)
        .order("registrado_em", { ascending: false })
        .limit(LIMITE_LISTA);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const add = useMutation({
    mutationFn: async (payload: { entregaId: string; tipo: string; gravidade: string; descricao: string }) => {
      const { error } = await supabase.rpc("rpc_registrar_ocorrencia_entrega" as any, {
        p_entrega_id: payload.entregaId,
        p_payload: { tipo: payload.tipo, gravidade: payload.gravidade, descricao: payload.descricao },
      });
      if (error) throw error;
      return payload.entregaId;
    },
    onSuccess: async (entregaDoEnvio) => {
      if (entregaDoEnvio !== entregaAtivaRef.current) return;
      toast({ title: "Ocorrência registrada" });
      setOpen(false);
      setForm(FORM_INICIAL);
      setErroDescricao(null);
      await qc.invalidateQueries({ queryKey: ["entrega-ocorrencias", entregaDoEnvio] });
    },
    // Formulário permanece aberto com os dados preenchidos em caso de falha.
    onError: () => toast({ title: "Erro", description: MSG_ERRO_ACAO, variant: "destructive" }),
    onSettled: () => {
      enviandoRef.current = false;
    },
  });

  const registrar = () => {
    if (!canAdd) return;
    if (enviandoRef.current) return;
    const descricao = form.descricao.trim();
    if (descricao.length < 1) {
      setErroDescricao("Descreva a ocorrência para registrar.");
      return;
    }
    if (descricao.length > DESCRICAO_MAX) {
      setErroDescricao(`A descrição deve ter no máximo ${DESCRICAO_MAX} caracteres.`);
      return;
    }
    setErroDescricao(null);
    enviandoRef.current = true;
    add.mutate({ entregaId, tipo: form.tipo, gravidade: form.gravidade, descricao });
  };

  const fechar = () => {
    if (add.isPending) return;
    setOpen(false);
  };

  return (
    <section className="rounded-md border p-3 space-y-2" aria-labelledby={`ocorrencias-titulo-${entregaId}`}>
      <div className="flex items-center justify-between">
        <div id={`ocorrencias-titulo-${entregaId}`} className="text-sm font-medium">
          Ocorrências
        </div>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-3 w-3 mr-1" aria-hidden="true" /> Nova
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground" data-testid="ocorrencias-carregando">
          Carregando ocorrências…
        </p>
      )}

      {isError && (
        <div className="space-y-2" data-testid="ocorrencias-erro">
          <p className="text-xs text-destructive">Não foi possível carregar as ocorrências desta entrega.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isLoading && !isError && !items?.length && (
        <p className="text-xs text-muted-foreground" data-testid="ocorrencias-vazio">
          Nenhuma ocorrência registrada.
        </p>
      )}

      {!isLoading && !isError && !!items?.length && (
        <>
          <ul className="space-y-2">
            {items.map((o) => (
              <li
                key={o.id}
                className="text-xs border-l-2 pl-2"
                style={{
                  borderColor:
                    o.gravidade === "critica" ? "#ef4444" : o.gravidade === "alta" ? "#f97316" : "#cbd5e1",
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {rotuloTipo(o.tipo)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {rotuloGravidade(o.gravidade)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {o.registrado_em ? new Date(o.registrado_em).toLocaleString("pt-BR") : ""}
                  </span>
                </div>
                <p className="mt-1">{o.descricao}</p>
              </li>
            ))}
          </ul>
          {items.length >= LIMITE_LISTA && (
            <p className="text-[11px] text-muted-foreground" data-testid="ocorrencias-limite">
              Mostrando apenas as {LIMITE_LISTA} ocorrências mais recentes desta entrega.
            </p>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar ocorrência</DialogTitle>
            <DialogDescription>
              Descreva o que aconteceu nesta entrega. O registro fica no histórico e é auditado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ocorrencia-tipo">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger id="ocorrencia-tipo" aria-label="Tipo da ocorrência">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ocorrencia-gravidade">Gravidade</Label>
              <Select value={form.gravidade} onValueChange={(v) => setForm({ ...form, gravidade: v })}>
                <SelectTrigger id="ocorrencia-gravidade" aria-label="Gravidade da ocorrência">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRAVIDADES.map((g) => (
                    <SelectItem key={g.valor} value={g.valor}>
                      {g.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ocorrencia-descricao">Descrição *</Label>
              <Textarea
                id="ocorrencia-descricao"
                rows={3}
                value={form.descricao}
                maxLength={DESCRICAO_MAX}
                aria-invalid={!!erroDescricao}
                aria-describedby={erroDescricao ? "ocorrencia-descricao-erro" : undefined}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
              {erroDescricao && (
                <p id="ocorrencia-descricao-erro" className="text-xs text-destructive" role="alert">
                  {erroDescricao}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={add.isPending}>
              Cancelar
            </Button>
            <Button onClick={registrar} disabled={add.isPending || !canAdd}>
              {add.isPending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
