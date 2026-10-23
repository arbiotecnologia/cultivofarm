import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { EXTERNAL_USER_EDIT_PHASE2_REVIEWED } from '@/lib/configuracoes/externalUserEditGate';
import { buildCommonExternalEdit, submitCommonExternalEditCandidate, validateCommonExternalEdit, type CandidateClient, type CommonExternalEdit } from '@/lib/configuracoes/externalUserEditCandidate';
import { classificarErroRpcEdicao, executarComDeadlineEdicao } from '@/lib/configuracoes/edicaoUsuarioRpc';
import { unmaskCpfCnpj, validatePhoneBR } from '@/lib/masks';
import { readPauseState, writePauseState } from '@/lib/authz/pauseRetainedState';

export type ExternalCommonTarget = {
  user_id: string;
  updated_at: string;
  roles: string[];
} & CommonExternalEdit['profile'];

type Props = {
  target: ExternalCommonTarget;
  scope: string;
  actorId: string;
  organizationId: string;
  ready: boolean;
  expectedVersion?: string;
  snapshotReady: boolean;
  snapshotError?: boolean;
  isCurrent: () => boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
  /**
   * Chave de retenção volátil do rascunho (identidade + época + alvo).
   * Presente: o rascunho digitado sobrevive a um unmount transitório de
   * pausa de autorização e é descartado quando a época/identidade muda
   * (revogação) ou quando o diálogo fecha explicitamente. Ausente: comportamento
   * publicado inalterado. Nunca altera os fences CAS/snapshot do envio.
   */
  draftKey?: string;
};

/**
 * Contexto CAS completo sob o qual o rascunho foi digitado. Restaurar valores
 * sob outro baseline (versão/updated_at/escopo/ator/tenant/papéis) seria um
 * rebase silencioso: proibido. O rascunho só volta editável/enviável quando o
 * baseline atual é idêntico; caso contrário o formulário fica bloqueado em
 * conflito, mantendo o CAS original (nunca adota o CAS novo).
 */
type RetainedBaseline = {
  scope: string; actorId: string; organizationId: string;
  userId: string; updatedAt: string; roles: string[]; version: string | undefined;
};
type RetainedDraft = {
  baseline: RetainedBaseline;
  profile: CommonExternalEdit['profile'];
  reason: string;
  /** Tentativa já emitida (mesmo payload ⇒ mesma chave de idempotência no retry). */
  attempt: { payload: string; key: string } | null;
  /** Envio em voo quando a pausa desmontou o formulário: resultado não confirmado. */
  unconfirmed: boolean;
};
const baselineOf = (p: Pick<Props, 'scope' | 'actorId' | 'organizationId' | 'target' | 'expectedVersion'>): RetainedBaseline => ({
  scope: p.scope, actorId: p.actorId, organizationId: p.organizationId,
  userId: p.target.user_id, updatedAt: p.target.updated_at, roles: [...p.target.roles].sort(), version: p.expectedVersion,
});
const sameBaseline = (a: RetainedBaseline, b: RetainedBaseline) =>
  a.scope === b.scope && a.actorId === b.actorId && a.organizationId === b.organizationId &&
  a.userId === b.userId && a.updatedAt === b.updatedAt && a.version === b.version &&
  JSON.stringify(a.roles) === JSON.stringify(b.roles);
const isRetainedDraft = (v: unknown): v is RetainedDraft =>
  !!v && typeof v === 'object' && 'baseline' in v && 'profile' in v && typeof (v as RetainedDraft).reason === 'string';

/** The screen waits for the first complete snapshot, then retains the draft across refetches. */
export function ExternalCommonUserEditBoundary(props: Props) {
  const [initial, setInitial] = useState<{ target: ExternalCommonTarget; version: string } | null>(null);
  const { target, expectedVersion, ready, snapshotReady, snapshotError } = props;
  useEffect(() => {
    if (initial || !ready || !snapshotReady || snapshotError ||
      typeof expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(expectedVersion)) return;
    setInitial({ target: { ...target, roles: [...target.roles] }, version: expectedVersion });
  }, [initial, ready, snapshotReady, snapshotError, expectedVersion, target]);
  if (!initial) {
    const failed = snapshotError || (snapshotReady && ready);
    return <p role={failed ? 'alert' : 'status'} className={failed ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
      {failed ? 'Não foi possível carregar os dados para edição. Recarregue a lista e tente novamente.' : 'Carregando dados para edição…'}
    </p>;
  }
  return <ExternalCommonUserEditForm {...props} target={initial.target} expectedVersion={initial.version} />;
}

/** Mounted only through the closed review gate. No identity/role/link/status writes. */
export function ExternalCommonUserEditForm(props: Props) {
  const id = useId();
  // Rascunho retido lido UMA vez na montagem; a chave carrega época/identidade,
  // então revogação torna o rascunho antigo inalcançável (fail-closed).
  const [retained] = useState<RetainedDraft | null>(() => {
    const raw = props.draftKey ? readPauseState<unknown>(props.draftKey) : null;
    return isRetainedDraft(raw) ? raw : null;
  });
  // Baseline divergente: conflito explícito, sem rebase do rascunho no CAS novo.
  const [retainedConflict] = useState(() => !!retained && !sameBaseline(retained.baseline, baselineOf(props)));
  // Freeze the CAS and target together, never refresh the CAS under an edited draft.
  // Com rascunho retido, o CAS congelado é SEMPRE o do baseline original.
  const [snapshot] = useState(() => {
    const b = retained?.baseline;
    return {
      scope: b?.scope ?? props.scope, actorId: b?.actorId ?? props.actorId,
      organizationId: b?.organizationId ?? props.organizationId,
      target: b ? { ...props.target, user_id: b.userId, updated_at: b.updatedAt, roles: [...b.roles] }
        : { ...props.target, roles: [...props.target.roles] },
      version: b ? b.version : props.expectedVersion,
      generation: crypto.randomUUID(),
    };
  });
  const [profile, setProfile] = useState<CommonExternalEdit['profile']>(() => ({
    nome: props.target.nome, telefone: props.target.telefone, cargo: props.target.cargo,
    cpf_cnpj: props.target.cpf_cnpj, crea: props.target.crea, especialidade: props.target.especialidade,
    ...retained?.profile,
  }));
  const [reason, setReason] = useState(() => retained?.reason ?? '');
  const [unconfirmed, setUnconfirmed] = useState(() => !retainedConflict && !!retained?.unconfirmed);
  const attempt = useRef<{ payload: string; key: string } | null>(retainedConflict ? null : retained?.attempt ?? null);
  const draftKey = props.draftKey;
  const inFlight = useRef(false);
  const finished = useRef(false);
  const persist = useRef<() => void>(() => {});
  persist.current = () => {
    if (!draftKey || finished.current) return;
    const baseline: RetainedBaseline = {
      scope: snapshot.scope, actorId: snapshot.actorId, organizationId: snapshot.organizationId,
      userId: snapshot.target.user_id, updatedAt: snapshot.target.updated_at,
      roles: [...snapshot.target.roles].sort(), version: snapshot.version,
    };
    writePauseState<RetainedDraft>(draftKey, {
      baseline, profile, reason, attempt: attempt.current, unconfirmed: unconfirmed || inFlight.current,
    });
  };
  useEffect(() => { persist.current(); }, [draftKey, profile, reason, unconfirmed]);
  const [pending, setPending] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    mounted.current = true;
    epoch.current += 1;
    return () => {
      mounted.current = false; epoch.current += 1;
      // Envio em voo durante o unmount: resultado desconhecido; o retry após
      // remontagem reutiliza a MESMA chave (recibo do servidor deduplica).
      if (inFlight.current) persist.current();
    };
  }, []);

  const errors = validateCommonExternalEdit(profile, reason);
  const snapshotValid = props.ready && props.snapshotReady && !!snapshot.version &&
    snapshot.version === props.expectedVersion && snapshot.scope === props.scope &&
    snapshot.actorId === props.actorId && snapshot.organizationId === props.organizationId &&
    snapshot.target.user_id === props.target.user_id && snapshot.target.updated_at === props.target.updated_at &&
    JSON.stringify(snapshot.target.roles) === JSON.stringify(props.target.roles);

  const submit = async () => {
    if (lock.current || reloadRequired || retainedConflict || !EXTERNAL_USER_EDIT_PHASE2_REVIEWED ||
      !snapshotValid || Object.keys(errors).length || !props.isCurrent() || !snapshot.version) return;
    lock.current = true; // before any await or React update
    const capturedEpoch = epoch.current;
    const generation = snapshot.generation;
    const current = () => mounted.current && epoch.current === capturedEpoch && generation === snapshot.generation &&
      latest.current.ready && latest.current.scope === snapshot.scope &&
      latest.current.actorId === snapshot.actorId && latest.current.organizationId === snapshot.organizationId &&
      latest.current.target.user_id === snapshot.target.user_id && latest.current.isCurrent();
    setPending(true);
    setError(null);
    try {
      const phone = validatePhoneBR(profile.telefone, { fieldLabel: 'Telefone' });
      if (!phone.ok) return;
      const input: CommonExternalEdit = {
        userId: snapshot.target.user_id, expectedUpdatedAt: snapshot.target.updated_at,
        expectedVersion: snapshot.version, roles: snapshot.target.roles,
        profile: { ...profile, telefone: phone.value, cpf_cnpj: unmaskCpfCnpj(profile.cpf_cnpj ?? '') },
        reason, idempotencyKey: attempt.current?.key ?? crypto.randomUUID(),
      };
      const payload = JSON.stringify(buildCommonExternalEdit(input));
      // A modified request must never reuse the old receipt key.
      if (attempt.current && attempt.current.payload !== payload) input.idempotencyKey = crypto.randomUUID();
      attempt.current = { payload: JSON.stringify(buildCommonExternalEdit(input)), key: input.idempotencyKey };
      if (!current()) return;
      inFlight.current = true;
      persist.current();
      await executarComDeadlineEdicao(async signal => {
        if (!signal || !current()) throw new Error('user_edit_result_unconfirmed');
        return submitCommonExternalEditCandidate(supabase as unknown as CandidateClient, input, signal);
      });
      inFlight.current = false;
      if (!current()) return;
      // Confirmado: o diálogo dono descarta o rascunho; nada mais é retido.
      finished.current = true;
      latest.current.onSuccess(); // callback fences again at its owning dialog
    } catch (e) {
      inFlight.current = false;
      if (!current()) return;
      setUnconfirmed(false);
      const failure = classificarErroRpcEdicao(e);
      if (failure.exigeRecarga) setReloadRequired(true);
      setError(failure.message);
      if (current()) latest.current.onError(failure.message);
    } finally {
      lock.current = false;
      if (current()) setPending(false);
    }
  };

  const blocked = reloadRequired || retainedConflict;
  return <div className="space-y-3">
    {retainedConflict && <p role="alert" className="text-xs text-destructive">
      Os dados deste usuário mudaram durante a pausa de acesso. Seu rascunho não foi enviado nem aplicado aos dados novos; feche e reabra o usuário para editar a versão atual.
    </p>}
    {unconfirmed && !retainedConflict && <p role="status" className="text-xs text-muted-foreground">
      O envio anterior não foi confirmado. Salvar novamente repete a mesma solicitação, sem duplicar a alteração.
    </p>}
    <fieldset disabled={pending || blocked || !EXTERNAL_USER_EDIT_PHASE2_REVIEWED || !snapshotValid} className="space-y-3 disabled:opacity-70">
      {(['nome', 'telefone', 'cargo', 'cpf_cnpj'] as const).map(field => {
        const label = { nome: 'Nome', telefone: 'Telefone', cargo: 'Cargo', cpf_cnpj: 'CPF/CNPJ' }[field];
        const message = field === 'nome' || field === 'telefone' ? errors[field] : undefined;
        return <div key={field}><Label htmlFor={`${id}-${field}`}>{label}</Label>
          <Input id={`${id}-${field}`} value={profile[field] ?? ''} inputMode={field === 'telefone' ? 'tel' : undefined}
            onChange={e => setProfile(previous => ({ ...previous, [field]: e.target.value }))}
            aria-invalid={!!message} aria-describedby={message ? `${id}-${field}-error` : undefined} />
          {message && <p id={`${id}-${field}-error`} className="text-xs text-destructive">{message}</p>}
        </div>;
      })}
      <div><Label htmlFor={`${id}-reason`}>Motivo</Label>
        <Input id={`${id}-reason`} value={reason} maxLength={500} onChange={e => setReason(e.target.value)}
          aria-invalid={!!errors.motivo} aria-describedby={errors.motivo ? `${id}-reason-error` : undefined} />
        {errors.motivo && <p id={`${id}-reason-error`} className="text-xs text-destructive">{errors.motivo}</p>}
      </div>
    </fieldset>
    {!snapshotValid && !retainedConflict && <p role="status" className="text-xs text-muted-foreground">Recarregue a lista e reabra o usuário para conferir os dados.</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Button className="w-full" onClick={() => void submit()} disabled={pending || blocked || !EXTERNAL_USER_EDIT_PHASE2_REVIEWED || !snapshotValid || Object.keys(errors).length > 0}>
      {pending ? 'Salvando...' : retainedConflict ? 'Conflito: reabra o usuário' : reloadRequired ? 'Recarregue a lista para tentar novamente' : 'Salvar Alterações'}
    </Button>
  </div>;
}