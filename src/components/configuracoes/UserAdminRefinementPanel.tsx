import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACCESS_TARGET_LABEL, B2B_ROLES, EDGE, PAGE_SIZE, RPC, RPC_EMAIL_REQUEST, edgeErrorCode, emailSchema, friendlyError, incompatibleRoles, isConsultor,
  parseClientesPage, parseConsultorLinks, validatePeriod, validateTransition, type AccessTarget, type ClienteOption,
  accessTargets, needsLinkCas, parsePartnerLink,
} from "@/lib/configuracoes/userAdminRefinement";
import { B2B_FINANCE_ROLE_INSTALLED } from "@/lib/comercial/b2bFinanceRole";

// RPCs candidatas ainda não estão nos tipos gerados (não instaladas).
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
const newKey = () => crypto.randomUUID();
/** Escrita pelo Edge (ator = JWT verificado no servidor; nada do corpo autoriza). */
const edge = async (op: "change_access_type" | "consultor_link", args: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(EDGE.userAdmin, { body: { op, args } });
  if (error) throw new Error(await edgeErrorCode(error));
  return data;
};
const EXTERNAL = ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico", "parceiro_b2b_financeiro"];

const INTERNAL_ROLES: { value: string; label: string }[] = [
  { value: "administrador", label: "Administrador" }, { value: "gestor", label: "Gestor" },
  { value: "administrativo", label: "Administrativo" }, { value: "financeiro", label: "Financeiro" },
  { value: "gestor_comercial", label: "Gestor Comercial" }, { value: "producao", label: "Produção" },
  { value: "aplicador", label: "Aplicador" }, { value: "operador_onfarm", label: "Operador OnFarm" },
  { value: "consultor_tecnico", label: "Consultor Técnico" }, { value: "tecnico_agronomo", label: "Técnico Agrônomo" },
];

export interface RefinementTarget { user_id: string; email: string | null; roles: string[] }
interface Props { target: RefinementTarget; actorId: string; currentType: string; onChanged: () => void }

function ClientePicker({ onPick, disabled }: { onPick: (c: ClienteOption) => void; disabled?: boolean }) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["tenant-admin-clientes", q, page],
    queryFn: async () => {
      const { data, error } = await rpc(RPC.searchClientes, { p_search: q, p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE });
      if (error) throw new Error(error.message);
      return parseClientesPage(data);
    },
    retry: false, staleTime: 15_000,
  });
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  return (
    <div className="space-y-2">
      <Input placeholder="Buscar cliente/produtor" value={q} maxLength={100} disabled={disabled}
        onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Buscar cliente/produtor" />
      <div className="border rounded-md max-h-40 overflow-y-auto overscroll-contain divide-y" aria-busy={query.isFetching}>
        {query.isLoading && <p className="p-2 text-xs text-muted-foreground">Carregando…</p>}
        {query.isError && <p role="alert" className="p-2 text-xs text-destructive">{friendlyError((query.error as Error).message)}</p>}
        {query.data?.items.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
        {query.data?.items.map((c) => (
          <button key={c.id} type="button" disabled={disabled} onClick={() => onPick(c)}
            className="w-full text-left p-2 text-sm hover:bg-muted break-words">{c.nome}</button>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <Button type="button" size="sm" variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Anterior</Button>
        <span>Página {page + 1} de {pages}</span>
        <Button type="button" size="sm" variant="outline" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(page + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

function AccessTypeSection({ target, actorId, currentType, onChanged }: Props) {
  const [to, setTo] = useState<AccessTarget | "">(""); const [roles, setRoles] = useState<string[]>([]);
  const [cliente, setCliente] = useState<ClienteOption | null>(null); const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey); const [err, setErr] = useState<string | null>(null);
  const [remove, setRemove] = useState<string[]>([]); const [b2b, setB2b] = useState<string[]>([]);
  const hasExternal = target.roles.some((r) => EXTERNAL.includes(r));
  const self = actorId === target.user_id;
  const incompat = to ? incompatibleRoles(target.roles, to) : [];
  const [partnerId, setPartnerId] = useState<string>("");
  const cas = !!to && B2B_FINANCE_ROLE_INSTALLED && needsLinkCas(to, target.roles);
  const linkQ = useQuery({ queryKey: ["tenant-admin-partner-link", actorId, target.user_id], enabled: cas, retry: false, staleTime: 0,
    queryFn: async () => { const { data, error } = await rpc("tenant_admin_partner_link_v1", { p_user_id: target.user_id }); if (error) throw new Error(error.message); return parsePartnerLink(data); } });
  const partnersQ = useQuery({ queryKey: ["tenant-admin-partners", actorId], enabled: to === "b2b_finance" && !!linkQ.data && !linkQ.data.link, retry: false,
    queryFn: async () => { const { data, error } = await supabase.from("partner_accounts").select("id, razao_social").eq("ativo", true).is("deleted_at", null).order("razao_social").limit(200);
      if (error) throw new Error(error.message); return (data ?? []) as { id: string; razao_social: string }[]; } });
  const link = cas && !linkQ.isError ? linkQ.data ?? null : null;
  const m = useMutation({
    mutationFn: async () => {
      await edge("change_access_type", { user_id: target.user_id, target: to, roles: to === "internal" ? roles : to === "b2b" ? b2b : to === "b2b_finance" ? ["parceiro_b2b_financeiro"] : [],
        remove_roles: remove.filter((r) => incompat.includes(r)), ...(to === "producer" && cliente ? { cliente_id: cliente.id } : {}),
        ...(cas ? { expected_link_version: link?.link?.version ?? null } : {}),
        ...(to === "b2b_finance" && !link?.link && partnerId ? { partner_id: partnerId } : {}), idempotency_key: key, reason });
    },
    onSuccess: () => { setKey(newKey()); setTo(""); setReason(""); setRemove([]); setPartnerId(""); setErr(null); onChanged(); },
    onError: (e: Error) => { setErr(friendlyError(e.message)); if (e.message === "partner_link_conflict") { setKey(newKey()); void linkQ.refetch(); } },
  });
  const submit = () => {
    if (!to) return;
    const v = validateTransition({ actorId, targetId: target.user_id, from: currentType, to, internalRoles: roles, clienteId: cliente?.id ?? null, reason,
      currentRoles: target.roles, removeRoles: remove, b2bRoles: b2b, link: cas ? link : undefined, partnerId: partnerId || null });
    if (v) { setErr(v); return; }
    if (!m.isPending) m.mutate();
  };
  return (
    <section className="space-y-2 border rounded-md p-3" aria-label="Alterar tipo de acesso">
      <h4 className="font-semibold text-sm">Alterar tipo de acesso</h4>
      {self ? <p className="text-xs text-muted-foreground">Você não pode alterar o próprio tipo de acesso.</p> : <>
        <Select value={to} onValueChange={(v) => { setTo(v as AccessTarget); setRemove([]); setErr(null); }}>
          <SelectTrigger aria-label="Novo tipo de acesso"><SelectValue placeholder="Selecione o novo tipo" /></SelectTrigger>
          <SelectContent>{accessTargets(B2B_FINANCE_ROLE_INSTALLED).map((t) => <SelectItem key={t} value={t}>{ACCESS_TARGET_LABEL[t]}</SelectItem>)}</SelectContent>
        </Select>
        {to === "internal" && <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2 border rounded-md p-2 max-h-40 overflow-y-auto overscroll-contain">
          {INTERNAL_ROLES.filter((r) => !(hasExternal && r.value === "administrador")).map((r) => <label key={r.value} className="flex items-center gap-2 text-sm">
            <Checkbox checked={roles.includes(r.value)} onCheckedChange={(c) => setRoles(c === true ? [...roles, r.value] : roles.filter((x) => x !== r.value))} />{r.label}
          </label>)}
        </div>}
        {to === "producer" && <div className="space-y-1">
          <p className="text-xs">Cliente: <strong>{cliente?.nome ?? "nenhum selecionado"}</strong></p>
          <ClientePicker onPick={setCliente} />
        </div>}
        {to === "internal" && hasExternal && <p className="text-xs text-muted-foreground">Administrador não aparece aqui: só pode ser concedido depois, a um usuário já interno.</p>}
        {to === "b2b" && <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Exige vínculo ativo com um parceiro B2B desta empresa (cadastrado no ciclo de vida do parceiro). Marque cada perfil explicitamente; técnico não inclui gestor.</p>
          {B2B_ROLES.filter((r) => !target.roles.includes(r)).map((r) => <label key={r} className="flex items-center gap-2 text-sm">
            <Checkbox checked={b2b.includes(r)} onCheckedChange={(c) => setB2b(c === true ? [...b2b, r] : b2b.filter((x) => x !== r))} />{r === "parceiro_b2b" ? "Parceiro B2B — Gestor" : "Parceiro B2B — Técnico"}
          </label>)}
        </div>}
        {to === "b2b_finance" && <div className="space-y-1" aria-label="Parceiro do financeiro">
          <p className="text-xs text-muted-foreground">Acesso somente de consulta aos títulos, parcelas e crédito do próprio parceiro. Não pode ser combinado com outros perfis.</p>
          {linkQ.isLoading && <p className="text-xs text-muted-foreground">Lendo vínculo…</p>}
          {linkQ.isError && <p role="alert" className="text-xs text-destructive">Não foi possível ler o vínculo com o parceiro.</p>}
          {link?.link && <p className="text-xs">Vínculo atual mantido; o papel do vínculo passa a financeiro.</p>}
          {link && !link.link && !link.ambiguous && !link.foreign && <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger aria-label="Parceiro B2B"><SelectValue placeholder={partnersQ.isLoading ? "Carregando parceiros…" : "Selecione o parceiro"} /></SelectTrigger>
            <SelectContent>{(partnersQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.razao_social}</SelectItem>)}</SelectContent>
          </Select>}
        </div>}
        {cas && to !== "b2b_finance" && linkQ.isError && <p role="alert" className="text-xs text-destructive">Não foi possível ler o vínculo com o parceiro.</p>}
        {to && incompat.length > 0 && <div className="border border-destructive/40 rounded-md p-2 space-y-1" aria-label="Perfis incompatíveis">
          <p className="text-xs">Estes perfis não convivem com {ACCESS_TARGET_LABEL[to]}. Marque para confirmar a remoção; sem confirmação nada é alterado.</p>
          {incompat.map((r) => <label key={r} className="flex items-center gap-2 text-sm">
            <Checkbox checked={remove.includes(r)} onCheckedChange={(c) => setRemove(c === true ? [...remove, r] : remove.filter((x) => x !== r))} />Remover {r}
          </label>)}
        </div>}
        {to && <>
          <Label htmlFor="access-reason">Motivo</Label>
          <Input id="access-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">Perfis compatíveis são mantidos. Vínculos com clientes que não cabem no novo tipo são todos encerrados com histórico (inclusive secundários). As sessões abertas do usuário perdem a autoridade e precisam ser renovadas.</p>
          <Button type="button" className="w-full h-auto min-h-10 whitespace-normal" disabled={m.isPending} onClick={submit}>
            {m.isPending ? "Aplicando…" : `Confirmar mudança para ${ACCESS_TARGET_LABEL[to]}`}
          </Button>
        </>}
        {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      </>}
    </section>
  );
}

function EmailSection({ target, onChanged }: Props) {
  const qc = useQueryClient(); const [email, setEmail] = useState(""); const [key, setKey] = useState(newKey);
  const [msg, setMsg] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["tenant-admin-email-change", target.user_id],
    queryFn: async () => { const { data, error } = await rpc(RPC.emailStatus, { p_user_id: target.user_id }); if (error) throw new Error(error.message); return data as { status: string; new_email?: string; expires_at?: string; cancellable?: boolean } },
    retry: false,
  });
  const request = useMutation({
    mutationFn: async () => {
      const parsed = emailSchema.safeParse(email); if (!parsed.success) throw new Error("invalid_email");
      const { error } = await rpc(RPC_EMAIL_REQUEST, { p_user_id: target.user_id, p_new_email: parsed.data, p_idempotency_key: key });
      if (error) throw new Error(error.message);
      return "sent";
    },
    onSuccess: (r) => { setKey(newKey()); setEmail(""); setMsg(r === "sent" ? "Pedido registrado. O titular verá o pedido ao entrar e confirmará pelo próprio e-mail; até lá o atual continua válido." : friendlyError(r)); qc.invalidateQueries({ queryKey: ["tenant-admin-email-change", target.user_id] }); },
    onError: (e: Error) => setMsg(friendlyError(e.message)),
  });
  const cancel = useMutation({
    mutationFn: async () => { const { error } = await rpc(RPC.emailCancel, { p_user_id: target.user_id, p_idempotency_key: newKey() }); if (error) throw new Error(error.message); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenant-admin-email-change", target.user_id] }); onChanged(); },
    onError: (e: Error) => setMsg(friendlyError(e.message)),
  });
  const locked = status.data?.status === "accepted_awaiting_auth";
  const pending = status.data?.status === "pending" || locked;
  return (
    <section className="space-y-2 border rounded-md p-3" aria-label="Alterar e-mail">
      <h4 className="font-semibold text-sm">E-mail</h4>
      <p className="text-sm break-all">Atual: {target.email ?? "—"}</p>
      {status.isLoading && <p className="text-xs text-muted-foreground">Verificando solicitações…</p>}
      {status.isError && <p role="alert" className="text-xs text-destructive">{friendlyError((status.error as Error).message)}</p>}
      {pending ? <div className="space-y-2">
        <Badge variant="outline" className="whitespace-normal break-all">Pendente: {status.data?.new_email}</Badge>
        {locked
          ? <p className="text-xs text-muted-foreground">O titular aceitou e o link oficial de confirmação pode já ter sido enviado. Como esse link não pode ser invalidado daqui, a solicitação não pode ser cancelada e segue aguardando confirmação. O e-mail atual continua válido até lá.</p>
          : <p className="text-xs text-muted-foreground">Aguardando o titular aceitar e confirmar. O e-mail atual continua válido.</p>}
        {!locked && status.data?.cancellable !== false && <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar solicitação</Button>}
      </div> : <div className="space-y-2">
        <Label htmlFor="new-email">Novo e-mail</Label>
        <Input id="new-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        <Button type="button" size="sm" disabled={request.isPending || !email} onClick={() => request.mutate()}>{request.isPending ? "Enviando…" : "Solicitar alteração"}</Button>
      </div>}
      {msg && <p role="status" className="text-xs">{msg}</p>}
    </section>
  );
}

function ConsultorLinksSection({ target }: Props) {
  const qc = useQueryClient(); const qk = ["tenant-admin-consultor-links", target.user_id];
  const [pick, setPick] = useState<ClienteOption | null>(null); const [replace, setReplace] = useState<string>("");
  const [level, setLevel] = useState<"read" | "execute">("read"); const [from, setFrom] = useState(""); const [until, setUntil] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const links = useQuery({ queryKey: qk, retry: false, queryFn: async () => {
    const { data, error } = await rpc(RPC.consultorLinks, { p_user_id: target.user_id }); if (error) throw new Error(error.message); return parseConsultorLinks(data);
  } });
  const m = useMutation({
    mutationFn: async (a: { action: "add" | "end" | "replace"; cliente_id: string; replace?: string }) => {
      await edge("consultor_link", { user_id: target.user_id, action: a.action, cliente_id: a.cliente_id, ...(a.replace ? { replace_cliente_id: a.replace } : {}),
        ...(a.action === "end" ? {} : { access_level: level, ...(from ? { valid_from: new Date(from).toISOString() } : {}), ...(until ? { valid_until: new Date(until).toISOString() } : {}) }),
        idempotency_key: newKey() });
    },
    onSuccess: () => { setPick(null); setReplace(""); setErr(null); qc.invalidateQueries({ queryKey: qk }); },
    onError: (e: Error) => { setErr(friendlyError(e.message)); qc.invalidateQueries({ queryKey: qk }); },
  });
  const active = links.data?.items.filter((l) => l.status !== "encerrado") ?? [];
  const add = () => {
    if (!pick) return; const v = validatePeriod(from || null, until || null); if (v) { setErr(v); return; }
    m.mutate(replace ? { action: "replace", cliente_id: pick.id, replace } : { action: "add", cliente_id: pick.id });
  };
  return (
    <section className="space-y-2 border rounded-md p-3" aria-label="Clientes do consultor">
      <h4 className="font-semibold text-sm">Clientes/produtores atendidos</h4>
      <p className="text-xs text-muted-foreground">Concede somente acesso técnico aos clientes listados. Financeiro e comercial não são liberados.</p>
      {links.isLoading && <p className="text-xs text-muted-foreground">Carregando vínculos…</p>}
      {links.isError && <p role="alert" className="text-xs text-destructive">{friendlyError((links.error as Error).message)}</p>}
      <ul className="max-h-48 overflow-y-auto overscroll-contain divide-y border rounded-md">
        {links.data?.items.length === 0 && <li className="p-2 text-xs text-muted-foreground">Nenhum vínculo.</li>}
        {links.data?.items.map((l) => <li key={l.cliente_id} className="p-2 text-sm flex flex-wrap items-center gap-2 justify-between">
          <span className="break-words min-w-0">{l.nome} <Badge variant="outline">{l.status}</Badge>
            <span className="block text-xs text-muted-foreground">{l.access_level === "read" ? "Leitura" : l.access_level === "execute" ? "Execução" : "Gestão"}
              {l.valid_from ? ` · de ${new Date(l.valid_from).toLocaleDateString("pt-BR")}` : ""}{l.valid_until ? ` até ${new Date(l.valid_until).toLocaleDateString("pt-BR")}` : ""}</span></span>
          {l.status !== "encerrado" && <Button type="button" size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ action: "end", cliente_id: l.cliente_id })}>Encerrar</Button>}
        </li>)}
      </ul>
      <div className="space-y-2">
        <Label>Adicionar cliente</Label>
        <p className="text-xs">Selecionado: <strong>{pick?.nome ?? "nenhum"}</strong></p>
        <ClientePicker onPick={setPick} disabled={m.isPending} />
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">
          <div><Label htmlFor="link-from">Início</Label><Input id="link-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label htmlFor="link-until">Fim (opcional)</Label><Input id="link-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
        </div>
        <Select value={level} onValueChange={(v) => setLevel(v as "read" | "execute")}>
          <SelectTrigger aria-label="Nível de acesso"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="read">Leitura técnica</SelectItem><SelectItem value="execute">Execução técnica</SelectItem></SelectContent>
        </Select>
        {active.length > 0 && <Select value={replace || "none"} onValueChange={(v) => setReplace(v === "none" ? "" : v)}>
          <SelectTrigger aria-label="Substituir vínculo"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Adicionar (sem substituir)</SelectItem>
            {active.map((l) => <SelectItem key={l.cliente_id} value={l.cliente_id}>Substituir {l.nome}</SelectItem>)}</SelectContent>
        </Select>}
        <Button type="button" size="sm" disabled={!pick || m.isPending} onClick={add}>{m.isPending ? "Salvando…" : replace ? "Substituir" : "Adicionar"}</Button>
      </div>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
    </section>
  );
}

export function UserAdminRefinementPanel(props: Props) {
  return (
    <div className="space-y-3">
      <AccessTypeSection {...props} />
      {props.actorId !== props.target.user_id && <EmailSection {...props} />}
      {isConsultor(props.target.roles) && props.currentType === "internal" && props.actorId !== props.target.user_id && <ConsultorLinksSection {...props} />}
    </div>
  );
}
