/**
 * Home provisória do Superadmin de Plataforma (pré-Fase S4).
 *
 * SOMENTE LEITURA: catálogo de planos/módulos/funcionalidades, assinaturas por
 * organização e histórico de assinaturas. Nenhuma ação de escrita existe nesta
 * tela — as tabelas SaaS não possuem policy de INSERT/UPDATE/DELETE, e a
 * leitura depende da policy `saas_platform_read` no servidor.
 *
 * Não toca menus operacionais: esta rota vive fora do layout administrativo
 * (sem barra lateral de módulos) e fora do `ACCESS_MAP`.
 */
import { useState } from "react";
import { ShieldCheck, LogOut, RefreshCw, Layers, Building2, History, SlidersHorizontal, UserCog } from "lucide-react";
import { AlterarAssinaturaCard, ExcecoesTab } from "./PlataformaGestao";
import PlataformaAdmins from "./PlataformaAdmins";
import PlataformaEmpresas from "./PlataformaEmpresas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import {
  useAssinaturasSaaS,
  useHistoricoAssinaturasSaaS,
  useModulosFeaturesSaaS,
  useOrganizacoesSaaS,
  usePlanosSaaS,
} from "@/hooks/usePlataformaSaaS";

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento em atraso",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

function dataCurta(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function dataHora(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function EstadoConsulta({
  carregando,
  erro,
  vazio,
  mensagemVazio,
  onTentarNovamente,
}: {
  carregando: boolean;
  erro: boolean;
  vazio: boolean;
  mensagemVazio: string;
  onTentarNovamente: () => void;
}) {
  if (carregando) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>;
  }
  if (erro) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar estas informações agora.
        </p>
        <Button variant="outline" size="sm" onClick={onTentarNovamente}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (vazio) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{mensagemVazio}</p>;
  }
  return null;
}

/** Nomes humanos para origens/motivos técnicos do histórico (detalhe em expansão). */
const ORIGEM_LABEL: Record<string, string> = {
  superadmin_panel: "Painel da plataforma",
  platform_rpc: "Rotina administrativa",
  service_role: "Rotina do sistema",
  seed: "Criação inicial",
  manual: "Manual",
};
const motivoHumano = (s: string | null) => (s ? (ORIGEM_LABEL[s] ?? s.replace(/_/g, " ")) : "—");

export default function PlataformaHome() {
  const { signOut } = useAuth();
  const [aba, setAba] = useState("planos");
  const planos = usePlanosSaaS();
  const catalogo = useModulosFeaturesSaaS();
  const assinaturas = useAssinaturasSaaS();
  const historico = useHistoricoAssinaturasSaaS();
  const organizacoes = useOrganizacoesSaaS();

  const nomeOrg = (id: string) =>
    organizacoes.data?.find((o) => o.id === id)?.nome ?? id.slice(0, 8);
  const nomePlano = (id: string) => planos.data?.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <main className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">Gestão da plataforma</p>
              <p className="text-[11px] leading-tight text-muted-foreground truncate">
                Superadmin de Plataforma · isolado das operações das empresas
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sair da conta">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gestão da plataforma</CardTitle>
            <CardDescription>
              Planos, assinaturas, exceções, empresas e administradores. Toda alteração é validada no
              servidor, exige motivo e fica registrada no histórico — e é isolada das operações das empresas.
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="planos">
              <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
              Planos
            </TabsTrigger>
            <TabsTrigger value="assinaturas">
              <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Assinaturas
            </TabsTrigger>
            <TabsTrigger value="excecoes">
              <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
              Exceções
            </TabsTrigger>
            <TabsTrigger value="empresas">
              <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Nova Empresa
            </TabsTrigger>
            <TabsTrigger value="admins">
              <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />
              Administradores
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="mr-2 h-4 w-4" aria-hidden="true" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* PLANOS ------------------------------------------------------- */}
          <TabsContent value="planos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Planos comerciais</CardTitle>
                <CardDescription>Catálogo de planos cadastrados na plataforma.</CardDescription>
              </CardHeader>
              <CardContent>
                <EstadoConsulta
                  carregando={planos.isLoading}
                  erro={planos.isError}
                  vazio={!!planos.data && planos.data.length === 0}
                  mensagemVazio="Nenhum plano cadastrado."
                  onTentarNovamente={() => planos.refetch()}
                />
                {planos.data && planos.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plano</TableHead>
                          <TableHead>Identificador</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead>Criado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {planos.data.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">
                              {p.name}
                              {p.is_default && (
                                <Badge variant="secondary" className="ml-2">
                                  Padrão
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.key}</TableCell>
                            <TableCell>
                              <Badge variant={p.active ? "default" : "outline"}>
                                {p.active ? "Ativo" : "Inativo"}
                              </Badge>
                            </TableCell>
                            <TableCell>{dataCurta(p.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Módulos e funcionalidades</CardTitle>
                <CardDescription>
                  Itens que futuramente poderão ser incluídos nos planos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EstadoConsulta
                  carregando={catalogo.isLoading}
                  erro={catalogo.isError}
                  vazio={!!catalogo.data && catalogo.data.modulos.length === 0}
                  mensagemVazio="Nenhum módulo cadastrado — nada é bloqueado enquanto o catálogo estiver vazio."
                  onTentarNovamente={() => catalogo.refetch()}
                />
                {catalogo.data && catalogo.data.modulos.length > 0 && (
                  <ul className="space-y-3">
                    {catalogo.data.modulos.map((m) => (
                      <li key={m.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.name}</span>
                          <Badge variant={m.active ? "default" : "outline"}>
                            {m.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {catalogo.data.features.filter((f) => f.module_id === m.id).length}{" "}
                          funcionalidade(s)
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ASSINATURAS -------------------------------------------------- */}
          <TabsContent value="excecoes">
            <ExcecoesTab />
          </TabsContent>

          {/* ADMINISTRADORES DE EMPRESA ----------------------------------- */}
          <TabsContent value="empresas">
            <PlataformaEmpresas onConvidar={() => setAba("admins")} />
          </TabsContent>

          <TabsContent value="admins">
            <PlataformaAdmins />
          </TabsContent>


          <TabsContent value="assinaturas" className="space-y-4">
            <AlterarAssinaturaCard />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assinaturas por empresa</CardTitle>
                <CardDescription>Situação atual de cada organização.</CardDescription>
              </CardHeader>
              <CardContent>
                <EstadoConsulta
                  carregando={assinaturas.isLoading}
                  erro={assinaturas.isError}
                  vazio={!!assinaturas.data && assinaturas.data.length === 0}
                  mensagemVazio="Nenhuma assinatura registrada até o momento."
                  onTentarNovamente={() => assinaturas.refetch()}
                />
                {assinaturas.data && assinaturas.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Plano</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead>Início</TableHead>
                          <TableHead>Vigência até</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assinaturas.data.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{nomeOrg(a.organization_id)}</TableCell>
                            <TableCell>{nomePlano(a.plan_id)}</TableCell>
                            <TableCell>
                              <Badge variant={a.status === "ACTIVE" ? "default" : "secondary"}>
                                {STATUS_LABEL[a.status] ?? a.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{dataCurta(a.started_at)}</TableCell>
                            <TableCell>{dataCurta(a.current_period_end)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTÓRICO ---------------------------------------------------- */}
          <TabsContent value="historico">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de assinaturas</CardTitle>
                <CardDescription>
                  Registro permanente das mudanças — não pode ser editado nem apagado.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EstadoConsulta
                  carregando={historico.isLoading}
                  erro={historico.isError}
                  vazio={!!historico.data && historico.data.length === 0}
                  mensagemVazio="Nenhuma mudança registrada."
                  onTentarNovamente={() => historico.refetch()}
                />
                {historico.data && historico.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quando</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historico.data.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{dataHora(h.created_at)}</TableCell>
                            <TableCell>{nomeOrg(h.organization_id)}</TableCell>
                            <TableCell className="text-muted-foreground">{motivoHumano(h.source)}</TableCell>
                            <TableCell>{motivoHumano(h.reason)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
