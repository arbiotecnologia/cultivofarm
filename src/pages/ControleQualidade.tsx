import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/cultivofarm.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ResponsiveHelpers';
import { AuxiliaryScreenBanner } from '@/components/AuxiliaryScreenBanner';
import { RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatConcentracaoDisplay } from '@/lib/cqFormat';
import {
  ROTULO_CONFORMIDADE, ROTULO_RESULTADO, avaliarFaixa, avaliarMinimo, avaliarTexto, cockpitCQ,
  dataCQ, dataHoraCQ, divergencias, faixaTexto, formatNumero, noPeriodo, normalizar,
  selecionarReferencia, statusCQ, validarPeriodo, vinculoOS, type EstadoConformidade, type Referencia,
} from '@/lib/cq/consulta';

type CQRow = Database['public']['Tables']['controle_qualidade']['Row'];
type LoteRel = {
  codigo_lote: string; status: string; produto_id: string | null; microrganismo_id: string | null;
  programacao_id: string | null; data_producao: string | null;
  produtos: { nome: string } | null;
  microrganismos: { nome: string; nome_cientifico: string | null } | null;
};
type CQ = CQRow & { lotes: LoteRel | null; osId?: string | null; vinculo?: string };

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const itemNome = (l: LoteRel | null) =>
  l?.produtos?.nome || l?.microrganismos?.nome_cientifico || l?.microrganismos?.nome || 'Item não informado';
const badgeVariant = (s: string) => (s === 'aprovado' ? 'default' : s === 'reprovado' ? 'destructive' : 'outline');
const conformeClass = (e: EstadoConformidade) =>
  e === 'nao_conforme' ? 'text-destructive' : e === 'conforme' ? 'text-status-aprovado' : 'text-muted-foreground';

export default function ControleQualidade() {
  const navigate = useNavigate();
  const [cqs, setCqs] = useState<CQ[]>([]);
  const [refs, setRefs] = useState<Referencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [resultado, setResultado] = useState('');
  const [lote, setLote] = useState('');
  const [item, setItem] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [page, setPage] = useState(1);
  const [selecionado, setSelecionado] = useState<CQ | null>(null);
  const version = useRef(0);
  const controller = useRef<AbortController>();

  const fetchAll = useCallback(async () => {
    const current = ++version.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 30000);
    setLoading(true); setError('');
    try {
      const rows: CQ[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await supabase
          .from('controle_qualidade')
          .select('*, lotes(codigo_lote, status, produto_id, microrganismo_id, programacao_id, data_producao, produtos(nome), microrganismos(nome, nome_cientifico))')
          .order('data_analise', { ascending: false }).order('id')
          .range(offset, offset + 199).abortSignal(abort.signal);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('missing');
        rows.push(...(result.data as unknown as CQ[]));
        if (result.data.length < 200) break;
      }
      const unique = [...new Map(rows.map(c => [c.id, c])).values()];
      const progIds = [...new Set(unique.flatMap(c => (c.lotes?.programacao_id ? [c.lotes.programacao_id] : [])))];
      const progs = new Map<string, { ordem_servico_id: string | null; ordem_servico_onfarm_id: string | null }>();
      for (let i = 0; i < progIds.length; i += 100) {
        const result = await supabase.from('programacao_producao')
          .select('id, ordem_servico_id, ordem_servico_onfarm_id')
          .in('id', progIds.slice(i, i + 100)).abortSignal(abort.signal);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('missing');
        result.data.forEach(p => progs.set(p.id, p));
      }
      const refRows: Referencia[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await supabase.from('cq_parametros_referencia')
          .select('microrganismo_id, produto_id, ph_min, ph_max, concentracao_min_ufc_ml, aparencia_esperada, odor_esperado, contaminacao_esperada, ativo')
          .eq('ativo', true).order('id').range(offset, offset + 199).abortSignal(abort.signal);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('missing');
        refRows.push(...(result.data as Referencia[]));
        if (result.data.length < 200) break;
      }
      if (current !== version.current) return;
      setCqs(unique.map(c => {
        const prog = c.lotes?.programacao_id ? progs.get(c.lotes.programacao_id) : undefined;
        const { osId, aviso } = vinculoOS(prog, !!c.lotes?.programacao_id);
        return { ...c, osId, vinculo: aviso };
      }));
      setRefs(refRows);
    } catch {
      if (current === version.current) {
        setError('Não foi possível carregar as análises de qualidade e seus vínculos. Confira sua conexão e permissão e tente novamente.');
      }
    } finally {
      clearTimeout(timeout);
      if (current === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
    return () => { ++version.current; controller.current?.abort(); };
  }, [fetchAll]);
  useEffect(() => setPage(1), [search, resultado, lote, item, responsavel, inicio, fim]);

  const avaliacoes = useMemo(() => new Map(cqs.map(c => {
    const ref = selecionarReferencia(refs, c.lotes?.microrganismo_id, c.lotes?.produto_id);
    const ph = avaliarFaixa(c.ph, ref?.ph_min, ref?.ph_max);
    const conc = avaliarMinimo(c.concentracao, ref?.concentracao_min_ufc_ml);
    const aparencia = avaliarTexto(c.aparencia, ref?.aparencia_esperada);
    const odor = avaliarTexto(c.odor, ref?.odor_esperado);
    const contaminacao = avaliarTexto(c.contaminacao, ref?.contaminacao_esperada);
    const estados = [ph, conc, aparencia, odor, contaminacao].filter(e => e !== 'indeterminado');
    return [c.id, { ref, ph, conc, aparencia, odor, contaminacao, avisos: divergencias(c.resultado, estados, c.lotes?.status) }];
  })), [cqs, refs]);

  const periodo = validarPeriodo(inicio, fim);
  const erroPeriodo = periodo.valido ? '' : periodo.mensagem;
  const periodoInvalido = !periodo.valido;
  const filtrados = useMemo(() => {
    if (periodoInvalido) return [];
    return cqs.filter(c =>
    (!resultado || statusCQ(c.resultado) === resultado)
    && (!lote || c.lote_id === lote)
    && (!item || c.lotes?.produto_id === item || c.lotes?.microrganismo_id === item)
    && (!responsavel || (c.responsavel || '') === responsavel)
    && noPeriodo(c.data_analise, inicio, fim)
    && normalizar([c.lotes?.codigo_lote, itemNome(c.lotes ?? null), c.responsavel, c.aparencia, c.odor, c.contaminacao, c.osId].filter(Boolean).join(' ')).includes(normalizar(search))
    );
  }, [cqs, search, resultado, lote, item, responsavel, inicio, fim, periodoInvalido]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visiveis = filtrados.slice((currentPage - 1) * 20, currentPage * 20);
  const ready = !loading && !error;
  const sel = selecionado ? cqs.find(c => c.id === selecionado.id) ?? selecionado : null;
  const selAval = sel ? (avaliacoes.get(sel.id) as any) : null;

  return (
    <div className="space-y-6">
      <AuxiliaryScreenBanner
        title="Consulta de laudos de Controle de Qualidade"
        description="Histórico somente leitura das análises por lote. O registro de resultados e o avanço da esteira acontecem no Cockpit Laboratório."
      />
      <PageHeader
        title="Controle de Qualidade"
        description="Consulta e histórico de análises por lote"
        action={<>
          <Button variant="outline" disabled={loading} onClick={() => void fetchAll()}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar
          </Button>
          <Button variant="outline" onClick={() => navigate(cockpitCQ())}>
            <ExternalLink className="mr-2 h-4 w-4" />Ir para o Cockpit
          </Button>
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm" htmlFor="cq-busca">Buscar análises
          <Input id="cq-busca" value={search} maxLength={200} placeholder="Lote, produto, microrganismo, responsável ou OS" onChange={e => setSearch(e.target.value)} />
        </label>
        <label className="text-sm">Resultado
          <select className={selectClass} value={resultado} onChange={e => setResultado(e.target.value)}>
            <option value="">Todos os resultados</option>
            {['aprovado', 'reprovado', 'pendente'].map(s => <option key={s} value={s}>{ROTULO_RESULTADO[s]}</option>)}
          </select>
        </label>
        <label className="text-sm">Lote
          <select className={selectClass} value={lote} onChange={e => setLote(e.target.value)}>
            <option value="">Todos os lotes</option>
            {[...new Map(cqs.map(c => [c.lote_id, c.lotes?.codigo_lote || 'Lote não disponível'])).entries()].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </label>
        <label className="text-sm">Produto ou microrganismo
          <select className={selectClass} value={item} onChange={e => setItem(e.target.value)}>
            <option value="">Todos os itens</option>
            {[...new Map(cqs.flatMap(c => {
              const id = c.lotes?.produto_id || c.lotes?.microrganismo_id;
              return id ? [[id, itemNome(c.lotes ?? null)] as [string, string]] : [];
            })).entries()].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </label>
        <label className="text-sm">Responsável
          <select className={selectClass} value={responsavel} onChange={e => setResponsavel(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {[...new Set(cqs.flatMap(c => (c.responsavel ? [c.responsavel] : [])))].sort().map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-sm">Análise a partir de<Input type="date" value={inicio} aria-invalid={periodoInvalido} aria-describedby={periodoInvalido ? 'cq-periodo-erro' : undefined} onChange={e => setInicio(e.target.value)} /></label>
        <label className="text-sm">Análise até<Input type="date" value={fim} aria-invalid={periodoInvalido} aria-describedby={periodoInvalido ? 'cq-periodo-erro' : undefined} onChange={e => setFim(e.target.value)} /></label>
        <Button variant="outline" className="self-end" onClick={() => { setSearch(''); setResultado(''); setLote(''); setItem(''); setResponsavel(''); setInicio(''); setFim(''); setPage(1); }}>Limpar filtros</Button>
      </div>

      {erroPeriodo && <p id="cq-periodo-erro" role="alert" className="text-destructive">{erroPeriodo}</p>}
      {ready && refs.length === 0 && <p role="status" className="text-muted-foreground">Nenhuma referência ativa acessível. A avaliação de conformidade depende da configuração de referências.</p>}
      {loading && <p role="status">Carregando análises de qualidade…</p>}
      {error && <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={() => void fetchAll()}>Tentar novamente</Button></div>}

      {ready && !periodoInvalido && <>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {filtrados.length} de {cqs.length} análise(s) acessível(is)
        </p>
        {filtrados.length === 0
          ? <p className="py-8 text-center text-muted-foreground">Nenhuma análise encontrada com os filtros atuais.</p>
          : <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela de análises de qualidade">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Lote</TableHead><TableHead>Item</TableHead><TableHead>pH</TableHead>
                <TableHead>Concentração (UFC/mL)</TableHead><TableHead>Contaminação</TableHead>
                <TableHead>Responsável</TableHead><TableHead>Data da análise</TableHead>
                <TableHead>Resultado</TableHead><TableHead>Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>{visiveis.map(c => {
                const aval = avaliacoes.get(c.id) as any;
                const status = statusCQ(c.resultado);
                return <TableRow key={c.id}>
                  <TableCell className="font-mono-data font-medium">{c.lotes?.codigo_lote || 'Lote não disponível'}</TableCell>
                  <TableCell>{itemNome(c.lotes ?? null)}</TableCell>
                  <TableCell className={`font-mono-data ${conformeClass(aval.ph)}`}>{formatNumero(c.ph)}</TableCell>
                  <TableCell className={`font-mono-data ${conformeClass(aval.conc)}`}>{formatConcentracaoDisplay(c.concentracao)}</TableCell>
                  <TableCell>{c.contaminacao || '—'}</TableCell>
                  <TableCell>{c.responsavel || '—'}</TableCell>
                  <TableCell>{dataCQ(c.data_analise)}</TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(status)} className={status === 'aprovado' ? 'bg-status-aprovado' : ''}>{ROTULO_RESULTADO[status]}</Badge>
                    {aval.avisos.length > 0 && <p className="mt-1 text-xs text-destructive">{aval.avisos[0]}</p>}
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap">
                    <Button variant="ghost" size="sm" aria-label={`Ver laudo do lote ${c.lotes?.codigo_lote || 'sem código'}`} onClick={() => setSelecionado(c)}>Laudo</Button>
                    <Button variant="outline" size="sm" disabled={!c.osId} aria-label={`Consultar lote ${c.lotes?.codigo_lote || 'sem código'} no Cockpit`} onClick={() => navigate(cockpitCQ(c.osId))}>Cockpit</Button>
                    {!c.osId && <span className="block text-xs text-muted-foreground">{c.vinculo}</span>}
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>}
        <nav aria-label="Paginação de análises" className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" size="icon" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span aria-live="polite">Página {currentPage} de {totalPages}</span>
          <Button variant="outline" size="icon" aria-label="Próxima página" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </nav>
      </>}

      <Dialog open={!!sel} onOpenChange={o => !o && setSelecionado(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Laudo de análise técnica</DialogTitle>
            <DialogDescription>Consulta somente leitura. Correções e novo parecer são registrados no Cockpit Laboratório.</DialogDescription>
          </DialogHeader>
          {sel && selAval && <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 gap-4 border-b pb-4 sm:grid-cols-2">
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Lote</p><p className="font-mono-data">{sel.lotes?.codigo_lote || 'Lote não disponível'}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Item</p><p>{itemNome(sel.lotes ?? null)}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Data da análise</p><p>{dataCQ(sel.data_analise)}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Registro</p><p>{dataHoraCQ(sel.created_at)}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Responsável</p><p>{sel.responsavel || '—'}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Ordem de serviço</p><p className="font-mono-data">{sel.osId || sel.vinculo || '—'}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Produção do lote</p><p>{dataCQ(sel.lotes?.data_producao)}</p></div>
              <div><p className="text-xs font-bold uppercase text-muted-foreground">Status do lote</p><p>{sel.lotes?.status || 'Não informado'}</p></div>
            </div>

            <Table>
              <TableHeader><TableRow>
                <TableHead>Parâmetro</TableHead><TableHead>Unidade</TableHead><TableHead>Limite de referência</TableHead>
                <TableHead>Valor</TableHead><TableHead>Conformidade</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>pH</TableCell><TableCell>pH</TableCell>
                  <TableCell>{faixaTexto(selAval.ref?.ph_min, selAval.ref?.ph_max)}</TableCell>
                  <TableCell className="font-mono-data">{formatNumero(sel.ph)}</TableCell>
                  <TableCell className={conformeClass(selAval.ph)}>{ROTULO_CONFORMIDADE[selAval.ph as EstadoConformidade]}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Concentração</TableCell><TableCell>UFC/mL</TableCell>
                  <TableCell>{selAval.ref?.concentracao_min_ufc_ml != null ? `≥ ${formatConcentracaoDisplay(selAval.ref.concentracao_min_ufc_ml)}` : 'Sem limite cadastrado'}</TableCell>
                  <TableCell className="font-mono-data">{formatConcentracaoDisplay(sel.concentracao)}</TableCell>
                  <TableCell className={conformeClass(selAval.conc)}>{ROTULO_CONFORMIDADE[selAval.conc as EstadoConformidade]}</TableCell>
                </TableRow>
                {([['Aparência', sel.aparencia, selAval.ref?.aparencia_esperada, selAval.aparencia],
                   ['Odor', sel.odor, selAval.ref?.odor_esperado, selAval.odor],
                   ['Contaminação', sel.contaminacao, selAval.ref?.contaminacao_esperada, selAval.contaminacao]] as const).map(([nome, valor, esperado, estado]) => (
                  <TableRow key={nome}>
                    <TableCell>{nome}</TableCell><TableCell>—</TableCell>
                    <TableCell>{esperado || 'Sem limite cadastrado'}</TableCell>
                    <TableCell>{valor || '—'}</TableCell>
                    <TableCell className={conformeClass(estado as EstadoConformidade)}>{ROTULO_CONFORMIDADE[estado as EstadoConformidade]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="rounded-lg bg-muted p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Parecer final</p>
              <p className={`text-lg font-bold uppercase ${statusCQ(sel.resultado) === 'aprovado' ? 'text-status-aprovado' : statusCQ(sel.resultado) === 'reprovado' ? 'text-destructive' : ''}`}>
                {ROTULO_RESULTADO[statusCQ(sel.resultado)]}
              </p>
              {selAval.avisos.map((a: string) => <p key={a} role="alert" className="mt-1 text-sm text-destructive">{a}</p>)}
            </div>

            <p className="text-xs text-muted-foreground">
              Observações e anexos de laudo não fazem parte do cadastro atual de análises; por isso não são exibidos nem presumidos aqui.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" disabled={!sel.osId} onClick={() => navigate(cockpitCQ(sel.osId))}>Abrir no Cockpit</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
