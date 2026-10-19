import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Store, Sprout, LayoutDashboard, LogOut, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useAvailableContexts,
  registerLoginRedirect,
  type PortalContext,
} from "@/hooks/useAvailableContexts";
import { PORTAL_CONTEXT_HOME, automaticPortalContext } from "@/lib/portalContext";
import { setActivePortalContext } from "@/lib/activePortalContext";
import { toast } from "sonner";

function getFirstName(user: { user_metadata?: Record<string, unknown>; email?: string | null } | null): string {
  if (!user) return "";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  if (full) return full.trim().split(/\s+/)[0];
  if (user.email) return user.email.split("@")[0];
  return "";
}

export default function SelecionarPortal() {
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();
  const [params] = useSearchParams();
  const manual = params.get("intent") === "switch";
  const { data, isLoading, isError, refetch, isFetching, ready, scope } = useAvailableContexts();
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState<PortalContext | null>(null);

  const firstName = useMemo(() => profile?.nome?.trim().split(/\s+/)[0] ?? getFirstName(user), [profile?.nome, user]);
  const current = useRef({ scope, mounted: true, epoch: 0 });
  if (current.current.scope !== scope) { current.current.scope = scope; current.current.epoch += 1; }
  const lock = useRef(false);
  useEffect(() => {
    const state = current.current;
    state.mounted = true;
    return () => { state.mounted = false; state.epoch += 1; };
  }, []);
  useEffect(() => { setSubmitting(null); setRemember(false); }, [scope]);

  // Sincroniza estado inicial do checkbox com a preferência atual (revalidada pela RPC).
  useEffect(() => {
    if (data?.skip_context_selector && data.preferred_context) {
      setRemember(true);
    }
  }, [data?.skip_context_selector, data?.preferred_context]);

  // Redirecionamento automático baseado nos contextos reais (nunca em query/localStorage).
  // Não redireciona para /acesso-pendente enquanto a consulta estiver carregando,
  // revalidando (isFetching) ou em erro transitório.
  useEffect(() => {
    if (!ready || !data || submitting || isLoading || isFetching || isError) return;
    const ctxs = data.available_contexts;

    if (ctxs.length === 0) {
      navigate("/acesso-pendente", { replace: true });
      return;
    }
    const target = automaticPortalContext(ctxs, data.preferred_context, data.skip_context_selector, manual);
    if (target) {
      setActivePortalContext(target);
      void registerLoginRedirect(target);
      navigate(PORTAL_CONTEXT_HOME[target], { replace: true });
    }
  }, [data, submitting, navigate, isLoading, isFetching, isError, ready, manual]);

  async function pick(ctx: PortalContext) {
    if (lock.current || !ready || !data?.available_contexts.includes(ctx)) return;
    lock.current = true;
    const started = scope;
    const epoch = current.current.epoch;
    const valid = () => current.current.mounted && current.current.scope === started && current.current.epoch === epoch;
    setSubmitting(ctx);
    try {
      const { data: res, error } = await supabase.rpc("set_my_context_preference", {
        p_context: ctx,
        p_remember: remember,
      });
      if (!valid()) return;
      if (error) throw error;
      const parsed = res as { ok: boolean; error_code?: string } | null;
      if (!parsed?.ok) {
        toast.error("Não foi possível abrir o portal selecionado.", {
          description: "Seus acessos podem ter mudado. Atualizando…",
        });
        await refetch();
        if (!valid()) return;
        setSubmitting(null);
        return;
      }
      setActivePortalContext(ctx);
      navigate(PORTAL_CONTEXT_HOME[ctx], { replace: true });
    } catch {
      if (!valid()) return;
      console.warn("[SelecionarPortal] context_selection_unavailable");
      toast.error("Não foi possível abrir o portal selecionado.", {
        description: "Tente novamente em instantes.",
      });
      setSubmitting(null);
    } finally {
      lock.current = false;
      if (valid()) setSubmitting(null);
    }
  }

  if (!user) return null;

  if (isLoading || !ready) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm">Validando seus acessos…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <CardTitle>Não foi possível validar seus acessos</CardTitle>
            <CardDescription>
              Verifique sua conexão e tente novamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => refetch()} aria-label="Tentar novamente">
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => refetch()} aria-label="Atualizar acessos">
              Atualizar acessos
            </Button>
            <Button variant="ghost" onClick={signOut} aria-label="Sair da conta">
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showSelector = data && data.available_contexts.length >= 2;
  if (!showSelector) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm">Abrindo o portal…</p>
        </div>
      </div>
    );
  }

  const disabled = submitting !== null;

  return (
    <main
      className="min-h-dvh bg-background flex items-start sm:items-center justify-center px-4 py-8 sm:py-12 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center space-y-2">
          {firstName && (
            <p className="text-sm text-muted-foreground">Olá, {firstName}</p>
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Como você deseja acessar o sistema?
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Escolha o ambiente de trabalho que deseja utilizar agora. Você
            poderá trocar de portal posteriormente sem sair da sua conta.
          </p>
        </header>

        <div
          className="grid gap-4 sm:gap-6 md:grid-cols-2"
          role="group"
          aria-label="Portais disponíveis"
        >
          {data.available_contexts.map((ctx) => {
            const label = ctx === "admin" ? "Gestão" : ctx === "technical" ? "Portal Técnico" : "Portal Parceiro B2B";
            const Icon = ctx === "admin" ? LayoutDashboard : ctx === "technical" ? Sprout : Store;
            return <Card key={ctx} className="flex flex-col border-2 transition hover:border-primary focus-within:border-primary">
              <CardHeader className="space-y-3">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <CardTitle className="text-lg">{label}</CardTitle>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button className="w-full min-h-11" disabled={disabled || isFetching} aria-label={`Acessar ${label}`} onClick={() => pick(ctx)}>
                  {submitting === ctx ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Abrindo o portal…</> : `Acessar ${label}`}
                </Button>
              </CardContent>
            </Card>;
          })}
        </div>

        <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <label className="flex items-start sm:items-center gap-3 text-sm cursor-pointer select-none">
            <Checkbox
              id="remember-portal"
              checked={remember}
              disabled={disabled}
              onCheckedChange={(v) => setRemember(v === true)}
              aria-describedby="remember-portal-desc"
            />
            <span>
              <span className="block font-medium">
                Entrar diretamente neste portal nos próximos acessos
              </span>
              <span
                id="remember-portal-desc"
                className="block text-xs text-muted-foreground mt-0.5"
              >
                Você poderá desmarcar a qualquer momento.
              </span>
            </span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            disabled={disabled}
            aria-label="Sair da conta"
            className="self-end sm:self-auto"
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
          </Button>
        </div>

        {isFetching && (
          <p className="text-center text-xs text-muted-foreground" role="status" aria-live="polite">
            Atualizando seus acessos…
          </p>
        )}
      </div>
    </main>
  );
}
