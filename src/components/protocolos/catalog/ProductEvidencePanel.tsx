import { DOCUMENTARY_LABELS } from "@/lib/catalogo/documentaryLabels";
import { safeSourceUrl } from "@/lib/catalogo/safeSourceUrl";
import type { DocumentaryEvidence } from "@/lib/catalogo/documentarySuggestions";

export function ProductEvidencePanel({ evidence, values, history }: { evidence: DocumentaryEvidence[]; values: Record<string, unknown>; history?: { profile_revision: string; evidence: DocumentaryEvidence[] } | null }) {
  return <section className="space-y-3" aria-label="Fontes por campo">
    <h3 className="font-semibold">Fontes do conteúdo aceito</h3>
    {!evidence.length && <p className="text-sm text-muted-foreground">Nenhuma fonte de IA aceita nesta ficha.</p>}
    {evidence.map((item, index) => <div className="space-y-2 border-b py-3" key={`${item.field}-${index}`}>
      <h4 className="font-medium">{DOCUMENTARY_LABELS[item.field] ?? item.field}</h4>
      {values[item.field] !== item.value && <p className="text-sm text-muted-foreground">Fonte de versão anterior — o texto atual foi alterado.</p>}
      <p className="whitespace-pre-wrap break-words text-sm">{item.value}</p>
      {item.sources.map(source => <div className="break-words text-sm" key={source.url}>
        {safeSourceUrl(source.url) ? <a href={safeSourceUrl(source.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title}</a> : <span>{source.title} · Link não seguro</span>}
        <p className="text-muted-foreground">{source.excerpt}</p>
      </div>)}
    </div>)}
    {history && history.evidence.length > 0 && <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">Fontes aceitas em revisão anterior</summary>
      <p className="text-sm text-muted-foreground">{history.profile_revision} · Histórico; não comprova texto divergente na ficha atual.</p>
      {history.evidence.map((item, index) => <div key={`history-${item.field}-${index}`} className="space-y-2 border-b py-3">
        <h4 className="font-medium">{DOCUMENTARY_LABELS[item.field] ?? item.field}</h4>
        <p className="whitespace-pre-wrap break-words text-sm">{item.value}</p>
        {item.sources.map(source => <div key={source.url} className="break-words text-sm">
          {safeSourceUrl(source.url) ? <a href={safeSourceUrl(source.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title}</a> : <span>{source.title} · Link não seguro</span>}
          <p className="text-muted-foreground">{source.excerpt}</p>
        </div>)}
      </div>)}
    </details>}
  </section>;
}