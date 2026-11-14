import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/cultivofarm.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ResponsiveHelpers';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { EtiquetaProdutoActions } from '@/components/etiquetas/EtiquetaProdutoActions';
import { cockpitLote, dataLote, noPeriodo, normalizar, resumoVolumes, volumeL } from '@/lib/lotes/consulta';

type Row = Database['public']['Tables']['lotes']['Row'];
type Envase = Pick<Database['public']['Tables']['envase']['Row'], 'lote_id' | 'quantidade' | 'volume_por_unidade'>;
type Lote = Row & { produtos: { nome: string } | null; microrganismos: { nome: string; nome_cientifico: string | null } | null; osId?: string | null; vinculo?: string };
const labels: Record<string, string> = { em_producao: 'Em produção', aguardando_cq: 'Aguardando CQ', aprovado: 'Aprovado', reprovado: 'Reprovado' };
const itemNome = (l: Lote) => l.produtos?.nome || l.microrganismos?.nome_cientifico || l.microrganismos?.nome || 'Item não informado';
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export default function Lotes() {
  const navigate = useNavigate();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [produto, setProduto] = useState('');
  const [micro, setMicro] = useState('');
  const [os, setOs] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [page, setPage] = useState(1);
  const version = useRef(0);
  const controller = useRef<AbortController>();
  const fetchAll = useCallback(async () => {
    const current = ++version.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 30000);
    setLoading(true); setError('');
    try {
      // Fetch all visible rows in stable pages, avoiding implicit API truncation.
      const rows: Lote[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await supabase.from('lotes').select('*, produtos(nome), microrganismos(nome, nome_cientifico)').order('created_at', { ascending: false }).order('id').range(offset, offset + 199).abortSignal(abort.signal);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('missing');
        rows.push(...result.data);
        if (result.data.length < 200) break;
      }
      const unique = [...new Map(rows.map(l => [l.id, l])).values()];
      const allEnvases: Envase[] = [];
      for (let start = 0; start < unique.length; start += 100) {
        const ids = unique.slice(start, start + 100).map(l => l.id);
        for (let offset = 0; ; offset += 200) {
          const result = await supabase.from('envase').select('lote_id, quantidade, volume_por_unidade').in('lote_id', ids).order('id').range(offset, offset + 199).abortSignal(abort.signal);
          if (result.error) throw result.error;
          if (!result.data) throw new Error('missing');
          allEnvases.push(...result.data);
          if (result.data.length < 200) break;
        }
      }
      const progIds = [...new Set(unique.flatMap(l => l.programacao_id ? [l.programacao_id] : []))];
      const progs = new Map<string, { ordem_servico_id: string | null; ordem_servico_onfarm_id: string | null }>();
      for (let i = 0; i < progIds.length; i += 100) {
        const result = await supabase.from('programacao_producao').select('id, ordem_servico_id, ordem_servico_onfarm_id').in('id', progIds.slice(i, i + 100)).abortSignal(abort.signal);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('missing');
        result.data.forEach(p => progs.set(p.id, p));
      }
      if (current !== version.current) return;
      setLotes(unique.map(l => {
        const p = l.programacao_id ? progs.get(l.programacao_id) : undefined;
        const ambiguous = !!p?.ordem_servico_id && !!p?.ordem_servico_onfarm_id;
        return { ...l, osId: ambiguous ? null : p?.ordem_servico_id || p?.ordem_servico_onfarm_id, vinculo: ambiguous ? 'Vínculo de OS ambíguo' : !p ? 'Programação ausente ou indisponível' : !(p.ordem_servico_id || p.ordem_servico_onfarm_id) ? 'OS não vinculada' : undefined };
      }));
      setEnvases(allEnvases);
    } catch {
      if (current === version.current) setError('Não foi possível carregar os lotes e seus vínculos. Confira sua conexão e permissão e tente novamente.');
    } finally {
      clearTimeout(timeout);
      if (current === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchAll();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void fetchAll(), 1200); };
    const channel = supabase.channel('lotes-consulta').on('postgres_changes', { event: '*', schema: 'public', table: 'lotes' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'envase' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'programacao_producao' }, refresh).subscribe();
    return () => { ++version.current; controller.current?.abort(); clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [fetchAll]);
  useEffect(() => setPage(1), [search, status, produto, micro, os, inicio, fim]);
  const invalidPeriod = !!inicio && !!fim && inicio > fim;
  const filtered = useMemo(() => lotes.filter(l => !invalidPeriod && (!status || l.status === status) && (!produto || l.produto_id === produto) && (!micro || l.microrganismo_id === micro) && (!os || l.osId === os) && noPeriodo(l.data_producao, inicio, fim) && normalizar([l.codigo_lote, itemNome(l), l.microrganismos?.nome, l.tanque, l.responsavel_producao, l.osId].filter(Boolean).join(' ')).includes(normalizar(search))), [lotes, search, status, produto, micro, os, inicio, fim, invalidPeriod]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const volumes = useMemo(() => {
    const byLote = new Map<string, Envase[]>();
    envases.forEach(e => byLote.set(e.lote_id, [...(byLote.get(e.lote_id) || []), e]));
    return new Map(lotes.map(l => [l.id, resumoVolumes(l.volume_produzido, byLote.get(l.id) || [])]));
  }, [lotes, envases]);
  const ready = !loading && !error;
  return <div className="space-y-6">
    <PageHeader title="Lotes" description="Consulta e histórico de produção" action={<><Button variant="outline" disabled={loading} onClick={() => void fetchAll()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button><Button variant="outline" onClick={() => navigate(cockpitLote())}><ExternalLink className="mr-2 h-4 w-4" />Ir para o Cockpit</Button></>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Buscar lotes<Input value={search} maxLength={200} placeholder="Código, item, tanque, responsável ou OS" onChange={e => setSearch(e.target.value)} /></label>
      <label className="text-sm">Status<select className={selectClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{[...new Set(lotes.map(l => l.status))].sort().map(s => <option key={s} value={s}>{labels[s] || s}</option>)}</select></label>
      <label className="text-sm">Produto<select className={selectClass} value={produto} onChange={e => setProduto(e.target.value)}><option value="">Todos os produtos</option>{[...new Map(lotes.filter(l => l.produto_id).map(l => [l.produto_id, l.produtos?.nome || 'Produto não disponível'])).entries()].map(([id, name]) => <option key={id} value={id || ''}>{name}</option>)}</select></label>
      <label className="text-sm">Microrganismo<select className={selectClass} value={micro} onChange={e => setMicro(e.target.value)}><option value="">Todos os microrganismos</option>{[...new Map(lotes.filter(l => l.microrganismo_id).map(l => [l.microrganismo_id, l.microrganismos?.nome_cientifico || l.microrganismos?.nome || 'Microrganismo não disponível'])).entries()].map(([id, name]) => <option key={id} value={id || ''}>{name}</option>)}</select></label>
      <label className="text-sm">Ordem de serviço<select className={selectClass} value={os} onChange={e => setOs(e.target.value)}><option value="">Todas as OS</option>{[...new Set(lotes.flatMap(l => l.osId ? [l.osId] : []))].map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <label className="text-sm">Produção a partir de<Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
      <label className="text-sm">Produção até<Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></label>
      <Button variant="outline" className="self-end" onClick={() => { setSearch(''); setStatus(''); setProduto(''); setMicro(''); setOs(''); setInicio(''); setFim(''); setPage(1); }}>Limpar filtros</Button>
    </div>
    {invalidPeriod && <p role="alert" className="text-destructive">A data final não pode ser anterior à inicial.</p>}
    {loading && <p role="status">Carregando lotes e vínculos…</p>}
    {error && <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={() => void fetchAll()}>Tentar novamente</Button></div>}
    {ready && <>
      <p role="status" className="text-sm text-muted-foreground">{filtered.length} de {lotes.length} lotes acessíveis · Mais recentes primeiro</p>
      {!filtered.length ? <p>{lotes.length ? 'Nenhum lote corresponde aos filtros.' : 'Nenhum lote disponível para consulta.'}</p> : <div className="overflow-x-auto" role="region" aria-label="Histórico de lotes" tabIndex={0}><Table><TableHeader><TableRow>{['Código / OS', 'Item', 'Produção', 'Volumes', 'Tanque / responsável', 'Status', 'Rastreabilidade'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(l => {
        const v = volumes.get(l.id);
        return <TableRow key={l.id}>
          <TableCell className="min-w-40 break-words"><strong>{l.codigo_lote || 'Código não informado'}</strong><p className="text-xs text-muted-foreground break-all">{l.osId || l.vinculo}</p></TableCell>
          <TableCell className="min-w-40">{itemNome(l)}</TableCell>
          <TableCell className="whitespace-nowrap">{dataLote(l.data_producao)}</TableCell>
          <TableCell className="min-w-44"><p>Produzido: {volumeL(v?.produzido)}</p><p>Envasado: {volumeL(v?.envasado)}</p><p>Saldo de envase: {volumeL(v?.saldo)}</p>{v?.inconsistente && <p className="text-destructive text-xs">Volumes inconsistentes ou incompletos</p>}</TableCell>
          <TableCell>{l.tanque || '—'}<p className="text-muted-foreground">{l.responsavel_producao || '—'}</p></TableCell>
          <TableCell><Badge variant="outline">{labels[l.status] || l.status || 'Não informado'}</Badge></TableCell>
          <TableCell><EtiquetaProdutoActions loteId={l.id} /><Button variant="outline" size="sm" disabled={!l.osId} aria-label={`Consultar lote ${l.codigo_lote || 'sem código'} no Cockpit`} onClick={() => navigate(cockpitLote(l.osId))}>Consultar no Cockpit</Button>{!l.osId && <p className="text-xs text-muted-foreground mt-1">{l.vinculo}</p>}</TableCell>
        </TableRow>;
      })}</TableBody></Table></div>}
      <nav aria-label="Paginação de lotes" className="flex flex-wrap items-center justify-end gap-3"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span aria-live="polite">Página {currentPage} de {totalPages}</span><Button variant="outline" size="icon" aria-label="Próxima página" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></nav>
    </>}
  </div>;
}
