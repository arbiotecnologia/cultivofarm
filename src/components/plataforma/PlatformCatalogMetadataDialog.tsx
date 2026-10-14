import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCatalogAccess } from "@/lib/catalogo/platformCatalogRead";
import { metadataFields, metadataRetryKey, metadataValuesSchema, readMetadata, updateMetadata, type MetadataDetail, type MetadataValues } from "@/lib/catalogo/platformCatalogMetadata";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const labels = { nome: "Nome", descricao: "Descrição", modo_acao: "Modo de ação", funcao_completa: "Função completa", modo_aplicacao: "Modo de aplicação" };
export function PlatformCatalogMetadataDialog({ id, scope, onClose, onSaved }: {
  id: string; scope: string; onClose: () => void; onSaved: () => void;
}) {
  const actor = useAuth();
  const access = platformCatalogAccess(actor);
  const current = useRef(false);
  current.current = access.ready && access.scope === scope;
  const mounted = useRef(true);
  const lock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const [detail, setDetail] = useState<MetadataDetail>();
  const [values, setValues] = useState<MetadataValues>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const controllers = requests.current;
    const controller = new AbortController(); controllers.add(controller);
    void readMetadata(id, controller.signal).then((data) => {
      if (!mounted.current || !current.current || controller.signal.aborted) return;
      setDetail(data); setValues(Object.fromEntries(metadataFields.map((field) => [field, data[field]])) as MetadataValues);
    }).catch(() => {
      if (mounted.current && current.current && !controller.signal.aborted) setError("Não foi possível carregar os dados do produto.");
    }).finally(() => controllers.delete(controller));
    return () => { mounted.current = false; for (const request of controllers) request.abort(); controllers.clear(); };
  }, [id]);
  if (!current.current) return null;
  const changed = detail && values && metadataFields.some((field) => detail[field] !== values[field]);
  const valid = values && metadataValuesSchema.safeParse(values).success && reason.trim().length >= 10 && reason.trim().length <= 500;
  async function save() {
    if (lock.current || !mounted.current || !current.current || !detail || !values || !valid || !changed) return;
    lock.current = true; setBusy(true); setError("");
    const fingerprint = JSON.stringify([id, detail.updated_at, values, reason.trim()]);
    const key = metadataRetryKey(scope, fingerprint);
    const controller = new AbortController(); requests.current.add(controller);
    try {
      await updateMetadata(detail, values, reason, key, controller.signal);
      if (mounted.current && current.current && !controller.signal.aborted) onSaved();
    } catch (failure) {
      if (mounted.current && current.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Não foi possível confirmar a alteração.");
    } finally {
      requests.current.delete(controller); lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-w-xl" aria-busy={busy}>
      <DialogHeader><DialogTitle>Editar produto global</DialogTitle>
        <DialogDescription>Altere apenas o nome e os textos descritivos. Preços, composição, classificação e disponibilidade permanecem iguais.</DialogDescription>
      </DialogHeader>
      {!values && !error && <p role="status">Carregando…</p>}
      {error && <p role="alert">{error}</p>}
      {values && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className="space-y-3">
          {metadataFields.map((field) => <div key={field} className="space-y-1.5 min-w-0">
            <Label htmlFor={`metadata-${field}`}>{labels[field]}</Label>
            {field === "nome" ? <Input id={`metadata-${field}`} required maxLength={500} value={values[field]}
              onChange={(event) => setValues({ ...values, [field]: event.target.value })} /> :
              <Textarea id={`metadata-${field}`} rows={2} maxLength={10000} value={values[field] ?? ""}
                onChange={(event) => setValues({ ...values, [field]: event.target.value || null })} />}
          </div>)}
          <div className="space-y-1.5"><Label htmlFor="metadata-reason">Motivo da alteração (10 a 500 caracteres)</Label>
            <Textarea id="metadata-reason" required minLength={10} maxLength={500} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !valid || !changed}>{busy ? "Confirmando…" : "Salvar alteração"}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
