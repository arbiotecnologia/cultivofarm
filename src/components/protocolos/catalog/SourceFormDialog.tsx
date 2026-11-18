import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { validateOptionalSourceUrl } from '@/lib/catalogo/safeSourceUrl';
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_LEVELS,
  CatalogSource,
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  useUpsertCatalogSource,
  type CatalogSourceEntity,
} from "@/hooks/useCatalogSources";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entidadeTipo: CatalogSourceEntity;
  entidadeId: string;
  source: CatalogSource | null;
}

const empty = {
  fonte_titulo: "",
  fonte_url: "",
  fonte_tipo: "artigo_cientifico" as (typeof SOURCE_TYPES)[number],
  idioma_original: "",
  pais_origem: "",
  resumo_evidencia: "",
  nivel_confianca: "medio" as (typeof CONFIDENCE_LEVELS)[number],
  data_consulta: new Date().toISOString().slice(0, 10),
  observacoes: "",
};

export function SourceFormDialog({
  open,
  onOpenChange,
  entidadeTipo,
  entidadeId,
  source,
}: Props) {
  const upsert = useUpsertCatalogSource(entidadeTipo, entidadeId);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) {
      if (source) {
        setForm({
          fonte_titulo: source.fonte_titulo ?? "",
          fonte_url: source.fonte_url ?? "",
          fonte_tipo: source.fonte_tipo,
          idioma_original: source.idioma_original ?? "",
          pais_origem: source.pais_origem ?? "",
          resumo_evidencia: source.resumo_evidencia ?? "",
          nivel_confianca: source.nivel_confianca,
          data_consulta:
            source.data_consulta ?? new Date().toISOString().slice(0, 10),
          observacoes: source.observacoes ?? "",
        });
      } else {
        setForm(empty);
      }
    }
  }, [open, source]);

  const submit = async () => {
    if (!form.fonte_titulo.trim()) {
      toast.error("Informe o título da fonte");
      return;
    }
    try {
      validateOptionalSourceUrl(form.fonte_url);
      await upsert.mutateAsync({
        id: source?.id,
        fonte_titulo: form.fonte_titulo.trim(),
        fonte_url: form.fonte_url.trim() || null,
        fonte_tipo: form.fonte_tipo,
        idioma_original: form.idioma_original.trim() || null,
        pais_origem: form.pais_origem.trim() || null,
        resumo_evidencia: form.resumo_evidencia.trim() || null,
        nivel_confianca: form.nivel_confianca,
        data_consulta: form.data_consulta || null,
        observacoes: form.observacoes.trim() || null,
      });
      toast.success(source ? "Fonte atualizada" : "Fonte adicionada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar fonte");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source ? "Editar fonte técnica" : "Adicionar fonte técnica"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título da fonte *</Label>
            <Input
              value={form.fonte_titulo}
              onChange={(e) => setForm({ ...form, fonte_titulo: e.target.value })}
              placeholder="Ex.: Efeito de Trichoderma harzianum sobre Fusarium spp."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo da fonte *</Label>
              <Select
                value={form.fonte_tipo}
                onValueChange={(v: any) => setForm({ ...form, fonte_tipo: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nível de confiança *</Label>
              <Select
                value={form.nivel_confianca}
                onValueChange={(v: any) => setForm({ ...form, nivel_confianca: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONFIDENCE_LEVELS.map((c) => (
                    <SelectItem key={c} value={c}>{CONFIDENCE_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              value={form.fonte_url}
              onChange={(e) => setForm({ ...form, fonte_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Idioma original</Label>
              <Input
                value={form.idioma_original}
                onChange={(e) => setForm({ ...form, idioma_original: e.target.value })}
                placeholder="pt, en, es..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">País de origem</Label>
              <Input
                value={form.pais_origem}
                onChange={(e) => setForm({ ...form, pais_origem: e.target.value })}
                placeholder="Brasil, EUA..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de consulta</Label>
              <Input
                type="date"
                value={form.data_consulta}
                onChange={(e) => setForm({ ...form, data_consulta: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resumo da evidência</Label>
            <Textarea
              rows={4}
              value={form.resumo_evidencia}
              onChange={(e) => setForm({ ...form, resumo_evidencia: e.target.value })}
              placeholder="Resumo das evidências relevantes encontradas nessa fonte."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações internas</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {source ? "Salvar alterações" : "Adicionar fonte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
