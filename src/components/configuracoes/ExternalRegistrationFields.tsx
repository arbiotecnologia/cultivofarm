import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EXTERNAL_ROLES, EXTERNAL_LABELS } from "@/lib/configuracoes/externalUserDraft";
type Props = { roles: string[]; partnerId: string; clients: string[]; primary: string | null; disabled?: boolean;
  onRoles: (roles: string[]) => void; onPartner: (id: string) => void;
  onClients: (ids: string[], primary: string | null) => void; onVerified: (ids: string[]) => void; partnerOnly?: boolean; companyLabel?: string };
// Only existing RLS-scoped reads. A visible farm is a prerequisite, never a grant;
// claim/finish revalidate the chain and locks on the server before provisioning.
export function ExternalRegistrationFields(props: Props) {
  const { profile } = useAuth();
  const fence = useStorageAccessScope("tenant-user-registration");
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const latest = useRef(props); latest.current = props;
  const partner = props.partnerOnly || props.roles.some(r => r === "parceiro_b2b" || r === "parceiro_b2b_tecnico");
  const producer = !props.partnerOnly && props.roles.includes("cliente_produtor");
  const options = useQuery({ queryKey: ["c2-registration-options", fence.scope, search, page, partner, producer], enabled: fence.ready,
    retry: false, queryFn: async ({ signal }) => {
      const current = fence.capture(); const org = profile?.organization_id;
      if (!org || !current()) throw new Error("c2_context_changed");
      const term = `%${search.replace(/[%_]/g, "")}%`;
      const partners = partner ? await supabase.from("partner_accounts").select("id, razao_social", { count: "exact" })
        .filter("commercial_owner_organization_id", "eq", org).eq("ativo", true).is("deleted_at", null).ilike("razao_social", term)
        .order("razao_social").range(page * 20, page * 20 + 19).abortSignal(signal) : { data: [], error: null, count: 0 };
      if (!current() || signal.aborted) throw new Error("c2_context_changed");
      const clients = producer ? await supabase.from("clientes").select("id, nome", { count: "exact" }).filter("organization_id", "eq", org)
        .eq("status_cliente", "ativo").ilike("nome", term).order("nome").range(page * 20, page * 20 + 19).abortSignal(signal) : { data: [], error: null, count: 0 };
      if (!current() || signal.aborted || partners.error || clients.error) throw new Error("c2_options_unavailable");
      return { partners: partners.data ?? [], clients: clients.data ?? [], total: Math.max(partners.count ?? 0, clients.count ?? 0) };
    } });
  // Separate read of ALL selected clients, not just the currently visible page.
  const proof = useQuery({ queryKey: ["c2-registration-client-chain", fence.scope, [...props.clients].sort()],
    enabled: fence.ready && producer && props.clients.length > 0, retry: false,
    queryFn: async ({ signal }) => {
      const current = fence.capture(); const org = profile?.organization_id;
      if (!org || !current()) throw new Error("c2_context_changed");
      const clients = await supabase.from("clientes").select("id").in("id", props.clients).filter("organization_id", "eq", org).eq("status_cliente", "ativo").abortSignal(signal);
      if (!current() || signal.aborted) throw new Error("c2_context_changed");
      const farms = await supabase.from("fazendas").select("id, cliente_id, nome").in("cliente_id", props.clients).filter("organization_id", "eq", org).eq("ativo", true).abortSignal(signal);
      if (!current() || signal.aborted || clients.error || farms.error) throw new Error("c2_chain_unavailable");
      return { ids: (clients.data ?? []).filter(c => farms.data?.some(f => f.cliente_id === c.id)).map(c => c.id), farms: farms.data ?? [] };
    } });
  useEffect(() => { latest.current.onVerified(fence.ready && producer && !proof.isFetching && !proof.isError ? proof.data?.ids ?? [] : []); },
    [fence.ready, fence.scope, producer, proof.data, proof.isFetching, proof.isError]);
  if (!fence.ready) return <p role="alert">Sessão indisponível para consultar vínculos.</p>;
  return <fieldset disabled={props.disabled} className="min-w-0 space-y-3 [overflow-wrap:anywhere] [&_label]:min-w-0 [&_label]:max-w-full [&_button[role=checkbox]]:shrink-0" aria-label="Perfis e vínculos externos">
    <div><span className="text-sm">Empresa do cadastro</span><p>{props.companyLabel || profile?.organization_id}</p></div>
    {!props.partnerOnly && <div className="flex flex-wrap gap-3">{EXTERNAL_ROLES.map(r => <label key={r} className="flex items-center gap-2"><Checkbox checked={props.roles.includes(r)} onCheckedChange={v => {
      const next = v === true ? [...props.roles, r] : props.roles.filter(x => x !== r); props.onRoles(next);
      if (!next.includes("cliente_produtor")) props.onClients([], null);
      if (!next.some(x => x === "parceiro_b2b" || x === "parceiro_b2b_tecnico")) props.onPartner("");
    }} />{EXTERNAL_LABELS[r]}</label>)}</div>}
    <label className="block">Buscar vínculos<Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
    {options.isFetching ? <p role="status">Carregando vínculos…</p> : options.isError ? <div role="alert">Não foi possível consultar os vínculos.<Button variant="outline" onClick={() => void options.refetch()}>Tentar novamente</Button></div> : <>
      {partner && <fieldset aria-label="Parceiro da empresa"><legend>Parceiro da empresa</legend>{options.data?.partners.map(p => <label key={p.id} className="flex items-center gap-2"><Checkbox checked={props.partnerId === p.id} onCheckedChange={v => props.onPartner(v === true ? p.id : "")} />{p.razao_social}</label>)}</fieldset>}
      {producer && <fieldset aria-label="Clientes do produtor"><legend>Clientes do produtor</legend>{options.data?.clients.map(c => <div key={c.id} className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2"><Checkbox checked={props.clients.includes(c.id)} onCheckedChange={v => {
        const next = v === true ? [...props.clients, c.id] : props.clients.filter(id => id !== c.id); props.onClients(next, next.includes(props.primary ?? "") ? props.primary : next[0] ?? null);
      }} />{c.nome}</label>{props.clients.includes(c.id) && <Button size="sm" variant="outline" onClick={() => props.onClients(props.clients, c.id)}>{props.primary === c.id ? "Principal" : "Tornar principal"}</Button>}</div>)}</fieldset>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" disabled={(page + 1) * 20 >= (options.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>
    </>}
    {producer && props.clients.length > 0 && (proof.isFetching ? <p role="status">Validando clientes e fazendas…</p> : proof.isError ? <p role="alert">Não foi possível validar clientes e fazendas.</p> : <>
      <ul aria-label="Fazendas ativas dos clientes">{proof.data?.farms.map(f => <li key={f.id}>{f.nome}</li>)}</ul>
      {props.clients.some(id => !proof.data?.ids.includes(id)) && <p role="alert">Cada cliente selecionado precisa de fazenda ativa na sua empresa.</p>}
    </>)}
  </fieldset>;
}