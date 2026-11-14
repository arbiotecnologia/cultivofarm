import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tags, AlertTriangle } from "lucide-react";
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";

export interface EmbalagemLoteOption {
  id: string;
  lote_id?: string | null;
  codigo_embalagem: string;
  etiqueta_id?: string | null;
}

interface EtiquetaTemplate {
  codigo: string;
  versao: number;
  nome: string;
  midia: string;
  largura_mm: number;
  altura_mm: number;
  colunas: number;
  linhas: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  embalagens: EmbalagemLoteOption[];
  onDone?: () => void;
}

const TIPOS = ["principal", "reduzida", "caixa", "transporte", "amostra", "interna"];

/** Mapeia erros canônicos do motor de etiquetas para mensagens acionáveis. */
export function traduzirErroEtiqueta(message: string): string {
  if (message.includes("label_expiry_not_validated"))
    return "Validade não validada: defina validade na embalagem/estoque ou política de validade no perfil de conformidade aprovado.";
  if (message.includes("label_compliance_profile_missing"))
    return "Não há perfil de conformidade aprovado vigente para este produto.";
  if (message.includes("label_compliance_field_missing"))
    return "Perfil de conformidade incompleto (responsável técnico, registro ou textos obrigatórios).";
  if (message.includes("label_cq_not_approved"))
    return "Lote sem aprovação de CQ: etiqueta comercial bloqueada.";
  if (message.includes("label_template_not_found"))
    return "Modelo de etiqueta inexistente ou inativo.";
  if (message.includes("label_batch_too_large"))
    return "Máximo de 500 embalagens por execução.";
  if (message.includes("label_batch_empty"))
    return "Selecione ao menos uma embalagem.";
  return message;
}

export function GerarEtiquetasLoteDialog({ open, onOpenChange, embalagens, onDone }: Props) {
  const lots = [...new Set(embalagens.map(e => e.lote_id).filter((id): id is string => Boolean(id)))];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>Etiquetas por lote e recipiente</DialogTitle></DialogHeader>
    {lots.length ? lots.map(id => <div key={id} className="border-b py-2"><p className="text-xs font-mono break-all mb-2">Lote {id}</p><EtiquetaProdutoActions loteId={id} onChanged={onDone} /></div>) : <p>Nenhum lote disponível nesta seleção.</p>}
  </DialogContent></Dialog>;
}

/** Kept unmounted for historical component characterization; canonical entries use recipient roots. */
function LegacyGerarEtiquetasLoteDialog({ open, onOpenChange, embalagens, onDone }: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EtiquetaTemplate[]>([]);
  const [templateCodigo, setTemplateCodigo] = useState<string>("");
  const [tipo, setTipo] = useState("principal");
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const elegiveis = useMemo(
    () => embalagens.filter((e) => !e.etiqueta_id),
    [embalagens],
  );

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setSelecionadas(Object.fromEntries(elegiveis.map((e) => [e.id, true])));
    (async () => {
      const { data } = await (supabase as any)
        .from("etiqueta_templates")
        .select("codigo, versao, nome, midia, largura_mm, altura_mm, colunas, linhas")
        .eq("ativo", true)
        .order("codigo");
      const list: EtiquetaTemplate[] = data ?? [];
      setTemplates(list);
      if (list.length && !templateCodigo) setTemplateCodigo(list[0].codigo);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const idsSelecionados = useMemo(
    () => elegiveis.filter((e) => selecionadas[e.id]).map((e) => e.id),
    [elegiveis, selecionadas],
  );

  const preview = templates.find((t) => t.codigo === templateCodigo);

  const submit = async () => {
    if (submitting) return;
    if (!idsSelecionados.length) {
      setErro("Selecione ao menos uma embalagem.");
      return;
    }
    setSubmitting(true);
    setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc("rpc_gerar_etiquetas_embalagens_lote", {
        p_payload: {
          embalagem_ids: idsSelecionados,
          tipo_etiqueta: tipo,
          template_codigo: templateCodigo || null,
        },
      });
      if (error) throw error;
      toast({
        title: "Etiquetas geradas",
        description: `${data?.total_geradas ?? 0} nova(s), ${data?.total_reaproveitadas ?? 0} já existente(s).`,
      });
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      setErro(traduzirErroEtiqueta(e?.message ?? "Falha ao gerar etiquetas."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" /> Gerar etiquetas em lote
          </DialogTitle>
          <DialogDescription>
            Uma etiqueta ativa por embalagem e tipo. Reexecução é idempotente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Select value={templateCodigo} onValueChange={setTemplateCodigo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={`${t.codigo}-${t.versao}`} value={t.codigo}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {preview && (
            <p className="text-xs text-muted-foreground">
              Prévia: {preview.midia} · {preview.largura_mm}×{preview.altura_mm} mm ·
              {" "}{preview.colunas}×{preview.linhas} por folha
            </p>
          )}

          <div className="space-y-1">
            <Label>Embalagens sem etiqueta ({elegiveis.length})</Label>
            <ScrollArea className="h-44 rounded border p-2">
              {elegiveis.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">
                  Nenhuma embalagem elegível na listagem atual.
                </p>
              )}
              {elegiveis.map((e) => (
                <label key={e.id} className="flex items-center gap-2 py-1 text-sm">
                  <Checkbox
                    checked={!!selecionadas[e.id]}
                    onCheckedChange={(v) =>
                      setSelecionadas((s) => ({ ...s, [e.id]: v === true }))
                    }
                  />
                  <span className="font-mono">{e.codigo_embalagem}</span>
                </label>
              ))}
            </ScrollArea>
          </div>

          {erro && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Fechar
          </Button>
          <Button onClick={submit} disabled={submitting || idsSelecionados.length === 0}>
            {submitting ? "Gerando..." : `Gerar ${idsSelecionados.length} etiqueta(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
