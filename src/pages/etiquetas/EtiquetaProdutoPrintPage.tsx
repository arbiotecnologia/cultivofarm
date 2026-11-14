import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { EtiquetaProdutoPrint } from "@/components/etiquetas/EtiquetaProdutoPrint";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Download, RefreshCw, Pencil } from "lucide-react";
import { LABEL_TEMPLATES, assertMutationAck, isUuid, labelDetails, labelTemplate, type LabelData, type LabelTemplate } from "@/lib/etiquetas";
import { createLabelsPdf } from "@/lib/etiquetasPdf";
export default function EtiquetaProdutoPrintPage() {
  const { id } = useParams(); const [params] = useSearchParams();
  const raw = [id, ...(params.get("ids") || "").split(",")].filter(Boolean);
  const ids = [...new Set(raw)].filter(isUuid);
  const scope = useStorageAccessScope(`print:${ids.join(",")}`);
  return scope.ready ? <PrintWorkspace key={scope.scope} ids={ids} scope={scope} /> : <p role="status" className="p-6">Entre com uma sessão autorizada para consultar as etiquetas.</p>;
}
function PrintWorkspace({ ids, scope }: { ids: string[]; scope: ReturnType<typeof useStorageAccessScope> }) {
  const [labels, setLabels] = useState<LabelData[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""); const [mode, setMode] = useState("termica");
  const [editing, setEditing] = useState<LabelData | null>(null); const [obs, setObs] = useState("");
  const [template, setTemplate] = useState<LabelTemplate>("etiqueta-op-100x150"); const [correctionReason, setCorrectionReason] = useState("");
  const lock = useRef(false); const sequence = useRef(0); const printRoot = useRef<HTMLDivElement>(null);
  const correctionKey = useRef(crypto.randomUUID());
  const correctionIntent = useRef<string | null>(null);
  const load = async () => {
    if (lock.current) return;
    const current = scope.capture(); const seq = ++sequence.current;
    setLoading(true); setError(""); setLabels([]);
    try {
      if (!ids.length || ids.length > 500) throw new Error("Seleção inválida ou maior que 500 recipientes.");
      const rows: LabelData[] = [];
      for (let start = 0; start < ids.length; start += 100) {
        if (!current()) return;
        const { data, error } = await supabase.from("produto_etiquetas").select("*").in("id", ids.slice(start, start + 100));
        if (!current() || seq !== sequence.current) return;
        if (error) throw error;
        rows.push(...(data || []) as unknown as LabelData[]);
      }
      if (rows.length !== ids.length || rows.some(l => !ids.includes(l.id))) throw new Error("Uma ou mais etiquetas não estão disponíveis nesta sessão.");
      setLabels(ids.map(id => rows.find(row => row.id === id)).filter((row): row is LabelData => Boolean(row)));
      setSelected(ids);
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Consulta indisponível."); }
    finally { if (current() && seq === sequence.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, []);
  const chosen = labels.filter(l => selected.includes(l.id));
  const formats = new Set(chosen.map(labelTemplate));
  const print = async (pdfOutput: boolean) => {
    if (lock.current || !scope.ready || !chosen.length || chosen.some(l => l.status === "cancelada" || l.status === "substituida") || reason.trim().length < 3) return;
    const current = scope.capture(); lock.current = true; setBusy(true); setError("");
    try {
      const root = printRoot.current; if (!root) throw new Error("Prévia indisponível.");
      // Prepare PDF and reject overflow before the audit writer, without downloading it.
      const pdf = pdfOutput ? await createLabelsPdf(chosen, root) : null;
      await document.fonts?.ready;
      await Promise.all(Array.from(root.querySelectorAll("img")).map(img => img.decode()));
      if (Array.from(root.querySelectorAll<HTMLElement>(".product-label")).some(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) throw new Error("Conteúdo excede o formato. Corrija o modelo para um formato maior.");
      if (!current()) return;
      const { data, error } = await (supabase as any).rpc("rpc_imprimir_etiquetas_recipientes_v1", { p_ids: chosen.map(l => l.id), p_motivo: reason.trim() });
      if (!current()) return;
      if (error) throw error; assertMutationAck(data);
      setLabels(old => old.map(l => selected.includes(l.id) ? { ...l, status: "impressa" } : l));
      if (pdf) pdf.save("etiquetas-recipientes.pdf"); else window.print();
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Impressão não confirmada. Consulte antes de repetir."); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  const correct = async () => {
    if (!editing || lock.current || correctionReason.trim().length < 3 || !scope.ready) return;
    const current = scope.capture(); lock.current = true; setBusy(true); setError("");
    try {
      const intent = JSON.stringify([editing.id, obs, template, correctionReason.trim()]);
      if (correctionIntent.current && correctionIntent.current !== intent) throw new Error("Tentativa anterior não confirmada. Retome os mesmos valores antes de iniciar outra correção.");
      correctionIntent.current = intent;
      const { data, error } = await (supabase as any).rpc("rpc_corrigir_etiqueta_produto_v1", { p_etiqueta_id: editing.id, p_alteracoes: { observacoes: obs, template_codigo: template }, p_motivo: correctionReason.trim(), p_idempotency_key: correctionKey.current });
      if (!current()) return;
      if (error) throw error; assertMutationAck(data); setEditing(null); correctionKey.current = crypto.randomUUID(); correctionIntent.current = null;
      lock.current = false; await load();
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Correção não confirmada; mantenha a mesma tentativa."); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  const d = chosen[0] ? LABEL_TEMPLATES[labelTemplate(chosen[0])] : LABEL_TEMPLATES["etiqueta-op-100x150"];
  return <div className="p-4 sm:p-6 space-y-4">
    <div className="print:hidden space-y-4"><div className="flex flex-wrap justify-between gap-2"><h1 className="text-xl font-bold">Etiquetas por recipiente</h1><Button variant="outline" disabled={busy || loading} onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button></div>
      {loading && <p role="status">Carregando etiquetas…</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => setSelected(labels.map(l => l.id))}>Selecionar todos</Button><Button variant="outline" disabled={busy} onClick={() => setSelected([])}>Limpar seleção</Button></div>
      <div className="divide-y">{labels.map(l => <div key={l.id} className="py-2 flex flex-wrap items-center gap-3"><Checkbox disabled={busy} aria-label={`Selecionar ${l.codigo_etiqueta}`} checked={selected.includes(l.id)} onCheckedChange={v => setSelected(old => v ? [...old, l.id] : old.filter(id => id !== l.id))} /><span className="flex-1 min-w-0 break-words">{l.codigo_etiqueta} · Recipiente {l.recipiente_seq ?? "—"} · {l.status}</span><Button variant="outline" size="sm" disabled={busy || Boolean(correctionIntent.current) || l.status === "cancelada" || l.status === "substituida"} onClick={() => { setEditing(l); setObs(l.observacoes || ""); setTemplate(labelTemplate(l)); setCorrectionReason(""); correctionKey.current = crypto.randomUUID(); }}><Pencil className="h-3 w-3 mr-1" />Corrigir</Button><details className="w-full text-sm"><summary>Dados completos autorizados</summary>{labelDetails(l).map(([k, v]) => <p className="break-words" key={k}><b>{k}:</b> {v}</p>)}</details></div>)}</div>
      {editing && <section className="border-t pt-4 space-y-3"><h2 className="font-semibold">Correção · {editing.codigo_etiqueta}</h2><label className="block">Observações<Textarea value={obs} disabled={busy} onChange={e => setObs(e.target.value)} /></label><label className="block">Formato<Select value={template} disabled={busy} onValueChange={v => setTemplate(v as LabelTemplate)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LABEL_TEMPLATES).map(([k, d]) => <SelectItem key={k} value={k}>{d.width}×{d.height} mm</SelectItem>)}</SelectContent></Select></label><label className="block">Motivo da correção<Textarea value={correctionReason} disabled={busy} onChange={e => setCorrectionReason(e.target.value)} /></label><Button disabled={busy || correctionReason.trim().length < 3} onClick={correct}>Salvar correção</Button><Button variant="outline" disabled={busy || Boolean(correctionIntent.current)} onClick={() => setEditing(null)}>Voltar</Button></section>}
      <label className="block">Impressora<Select value={mode} disabled={busy} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="termica">Térmica · tamanho da etiqueta</SelectItem><SelectItem value="convencional">Convencional · A4</SelectItem></SelectContent></Select></label>
      <label className="block">Motivo da impressão ou reimpressão<Textarea value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !chosen.length || reason.trim().length < 3 || (mode === "termica" && formats.size > 1)} onClick={() => print(false)}><Printer className="h-4 w-4 mr-2" />Imprimir selecionados</Button><Button variant="outline" disabled={busy || !chosen.length || reason.trim().length < 3} onClick={() => print(true)}><Download className="h-4 w-4 mr-2" />PDF multipágina</Button></div>
      {mode === "termica" && formats.size > 1 && <p role="alert">Selecione um único formato para impressão térmica.</p>}
    </div>
    <div className="label-preview-scroll"><div id="product-label-print" ref={printRoot}><div className="label-pages">{chosen.map(l => <EtiquetaProdutoPrint key={l.id} etiqueta={l} />)}</div></div></div>
    <style>{`@media print { @page { size: ${mode === "convencional" ? "A4" : `${d.width}mm ${d.height}mm`}; margin: ${mode === "convencional" ? "5mm" : "0"}; } }`}</style>
  </div>;
}
