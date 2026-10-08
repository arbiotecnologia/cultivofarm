/**
 * Fase S4 — aba "Meu Plano" (Configurações), para o administrador da empresa
 * e para o superadmin de plataforma quando vinculado a uma organização.
 *
 * SOMENTE LEITURA: mostra o plano contratado, a situação da assinatura e o
 * catálogo de módulos/funcionalidades com o que está incluído. A fonte é a
 * RPC segura `get_my_entitlements` + leitura das tabelas SaaS permitida pela
 * policy `saas_admin_read` (apenas leitura; nenhuma escrita existe aqui).
 * Alterações de plano são feitas pelo Superadmin em /plataforma.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  comporModulos,
  formatarLimite,
  STATUS_ASSINATURA_LABEL,
  totalIncluidas,
  type CatalogoFeature,
  type CatalogoModulo,
  type EntitlementEfetivo,
} from "@/lib/saas/meuPlano";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface AssinaturaPropria {
  id: string;
  plan_id: string;
  plan_version_id: string | null;
  status: string;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  price_snapshot: number | null;
  currency_snapshot: string | null;
  billing_cycle_snapshot: string | null;
  limits_snapshot: Record<string, unknown> | null;
}

interface PlanoInfo {
  id: string;
  name: string;
  description: string | null;
}

function dataCurta(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function EstadoConsulta({
  carregando,
  erro,
  mensagem,
  onTentarNovamente,
}: {
  carregando: boolean;
  erro: boolean;
  mensagem: string;
  onTentarNovamente: () => void;
}) {
  if (carregando) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-52" />
      </div>
    );
  }
  if (erro) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar as informações do plano agora.
        </p>
        <Button variant="outline" size="sm" onClick={onTentarNovamente}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground py-4 text-center">{mensagem}</p>;
}

export function MeuPlanoTab() {
  // Organização do usuário — resolvida no servidor (fail-closed: sem empresa, sem dados).
  const org = useQuery<string | null>({
    queryKey: ["saas", "minha-organizacao"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("h15_actor_organization");
      if (error) throw new Error("organizacao_indisponivel");
      const valor = Array.isArray(data) ? data[0] : data;
      return (valor as string | undefined) ?? null;
    },
  });

  const orgId = org.data ?? null;

  const assinatura = useQuery<AssinaturaPropria | null>({
    queryKey: ["saas", "minha-assinatura", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_subscriptions")
        .select("id, plan_id, plan_version_id, status, started_at, trial_ends_at, current_period_end, cancel_at, price_snapshot, currency_snapshot, billing_cycle_snapshot, limits_snapshot")
        .eq("organization_id", orgId)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw new Error("assinatura_indisponivel");
      return (data?.[0] as AssinaturaPropria | undefined) ?? null;
    },
  });

  const plano = useQuery<PlanoInfo | null>({
    queryKey: ["saas", "meu-plano", assinatura.data?.plan_id ?? null],
    enabled: !!assinatura.data?.plan_id,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db
        .from("saas_plans")
        .select("id, name, description")
        .eq("id", assinatura.data?.plan_id ?? "")
        .limit(1);
      if (error) throw new Error("plano_indisponivel");
      return (data?.[0] as PlanoInfo | undefined) ?? null;
    },
  });

  const catalogo = useQuery<{ modulos: CatalogoModulo[]; features: CatalogoFeature[] }>({
    queryKey: ["saas", "catalogo-meu-plano"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [modRes, featRes] = await Promise.all([
        db.from("saas_modules").select("id, key, name, active").order("name", { ascending: true }),
        db.from("saas_features").select("id, module_id, key, name, active").order("name", { ascending: true }),
      ]);
      if (modRes.error || featRes.error) throw new Error("catalogo_indisponivel");
      return { modulos: modRes.data ?? [], features: featRes.data ?? [] };
    },
  });

  const entitlements = useQuery<EntitlementEfetivo[]>({
    queryKey: ["saas", "meus-entitlements-detalhado"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_my_entitlements");
      if (error) throw new Error("entitlements_indisponivel");
      return ((data ?? []) as EntitlementEfetivo[]).map((e) => ({
        module_key: e.module_key,
        feature_key: e.feature_key,
        limit_value: e.limit_value ?? null,
      }));
    },
  });

  if (org.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            Meu Plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EstadoConsulta carregando erro={false} mensagem="" onTentarNovamente={() => org.refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (org.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            Meu Plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EstadoConsulta
            carregando={false}
            erro
            mensagem=""
            onTentarNovamente={() => org.refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            Meu Plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sua conta não está vinculada a uma empresa — não há plano para exibir.
          </p>
        </CardContent>
      </Card>
    );
  }

  const carregando = assinatura.isLoading || catalogo.isLoading || entitlements.isLoading;
  const erro = assinatura.isError || catalogo.isError || entitlements.isError;
  const modulos = catalogo.data
    ? comporModulos(catalogo.data.modulos, catalogo.data.features, entitlements.data ?? [])
    : [];
  const status = assinatura.data?.status ?? null;
  const statusLabel = status ? (STATUS_ASSINATURA_LABEL[status] ?? status) : null;
  const legado = Boolean(assinatura.data && !assinatura.data.plan_version_id);
  const bloqueada = legado || !["ACTIVE", "TRIAL"].includes(status ?? "");
  const fimExibido = status === "TRIAL" ? assinatura.data?.trial_ends_at ?? null : assinatura.data?.current_period_end ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
            Meu Plano
          </CardTitle>
          <CardDescription>
            O que a sua empresa tem contratado. Mudanças de plano são feitas pela
            plataforma Cultivo Farm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(carregando || erro || !assinatura.data) && <EstadoConsulta
            carregando={carregando}
            erro={erro}
            mensagem="Nenhuma assinatura encontrada para a sua empresa no momento."
            onTentarNovamente={() => {
              assinatura.refetch();
              catalogo.refetch();
              entitlements.refetch();
            }}
          />}
          {assinatura.data && (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-xs text-muted-foreground">Plano</dt>
                <dd className="text-sm font-medium">
                  {plano.isLoading ? "…" : plano.data?.name ?? "—"}
                </dd>
                {plano.data?.description && (
                  <dd className="text-xs text-muted-foreground">{plano.data.description}</dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd>
                  <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>
                    {statusLabel ?? "—"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Início</dt>
                <dd className="text-sm">{dataCurta(assinatura.data.started_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{status === "TRIAL" ? "Teste até" : "Vigência até"}</dt>
                <dd className="text-sm">{dataCurta(fimExibido)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Versão comercial</dt>
                <dd className="text-sm">{legado ? "Pendente" : "Vinculada"}</dd>
              </div>
            </dl>
          )}
          {assinatura.data && bloqueada && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>{legado ? "Regularização comercial pendente" : "Novas criações bloqueadas"}</AlertTitle>
              <AlertDescription>{legado ? "Esta assinatura ainda não possui uma versão comercial validada. Os dados existentes permanecem preservados." : "A situação atual da assinatura não libera novos usos. Os dados existentes permanecem preservados."}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {!carregando && !erro && !legado && modulos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Módulos e funcionalidades</CardTitle>
            <CardDescription>
              {totalIncluidas(modulos)} funcionalidade(s) incluída(s) no plano atual. Itens
              sem marcação não estão contratados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {modulos.map((m) => (
                <li key={m.key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <Badge
                      variant={m.features.some((f) => f.incluida) ? "default" : "outline"}
                    >
                      {m.features.filter((f) => f.incluida).length}/{m.features.length} incluídas
                    </Badge>
                  </div>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {m.features.map((f) => (
                      <li
                        key={f.key}
                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm"
                      >
                        <span className={f.incluida ? "" : "text-muted-foreground"}>
                          {f.name}
                        </span>
                        {f.incluida ? (
                          f.limitValue !== null ? (
                            <Badge variant="secondary" className="shrink-0">
                              Limite: {formatarLimite(f.limitValue)}
                            </Badge>
                          ) : (
                            <Badge className="shrink-0">Incluída</Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="shrink-0">
                            Não contratada
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
