import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useTenantCatalogEditor } from '@/hooks/useTenantCatalogEditor';
import { supabase } from '@/integrations/supabase/client';
import { assertMutationAck } from '@/lib/etiquetas';
import { approvedDate, record, text } from '@/lib/etiquetasRecipientes';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Props = { kind: 'validade' | 'toxicidade'; targetId: string; targetName: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UI eligibility is restrictive only; the installed RPC authorizes the actual actor and tenant. */
export function LabelTechnicalDataDialog(props: Props) {
  const editor = useTenantCatalogEditor();
  if (!editor.canEdit || !uuid.test(props.targetId)) return null;
  return <TechnicalForm key={`${editor.scope}:${props.kind}:${props.targetId}`} {...props} />;
}

function TechnicalForm({ kind, targetId, targetName }: Props) {
  const editor = useTenantCatalogEditor();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const validity = kind === 'validade';
  const title = validity ? 'Aprovar validade do lote' : 'Cadastrar toxicidade do produto';
  const changeOpen = (next: boolean) => {
    if (lock.current) return;
    setOpen(next);
    if (next) { setValue(''); setReference(''); setError(''); setSuccess(''); setUncertain(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || uncertain || success || !editor.canEdit) return;
    const valid = editor.capture();
    if (!valid()) return;
    setError('');
    try {
      if (!reference.trim()) throw new Error('Informe a referência técnica aprovada.');
      if (validity) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Informe a data de validade aprovada.');
        approvedDate(value);
      } else if (!value.trim()) throw new Error('Informe o texto de toxicidade aprovado para o produto.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Dados inválidos.'); return; }
    lock.current = true; setBusy(true);
    try {
      if (!valid()) return;
      const result = validity
        ? await (supabase as any).rpc('rpc_aprovar_validade_etiqueta_lote', { p_lote_id: targetId, p_validade: value, p_referencia: reference.trim() })
        : await (supabase as any).rpc('rpc_cadastrar_toxicidade_etiqueta_produto', { p_produto_id: targetId, p_toxicidade: value.trim(), p_referencia: reference.trim() });
      if (!valid() || !mounted.current) return;
      if (result.error) {
        const code = text(record(result.error).code);
        if (code === '42501' || result.status === 401 || result.status === 403) throw new Error('O servidor recusou o cadastro. Confira seu acesso de gestor/administrador e a empresa do lote ou produto.');
        if (!code || result.status >= 500) { setUncertain(true); throw new Error('Cadastro não confirmado. Confira os dados antes de uma nova tentativa; nenhum reenvio automático foi feito.'); }
        throw new Error(text(record(result.error).message) || 'O servidor recusou os dados técnicos. Revise os campos e a referência.');
      }
      assertMutationAck(result.data);
      if (!validity && (typeof result.data !== 'string' || !uuid.test(result.data))) {
        setUncertain(true); throw new Error('Perfil técnico não confirmado. Confira o cadastro antes de repetir.');
      }
      setSuccess(validity ? 'Validade aprovada para este lote. Gere novas etiquetas para usar os dados aprovados.' : 'Toxicidade cadastrada para este produto.');
    } catch (cause) {
      if (valid() && mounted.current) { if (cause instanceof TypeError || !(cause instanceof Error)) setUncertain(true); setError(cause instanceof TypeError ? 'Cadastro não confirmado. Confira os dados antes de repetir; nenhum reenvio automático.' : cause instanceof Error ? cause.message : 'Cadastro não confirmado. Confira os dados antes de repetir.'); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline"><ClipboardCheck className="mr-1 h-4 w-4" />{validity ? 'Validade do lote' : 'Toxicidade do produto'}</Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <p className="text-sm break-words">{validity ? 'Lote' : 'Produto'}: <strong>{targetName}</strong></p>
      <p className="text-sm text-muted-foreground">{validity ? 'A validade afeta somente este lote.' : 'A toxicidade afeta este produto e será usada nas novas etiquetas de seus lotes.'} Etiquetas existentes mantêm o snapshot original.</p>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-2 text-sm">{validity ? 'Validade aprovada' : 'Toxicidade aprovada'}
          {validity ? <Input type="date" value={value} onChange={e => setValue(e.target.value)} required disabled={busy || !!success || uncertain} /> : <Textarea value={value} onChange={e => setValue(e.target.value)} required disabled={busy || !!success || uncertain} />}
        </label>
        <label className="block space-y-2 text-sm">Referência técnica<Input value={reference} onChange={e => setReference(e.target.value)} required disabled={busy || !!success || uncertain} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="text-sm break-words">{success}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={() => changeOpen(false)}>Fechar</Button><Button type="submit" disabled={busy || !!success || uncertain || !value.trim() || !reference.trim() || !editor.canEdit}>{busy ? 'Salvando…' : validity ? 'Aprovar validade' : 'Cadastrar toxicidade'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}