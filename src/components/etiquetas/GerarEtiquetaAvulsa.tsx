import { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Printer, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useStorageAccessScope } from '@/hooks/useStorageAccessScope';
import { useActiveTenantName } from '@/hooks/useActiveTenantName';
import { useCockpitQuery, COCKPIT_LIST_RPC } from '@/hooks/useCockpitQuery';
import { supabase } from '@/integrations/supabase/client';
import { createLooseLabels, EMPTY_LOOSE_LABEL, maskLabelDate, type LooseLabelDraft } from '@/lib/etiquetaAvulsa';
import { LabelScene, labelLayout, createRecipientLabelsPdf } from '@/lib/etiquetasLayout';
import { LABEL_FORMATS, isUuid, record, text } from '@/lib/etiquetasRecipientes';
import './etiquetas.css';
import { z } from 'zod';
import { prepareLabelLogo, type PreparedLabelLogo } from '@/lib/etiquetaLogo';

export interface LabelProduction { os_id: string; origem_os: string; numero_os: string; produto_nome?: string | null; microrganismo_nome?: string | null; codigo_lote?: string | null; cliente_nome?: string | null; titular_nome?: string | null; fazenda_nome?: string | null; status_os?: string | null; status_esteira_oficial?: string | null }
const sourceText = z.string().max(300).nullable().optional();
const sourceSchema = z.object({ os_id: z.string().uuid(), origem_os: z.enum(['manual', 'onfarm']), numero_os: z.string().min(1).max(120), produto_nome: sourceText, microrganismo_nome: sourceText, codigo_lote: sourceText, cliente_nome: sourceText, titular_nome: sourceText, fazenda_nome: sourceText, status_os: sourceText, status_esteira_oficial: sourceText });
export function parseLabelProductions(raw: unknown): { items: LabelProduction[]; total: number } {
  const envelope = record(raw);
  if (!Array.isArray(envelope.items) || !Number.isSafeInteger(envelope.total_count) || Number(envelope.total_count) < 0) throw new Error('Consulta de produção inválida.');
  const items = envelope.items.map(value => {
    const row = record(value);
    if (!isUuid(row.os_id) || !['manual', 'onfarm'].includes(text(row.origem_os)) || !text(row.numero_os)) throw new Error('Produção sem referência válida.');
    const parsed = sourceSchema.parse(row);
    if (!parsed.os_id || !parsed.origem_os || !parsed.numero_os) throw new Error('Produção sem referência válida.');
    return { ...parsed, os_id: parsed.os_id, origem_os: parsed.origem_os, numero_os: parsed.numero_os };
  }).filter(row => ['em_producao', 'aguardando_cq', 'aprovado_cq', 'envase', 'estoque_reserva', 'entrega', 'pronto_retirada', 'finalizada', 'concluida'].includes(row.status_esteira_oficial || row.status_os || '') && !['aberta', 'cancelada'].includes(row.status_os ?? '') && !!(row.produto_nome || row.microrganismo_nome));
  return { items, total: Number(envelope.total_count) };
}
export function canGenerateLooseLabel(roles: readonly string[]) { return roles.some(role => ['administrador', 'gestor', 'producao'].includes(role)); }
export function GerarEtiquetaAvulsa() {
  const { roles } = useAuth();
  const scope = useStorageAccessScope('etiqueta-avulsa');
  const [open, setOpen] = useState(false);
  if (!scope.ready || !canGenerateLooseLabel(roles)) return null;
  return <><Button variant="outline" onClick={() => setOpen(true)}><Tag className="mr-2 h-4 w-4" />Gerar etiqueta avulsa</Button>
    <Dialog open={open} onOpenChange={setOpen}>{open && <LooseLabelForm key={scope.scope} close={() => setOpen(false)} />}</Dialog></>;
}

type TextKey = 'product' | 'composition' | 'lot' | 'manufactured' | 'bottled' | 'expiry' | 'client' | 'farm' | 'order' | 'conservation' | 'notes' | 'volume';
const FIELDS: { key: TextKey; title: string; example: string; help: string; max: number; optional?: boolean; date?: boolean }[] = [
  { key: 'product', title: 'Produto', example: 'Bacillus subtilis', help: 'Nome conforme identificação do produto; preserve a grafia científica.', max: 120 },
  { key: 'composition', title: 'Identificação/composição do microrganismo', example: 'Bacillus subtilis — cepa identificada no documento técnico', help: 'Somente informação técnica aprovada, quando aplicável.', max: 300, optional: true },
  { key: 'lot', title: 'Lote / referência textual', example: 'LT-2026-0001', help: 'Referência textual; não cadastra nem altera um lote.', max: 60 },
  { key: 'manufactured', title: 'Fabricação', example: '16/11/2026', help: 'DD/MM/AAAA; data efetiva, nunca data programada.', max: 10, optional: true, date: true },
  { key: 'bottled', title: 'Envase', example: '17/11/2026', help: 'DD/MM/AAAA; data efetiva do envase.', max: 10, optional: true, date: true },
  { key: 'expiry', title: 'Validade', example: '16/02/2027', help: 'DD/MM/AAAA; somente validade informada e aprovada.', max: 10, optional: true, date: true },
  { key: 'client', title: 'Cliente / produtor', example: 'Fazenda Exemplo', help: 'Nome do destinatário; preserve a grafia do cadastro.', max: 120, optional: true },
  { key: 'farm', title: 'Fazenda', example: 'Fazenda Exemplo', help: 'Nome da propriedade, conforme cadastro.', max: 120, optional: true },
  { key: 'order', title: 'Pedido / referência', example: 'PED-2026-0001', help: 'Referência opcional; não cria ou altera pedido.', max: 60, optional: true },
  { key: 'volume', title: 'Volume / quantidade por recipiente', example: '20,000', help: 'Número positivo; até três casas decimais. Escolha a unidade ao lado.', max: 12 },
  { key: 'conservation', title: 'Conservação', example: 'Texto aprovado na ficha técnica', help: 'Transcreva a orientação aprovada, sem presumir temperatura.', max: 200, optional: true },
  { key: 'notes', title: 'Observações / alertas', example: 'Alerta aprovado pelo responsável técnico', help: 'Somente alertas operacionais aprovados; não invente classificação regulatória.', max: 300, optional: true },
];

function LooseLabelForm({ close }: { close: () => void }) {
  const scope = useStorageAccessScope('etiqueta-avulsa-form');
  const { roles } = useAuth();
  const company = useActiveTenantName();
  const [draft, setDraft] = useState<LooseLabelDraft>({ ...EMPTY_LOOSE_LABEL });
  const [search, setSearch] = useState(''); const [page, setPage] = useState(0);
  const [source, setSource] = useState<LabelProduction | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [logoMode, setLogoMode] = useState<'empresa' | 'custom' | 'none'>('empresa');
  const [logo, setLogo] = useState<PreparedLabelLogo>();
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoGeneration = useRef(0);
  useEffect(() => () => { logoGeneration.current++; }, []);
  const changeLogoMode = (mode: 'empresa' | 'custom' | 'none') => { logoGeneration.current++; setLogoMode(mode); setLogo(undefined); setLogoError(''); setLogoLoading(false); };
  const uploadLogo = async (file?: File) => {
    const generation = ++logoGeneration.current; const valid = scope.capture();
    setLogo(undefined); setLogoError('');
    if (!file) { setLogoLoading(false); return; }
    setLogoLoading(true);
    try { const result = await prepareLabelLogo(file, scope.scope); if (valid() && generation === logoGeneration.current) setLogo(result); }
    catch (error) { if (valid() && generation === logoGeneration.current) setLogoError(error instanceof Error ? error.message : 'Imagem inválida.'); }
    finally { if (valid() && generation === logoGeneration.current) setLogoLoading(false); }
  };
  const printRoot = useRef<HTMLDivElement>(null);
  const current = useRef(scope.scope); current.current = scope.scope;
  const query = useCockpitQuery({
    queryKey: ['cockpit-laboratorio', COCKPIT_LIST_RPC, 'etiqueta-avulsa', search, page], reader: 'listRPC', enabled: draft.origin === 'producao',
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc(COCKPIT_LIST_RPC as never, { p_busca: search.trim() || null, p_incluir_finalizadas: true, p_limit: 50, p_offset: page * 50 } as never).abortSignal(signal);
      if (error) throw error;
      return parseLabelProductions(data);
    },
  });
  const effective = { ...draft, company: company.name ?? '' };
  const preview = useMemo(() => {
    try {
      const labels = createLooseLabels(effective, logoMode === 'custom' ? logo : undefined, scope.scope);
      labels.forEach(label => labelLayout(label, draft.format));
      return { labels, error: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revise os campos obrigatórios.';
      try { const errors = JSON.parse(message); return { labels: [], error: errors.map((e: { message: string }) => e.message).join(' ') }; } catch { return { labels: [], error: message }; }
    }
  }, [draft, company.name, logo, logoMode, scope.scope]);
  const originChange = (origin: 'manual' | 'producao') => { setSource(null); setSearch(''); setPage(0); setDraft({ ...EMPTY_LOOSE_LABEL, origin }); };
  const choose = (key: string) => {
    const row = query.available && !query.isError ? query.data?.items.find(v => `${v.origem_os}:${v.os_id}` === key) : undefined;
    if (!row || !scope.ready) return;
    setSource(row);
    setDraft({ ...EMPTY_LOOSE_LABEL, origin: 'producao', productionKey: row.numero_os, product: row.produto_nome || row.microrganismo_nome || '', composition: row.microrganismo_nome || '', lot: row.codigo_lote || '', client: row.cliente_nome || row.titular_nome || '', farm: row.fazenda_nome || '' });
  };
  const currentSource = source && query.data?.items.find(row => row.os_id === source.os_id && row.origem_os === source.origem_os);
  const sourceUnchanged = !!source && !!currentSource && JSON.stringify(currentSource) === JSON.stringify(source);
  const canOutput = scope.ready && canGenerateLooseLabel(roles) && !logoLoading && !logoError && (logoMode !== 'custom' || !!logo) && !!preview.labels.length && (draft.origin === 'manual' || (sourceUnchanged && query.available && !query.isError && !query.isFetching));
  useEffect(() => {
    const clear = () => { if (printRoot.current) printRoot.current.dataset.authorized = 'false'; };
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); clear(); } };
    window.addEventListener('keydown', key); window.addEventListener('afterprint', clear);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('afterprint', clear); clear(); };
  }, []);
  const output = async (pdf: boolean) => {
    if (lock.current || !canOutput) return;
    lock.current = true; setBusy(true); const valid = scope.capture();
    const capturedScope = scope.scope;
    const capturedLogoGeneration = logoGeneration.current;
    try {
      if (!valid()) return;
      const labels = createLooseLabels(effective, logoMode === 'custom' ? logo : undefined, scope.scope); labels.forEach(label => labelLayout(label, draft.format));
      if (pdf) {
        const document = await createRecipientLabelsPdf(labels, draft.format, 'termica', window.location.origin);
        if (valid() && current.current === capturedScope && logoGeneration.current === capturedLogoGeneration) document.save('etiquetas-avulsas.pdf');
      } else if (valid() && printRoot.current) {
        await Promise.all(Array.from(printRoot.current.querySelectorAll('image')).map(async element => {
          const image = new Image(); image.src = element.getAttribute('href') ?? ''; await image.decode();
        }));
        if (!valid() || current.current !== capturedScope || logoGeneration.current !== capturedLogoGeneration) return;
        printRoot.current.dataset.authorized = 'true';
        window.print();
        printRoot.current.dataset.authorized = 'false';
      }
    } catch (error) { if (valid()) toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a saída.'); }
    finally { if (printRoot.current) printRoot.current.dataset.authorized = 'false'; lock.current = false; setBusy(false); }
  };
  const suggestions = query.available && !query.isError ? query.data?.items ?? [] : [];
  const size = LABEL_FORMATS[draft.format];
  return <DialogContent className="max-w-5xl flex flex-col p-0 overflow-hidden" aria-describedby="avulsa-description">
    <DialogHeader className="shrink-0 p-5 pr-12 border-b"><DialogTitle>Gerar etiqueta avulsa</DialogTitle><DialogDescription id="avulsa-description">Etiqueta operacional provisória; não substitui rotulagem legal obrigatória. Nenhum lote, estoque, pedido ou produção será criado ou alterado.</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto p-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="avulsa-origin">Origem</Label><Select value={draft.origin} onValueChange={value => originChange(value as 'manual' | 'producao')}><SelectTrigger id="avulsa-origin"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual / Avulsa</SelectItem><SelectItem value="producao">A partir da Produção</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="avulsa-company">Empresa</Label><Input id="avulsa-company" value={company.name ?? ''} readOnly placeholder="Empresa autorizada da sessão" /><p className="text-xs text-muted-foreground">Nome confirmado da empresa atual; não editável.</p></div></div>
      <section className="space-y-3" aria-label="Logomarca da etiqueta"><Label htmlFor="avulsa-logo-mode">Logomarca da etiqueta</Label>
        <Select value={logoMode} onValueChange={mode => changeLogoMode(mode as 'empresa' | 'custom' | 'none')}><SelectTrigger id="avulsa-logo-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="empresa">Usar logomarca da empresa</SelectItem><SelectItem value="custom">Enviar logomarca específica</SelectItem><SelectItem value="none">Sem logomarca</SelectItem></SelectContent></Select>
        {logoMode === 'empresa' && <p role="status" className="text-sm text-muted-foreground">Fallback textual: nome da empresa. O leitor autorizado atual fornece apenas o nome, não a imagem do tenant; nenhuma marca global será usada.</p>}
        {logoMode === 'none' && <p className="text-sm text-muted-foreground">Sem imagem; o nome da empresa permanece na etiqueta.</p>}
        {logoMode === 'custom' && <><Label htmlFor="avulsa-logo-file">Imagem do documento atual</Label><Input id="avulsa-logo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /><p className="text-xs text-muted-foreground">PNG, JPEG ou WebP; até 2 MB, 4096 px por lado e 16 megapixels. Recomenda-se 600 px ou mais e PNG/WebP com transparência. Convertida para tons de cinza, sem deformação; não é salva na empresa ou no Storage.</p>{logoLoading && <p role="status">Validando logomarca…</p>}{logo && <p role="status" className="text-sm">Logomarca pronta: {logo.width} × {logo.height} px.{Math.max(logo.width, logo.height) < 600 ? ' Resolução baixa; recomenda-se 600 px ou mais.' : ''}</p>}{logoError && <p role="alert" className="text-destructive">{logoError}</p>}</>}
      </section>
      {draft.origin === 'producao' && <div className="space-y-3 border-l-2 border-primary pl-3"><Label htmlFor="avulsa-search">Buscar produção da empresa</Label><Input id="avulsa-search" value={search} maxLength={120} placeholder="Ex.: OS-2026-0001 ou Bacillus subtilis" onChange={e => { setSearch(e.target.value); setPage(0); setSource(null); setDraft(v => ({ ...v, productionKey: undefined })); }} />
        <Select value={source ? `${source.origem_os}:${source.os_id}` : ''} onValueChange={choose} disabled={!query.available || query.isFetching || query.isError}><SelectTrigger aria-label="Selecionar produção"><SelectValue placeholder="Selecione uma produção acessível" /></SelectTrigger><SelectContent>{suggestions.map(row => <SelectItem key={`${row.origem_os}:${row.os_id}`} value={`${row.origem_os}:${row.os_id}`}>{row.numero_os} · {row.produto_nome || row.microrganismo_nome} · {row.status_esteira_oficial || row.status_os}</SelectItem>)}</SelectContent></Select>
        {query.isError || !query.available ? <p role="alert">Consulta de produção indisponível. Nenhum acesso alternativo será utilizado.</p> : query.isFetching ? <p role="status">Consultando produções…</p> : !suggestions.length ? <p role="status">Nenhuma produção disponível nesta página.</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(v => v - 1)}>Anterior</Button><Button variant="outline" disabled={!query.data || (page + 1) * 50 >= query.data.total || query.isFetching} onClick={() => setPage(v => v + 1)}>Próxima</Button></div>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">{FIELDS.map(field => {
        const locked = !!source && ((field.key === 'product' && !!(source.produto_nome || source.microrganismo_nome)) || (field.key === 'composition' && !!source.microrganismo_nome) || (field.key === 'lot' && !!source.codigo_lote) || (field.key === 'client' && !!(source.cliente_nome || source.titular_nome)) || (field.key === 'farm' && !!source.fazenda_nome));
        const list = ['product', 'client', 'farm'].includes(field.key) ? `avulsa-options-${field.key}` : undefined;
        return <div key={field.key} className="space-y-1 min-w-0"><Label htmlFor={`avulsa-${field.key}`}>{field.title}{field.optional ? ' (opcional)' : ' *'}</Label><Input id={`avulsa-${field.key}`} list={list} value={draft[field.key]} readOnly={locked} maxLength={field.max} placeholder={`Ex.: ${field.example}`} inputMode={field.date || field.key === 'volume' ? 'decimal' : 'text'} aria-describedby={`avulsa-help-${field.key}`} onChange={e => setDraft(v => ({ ...v, [field.key]: field.date ? maskLabelDate(e.target.value) : e.target.value, approved: false }))} /><p id={`avulsa-help-${field.key}`} className="text-xs text-muted-foreground">{locked ? 'Dado da produção selecionada; não editável. ' : ''}{field.help}</p>{list && <datalist id={list}>{[...new Set(suggestions.map(row => field.key === 'product' ? row.produto_nome || row.microrganismo_nome : field.key === 'client' ? row.cliente_nome || row.titular_nome : row.fazenda_nome).filter(Boolean))].map(value => <option key={value} value={value ?? ''} />)}</datalist>}</div>;
      })}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1"><Label>Unidade</Label><Select value={draft.unit} onValueChange={unit => setDraft(v => ({ ...v, unit: unit as LooseLabelDraft['unit'] }))}><SelectTrigger aria-label="Unidade"><SelectValue /></SelectTrigger><SelectContent>{['L', 'mL', 'kg', 'g'].map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Ex.: L; medida de cada recipiente.</p></div>{([{ key: 'quantity', title: 'Etiquetas a emitir', example: '3' }, { key: 'first', title: 'Primeiro recipiente', example: '1' }, { key: 'total', title: 'Total de recipientes', example: '3' }] as const).map(field => <div key={field.key} className="space-y-1"><Label htmlFor={`avulsa-${field.key}`}>{field.title}</Label><Input id={`avulsa-${field.key}`} type="number" min={1} max={500} step={1} value={String(draft[field.key])} placeholder={`Ex.: ${field.example}`} onChange={e => setDraft(v => ({ ...v, [field.key]: e.target.value }))} /><p className="text-xs text-muted-foreground">Inteiro de 1 a 500.</p></div>)}</div>
      <div className="space-y-2"><Label>Dimensões da etiqueta</Label><Select value={draft.format} onValueChange={format => setDraft(v => ({ ...v, format: format as LooseLabelDraft['format'] }))}><SelectTrigger aria-label="Dimensões da etiqueta"><SelectValue /></SelectTrigger><SelectContent>{['100x150', '100x100', '80x50'].map(format => <SelectItem key={format} value={format}>{format.replace('x', ' × ')} mm</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-3 items-start"><Checkbox id="avulsa-approved" checked={draft.approved} onCheckedChange={value => setDraft(v => ({ ...v, approved: value === true }))} /><Label htmlFor="avulsa-approved" className="leading-relaxed">Confirmo que identificação/composição, conservação e alertas informados possuem aprovação técnica. Esta confirmação não aprova rotulagem legal.</Label></div>
      {preview.error && <p role="alert" className="text-sm text-destructive">{preview.error}</p>}
      {source && !sourceUnchanged && !query.isFetching && <p role="alert" className="text-destructive">Produção alterada ou indisponível. Selecione novamente antes de emitir.</p>}
      <section aria-label="Prévia da etiqueta" className="space-y-3"><h3 className="font-semibold">Prévia · {size.width} × {size.height} mm</h3><p className="text-sm text-muted-foreground">{draft.origin === 'manual' ? 'Avulsa — não vinculada à produção.' : 'Dados disponíveis da produção; complemento manual somente nos campos sem informação.'} Sem rastreio QR: não há URI real de consulta para esta etiqueta. Histórico e reimpressões não são registrados.</p>
        {preview.labels[0] && <div className="loose-label-preview"><div className="loose-label-paper"><LabelScene label={preview.labels[0]} format={draft.format} origin={window.location.origin} /></div></div>}
      </section>
    </div>
    <div className="shrink-0 p-4 border-t flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={close}>Fechar</Button><Button variant="outline" disabled={!canOutput || busy} onClick={() => void output(false)}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button disabled={!canOutput || busy} onClick={() => void output(true)}><Download className="mr-2 h-4 w-4" />Gerar PDF</Button></div>
    <div id="loose-label-print" ref={printRoot} data-authorized="false" aria-hidden="true">{canOutput && preview.labels.map((label, i) => <div className="loose-label-sheet" key={i}><LabelScene label={label} format={draft.format} origin={window.location.origin} /></div>)}</div>
    {canOutput && <style>{`@media print { @page { size: ${size.width}mm ${size.height}mm; margin: 0; } }`}</style>}
  </DialogContent>;
}