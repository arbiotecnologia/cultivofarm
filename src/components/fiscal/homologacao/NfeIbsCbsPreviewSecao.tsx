/**
 * Pré-visualização NF-e 55 com IBS/CBS (interna e interestadual) — sem transmissão.
 * Classificação real do catálogo (perfil fiscal + perfil RTC do item, leituras autenticadas e
 * escopadas já existentes); emitente, destinatário e valores FICTÍCIOS. Não reserva numeração,
 * não grava nota, não chama SEFAZ.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductFiscalList } from "@/hooks/useProductFiscalProfiles";
import { useFiscalRtcItem } from "@/hooks/useFiscalRtc";
import { buildNfeIbsCbsPreview, PREVIEW_DEST_UFS, type NfePreviewResult, type NfePreviewScenario } from "@/lib/fiscal/nfeIbsCbsPreview";

export default function NfeIbsCbsPreviewSecao() {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [destUf, setDestUf] = useState("SP");
  const [results, setResults] = useState<Partial<Record<NfePreviewScenario, NfePreviewResult>>>({});
  const list = useProductFiscalList({ search, status: null, page: 0, pageSize: 50 });
  const items = useMemo(() => (list.data?.items ?? []).filter((p) => p.profile_id && p.is_active), [list.data]);
  const sel = items.find((p) => p.product_id === productId) ?? null;
  const rtc = useFiscalRtcItem("product", productId, { enabled: !!productId });

  function run(scenario: NfePreviewScenario) {
    if (!sel) return;
    const r = buildNfeIbsCbsPreview({ name: sel.product_nome, code: sel.product_codigo, ncm: sel.ncm, cfopInState: sel.cfop_in_state, cfopInterstate: sel.cfop_interstate,
      ibsCbsConfig: rtc.data ?? null }, scenario, { destUf, issueDate: new Date().toISOString().slice(0, 10) });
    setResults((s) => ({ ...s, [scenario]: r }));
  }
  function download(r: NfePreviewResult) {
    if (!r.ok) return;
    const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
    const a = document.createElement("a"); a.href = url; a.download = `previa-nfe-ibscbs-${r.scenario}.xml`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Card data-testid="nfe-ibscbs-preview">
      <CardHeader>
        <CardTitle>Pré-visualizar NF-e com IBS/CBS</CardTitle>
        <CardDescription>Gera o XML pelo mesmo gerador do servidor, sem enviar, sem reservar número e sem gravar nota.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert><AlertTitle>Dados fictícios</AlertTitle>
          <AlertDescription>Emitente, destinatário, número e valores são fictícios (homologação, sem valor fiscal). Só a classificação do produto (NCM, CFOP e IBS/CBS) vem do seu catálogo.</AlertDescription></Alert>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="pv-busca">Buscar produto</Label><Input id="pv-busca" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou código" /></div>
          <div className="space-y-1"><Label>Produto com perfil fiscal</Label>
            <Select value={productId ?? ""} onValueChange={(v) => { setProductId(v); setResults({}); }}>
              <SelectTrigger aria-label="Produto"><SelectValue placeholder={list.isLoading ? "Carregando…" : "Selecione"} /></SelectTrigger>
              <SelectContent>{items.map((p) => <SelectItem key={p.product_id} value={p.product_id}>{p.product_nome}{p.product_codigo ? ` — ${p.product_codigo}` : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>UF de destino (interestadual)</Label>
            <Select value={destUf} onValueChange={(v) => { setDestUf(v); setResults((s) => ({ ...s, interestadual: undefined })); }}>
              <SelectTrigger aria-label="UF de destino"><SelectValue /></SelectTrigger>
              <SelectContent>{PREVIEW_DEST_UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        {sel && <p className="text-sm text-muted-foreground">NCM {sel.ncm ?? "—"} · CFOP interno {sel.cfop_in_state ?? "—"} · CFOP interestadual {sel.cfop_interstate ?? "—"} · IBS/CBS {rtc.loading ? "carregando…" : rtc.data && Object.keys(rtc.data).length ? "configurado" : "não configurado"}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!sel || rtc.loading} onClick={() => run("interna")}>Pré-visualizar interna (MG → MG)</Button>
          <Button variant="outline" disabled={!sel || rtc.loading} onClick={() => run("interestadual")}>Pré-visualizar interestadual (MG → {destUf})</Button>
        </div>
        {(["interna", "interestadual"] as const).map((k) => { const r = results[k]; if (!r) return null; return (
          <div key={k} className="space-y-2" data-testid={`nfe-preview-${k}`}>
            <div className="flex items-center gap-2"><Badge variant="outline">{k === "interna" ? "Operação interna" : "Operação interestadual"}</Badge>
              {r.ok ? <span className="text-sm text-muted-foreground">idDest {r.idDest} · {r.emitUf} → {r.destUf}</span> : <span className="text-sm text-destructive">Pendências: {r.missing.join(", ")}</span>}
              {r.ok && <Button size="sm" variant="ghost" onClick={() => download(r)}>Baixar XML</Button>}</div>
            {r.ok && <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs" data-testid={`nfe-preview-xml-${k}`}>{r.xml}</pre>}
          </div>); })}
      </CardContent>
    </Card>
  );
}
