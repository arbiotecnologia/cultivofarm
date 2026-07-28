import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, ShieldOff, Search, PhoneCall } from "lucide-react";

/**
 * Gate 4 — UI administrativa de consentimento WhatsApp.
 *
 * Envia opt_in / opt_out / verified via public.rpc_admin_set_whatsapp_consent.
 * A RPC valida SECURITY DEFINER + has_role('administrador'). Nunca expõe telefone completo
 * — apenas os 4 últimos dígitos são renderizados aqui.
 */

type Acao = "opt_in" | "opt_out" | "verified";

interface ClienteMatch {
  id: string;
  nome: string | null;
  telefone: string | null;
}

interface Preferencia {
  id: string;
  cliente_id: string | null;
  user_id: string | null;
  canal: string;
  enabled: boolean;
  telefone_verificado: boolean;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at: string | null;
  source: string;
  updated_at: string;
}

interface ConsentLog {
  id: number;
  cliente_id: string | null;
  user_id: string | null;
  canal: string;
  acao: string;
  source: string;
  actor_id: string | null;
  created_at: string;
}

function maskPhone(raw: string | null): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 4) return "•••";
  return `••••••${digits.slice(-4)}`;
}

export default function ConsentimentoWhatsappPanel({ canMutate }: { canMutate: boolean }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<ClienteMatch | null>(null);
  const [acao, setAcao] = useState<Acao>("opt_in");
  const [justificativa, setJustificativa] = useState("");
  const [source, setSource] = useState("admin_ui");

  const search = useQuery({
    queryKey: ["consent-search", term],
    queryFn: async (): Promise<ClienteMatch[]> => {
      const q = term.trim();
      if (q.length < 2) return [];
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone")
        .or(`nome.ilike.%${q}%,cnpj.ilike.%${q}%,cpf.ilike.%${q}%`)
        .limit(15);
      if (error) throw error;
      return (data as ClienteMatch[]) ?? [];
    },
    enabled: term.trim().length >= 2,
    staleTime: 30_000,
  });

  const prefs = useQuery({
    queryKey: ["consent-prefs", selected?.id],
    queryFn: async (): Promise<Preferencia | null> => {
      if (!selected) return null;
      const { data, error } = await supabase
        .from("comunicacao_preferencias")
        .select("id, cliente_id, user_id, canal, enabled, telefone_verificado, whatsapp_opt_in_at, whatsapp_opt_out_at, source, updated_at")
        .eq("cliente_id", selected.id)
        .eq("canal", "whatsapp")
        .maybeSingle();
      if (error) throw error;
      return (data as Preferencia | null) ?? null;
    },
    enabled: !!selected,
  });

  const historico = useQuery({
    queryKey: ["consent-log", selected?.id],
    queryFn: async (): Promise<ConsentLog[]> => {
      if (!selected) return [];
      const { data, error } = await supabase
        .from("comunicacao_consent_log")
        .select("id, cliente_id, user_id, canal, acao, source, actor_id, created_at")
        .eq("cliente_id", selected.id)
        .eq("canal", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as ConsentLog[]) ?? [];
    },
    enabled: !!selected,
  });

  const mutate = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecione um cliente");
      if (acao === "opt_out" && justificativa.trim().length < 8) {
        throw new Error("Justificativa obrigatória (mín. 8 caracteres) para opt-out.");
      }
      const payload = {
        p_cliente_id: selected.id,
        p_user_id: null,
        p_acao: acao,
        p_source: source || "admin_ui",
        p_justificativa: justificativa.trim() || null,
      };
      const { data, error } = await supabase.rpc("rpc_admin_set_whatsapp_consent" as never, payload as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Consentimento registrado");
      setJustificativa("");
      qc.invalidateQueries({ queryKey: ["consent-prefs", selected?.id] });
      qc.invalidateQueries({ queryKey: ["consent-log", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao registrar consentimento"),
  });

  const currentState = useMemo(() => {
    if (!prefs.data) return "sem_registro";
    if (prefs.data.whatsapp_opt_out_at) return "opt_out";
    if (prefs.data.whatsapp_opt_in_at) return "opt_in";
    return "sem_registro";
  }, [prefs.data]);

  return (
    <section className="grid gap-4 md:grid-cols-[minmax(260px,340px)_1fr]" aria-label="Consentimento WhatsApp">
      {/* Coluna 1: busca */}
      <div className="space-y-3">
        <div className="rounded-md border p-3 space-y-2">
          <label className="text-xs font-medium">Buscar cliente</label>
          <div className="flex gap-1.5">
            <Input
              placeholder="Nome, CNPJ ou CPF"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="h-9"
            />
            <Button variant="outline" size="sm" className="h-9">
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-72 overflow-auto -mx-1 mt-1">
            {search.isLoading && term.length >= 2 && (
              <p className="text-xs text-muted-foreground px-1 py-2">Buscando…</p>
            )}
            {(search.data ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted ${
                  selected?.id === c.id ? "bg-primary/10 border border-primary/40" : ""
                }`}
              >
                <p className="truncate font-medium">{c.nome ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <PhoneCall className="h-3 w-3" /> {maskPhone(c.telefone)}
                </p>
              </button>
            ))}
            {!search.isLoading && term.length >= 2 && (search.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground px-1 py-2">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>
      </div>

      {/* Coluna 2: estado atual + form + histórico */}
      <div className="space-y-4">
        {!selected ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Selecione um cliente para gerenciar o consentimento WhatsApp.
          </div>
        ) : (
          <>
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{selected.nome ?? selected.id}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <PhoneCall className="h-3 w-3" /> {maskPhone(selected.telefone)}
                  </p>
                </div>
                <StateBadge state={currentState} verified={prefs.data?.telefone_verificado === true} />
              </div>
              {prefs.data && (
                <p className="text-[11px] text-muted-foreground">
                  Última atualização: {new Date(prefs.data.updated_at).toLocaleString("pt-BR")}
                  {" · origem: "}{prefs.data.source}
                </p>
              )}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Registrar ação</h3>
              {!canMutate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Somente administradores podem alterar consentimento.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(["opt_in", "opt_out", "verified"] as Acao[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAcao(a)}
                    disabled={!canMutate}
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      acao === a ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                    } disabled:opacity-50`}
                  >
                    {a === "opt_in" ? "Opt-in" : a === "opt_out" ? "Opt-out" : "Telefone verificado"}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-medium">Origem</label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value.slice(0, 60))}
                  disabled={!canMutate}
                  className="h-9"
                  placeholder="admin_ui, ligacao, formulario_produtor…"
                />
                <label className="text-xs font-medium">
                  Justificativa {acao === "opt_out" && <span className="text-destructive">*</span>}
                </label>
                <Textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value.slice(0, 500))}
                  disabled={!canMutate}
                  placeholder={
                    acao === "opt_out"
                      ? "Obrigatória para opt-out (min. 8 caracteres)."
                      : "Opcional. Fica registrada na trilha imutável."
                  }
                  className="min-h-[80px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="default"
                  size="sm"
                  disabled={!canMutate || mutate.isPending}
                  onClick={() => mutate.mutate()}
                >
                  {mutate.isPending ? "Registrando…" : "Confirmar"}
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="p-3 border-b">
                <h3 className="text-sm font-semibold">Histórico de consentimento</h3>
                <p className="text-[11px] text-muted-foreground">
                  Trilha imutável — 30 eventos mais recentes deste cliente.
                </p>
              </div>
              <div className="max-h-72 overflow-auto text-sm">
                {historico.isLoading && <p className="p-3 text-xs text-muted-foreground">Carregando…</p>}
                {!historico.isLoading && (historico.data ?? []).length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">Nenhum registro anterior.</p>
                )}
                {(historico.data ?? []).map((h) => (
                  <div key={h.id} className="px-3 py-2 border-b last:border-0 flex justify-between gap-2 text-xs">
                    <div>
                      <span className="font-medium">{h.acao}</span>
                      <span className="text-muted-foreground"> · {h.source}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function StateBadge({
  state,
  verified,
}: {
  state: "opt_in" | "opt_out" | "sem_registro";
  verified: boolean;
}) {
  if (state === "opt_out") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldOff className="h-3 w-3" /> Opt-out
      </Badge>
    );
  }
  if (state === "opt_in") {
    return (
      <Badge variant="default" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> Opt-in {verified ? "· verificado" : ""}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      Sem registro
    </Badge>
  );
}
