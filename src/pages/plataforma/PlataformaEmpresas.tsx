import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { mensagemErroPlataforma, useAlterarStatusEmpresa, useOrganizacoesSaaS, type OrganizacaoSaaS } from "@/hooks/usePlataformaSaaS";
import { acaoStatusGenericaPermitida, ORG_STATUS_LABEL, type OrgStatus } from "@/lib/saas/orgOnboarding";
import { filtrarEmpresas, formatarCnpj } from "@/components/plataforma/empresaEdicao";
import OrganizationOnboardingFlow from "./OrganizationOnboardingFlow";
import EmpresaDetalhe from "./EmpresaDetalhe";

const ACOES_SUPERADMIN: OrgStatus[] = ["aguardando_ativacao", "rascunho", "suspensa", "ativa", "cancelada"];

type Visao = { tipo: "lista" } | { tipo: "nova" } | { tipo: "detalhe"; id: string; editar?: boolean };

export interface PlataformaEmpresasProps {
  onAbrirAdministradores: (organizationId: string) => void;
  onAbrirAssinaturas?: (organizationId: string) => void;
  onAbrirHistorico?: (organizationId: string) => void;
}

export default function PlataformaEmpresas({ onAbrirAdministradores, onAbrirAssinaturas = () => {}, onAbrirHistorico = () => {} }: PlataformaEmpresasProps) {
  const orgs = useOrganizacoesSaaS();
  const alterar = useAlterarStatusEmpresa();
  const [visao, setVisao] = useState<Visao>({ tipo: "lista" });
  const [filtro, setFiltro] = useState("");
  const [motivoDlg, setMotivoDlg] = useState<{ org: string; status: OrgStatus } | null>(null);
  const [motivo, setMotivo] = useState("");

  const lista = filtrarEmpresas(orgs.data ?? [], filtro);
  const abrir = (id: string, editar = false) => setVisao({ tipo: "detalhe", id, editar });

  const confirmarMudanca = async () => {
    if (!motivoDlg || motivo.trim().length < 5) return;
    try {
      await alterar.mutateAsync({ org: motivoDlg.org, status: motivoDlg.status, motivo: motivo.trim() });
      toast.success("Situação atualizada.");
      setMotivoDlg(null); setMotivo("");
    } catch (error) {
      toast.error(mensagemErroPlataforma(error));
    }
  };

  if (visao.tipo === "nova") {
    return (
      <section aria-labelledby="nova-empresa-titulo" className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="min-h-10" onClick={() => { setVisao({ tipo: "lista" }); void orgs.refetch(); }} aria-label="Voltar para a lista de empresas">
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Voltar
          </Button>
          <h2 id="nova-empresa-titulo" className="text-lg font-semibold">Nova Empresa</h2>
        </div>
        <OrganizationOnboardingFlow
          onOpenAdmins={onAbrirAdministradores}
          onShowOrganization={(organizationId) => { void orgs.refetch(); abrir(organizationId); }}
        />
      </section>
    );
  }

  if (visao.tipo === "detalhe") {
    return (
      <EmpresaDetalhe
        key={`${visao.id}-${visao.editar ? "e" : "v"}`}
        organizationId={visao.id}
        iniciarEdicao={visao.editar}
        onVoltar={() => setVisao({ tipo: "lista" })}
        onAbrirAdministradores={onAbrirAdministradores}
        onAbrirAssinaturas={onAbrirAssinaturas}
        onAbrirHistorico={onAbrirHistorico}
      />
    );
  }

  const menuAcoes = (org: OrganizacaoSaaS) => {
    const status = org.status as OrgStatus;
    const transicoes = ACOES_SUPERADMIN.filter((next) => acaoStatusGenericaPermitida(status, next));
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Mais ações para ${org.nome}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => onAbrirAdministradores(org.id)}>Administradores</DropdownMenuItem>
          {transicoes.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs text-muted-foreground">Alterar situação</DropdownMenuLabel></>}
          {transicoes.map((next) => (
            <DropdownMenuItem key={next} disabled={alterar.isPending} onSelect={() => { setMotivo(""); setMotivoDlg({ org: org.id, status: next }); }}>
              {ORG_STATUS_LABEL[next]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <section aria-labelledby="empresas-titulo" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="empresas-titulo" className="text-lg font-semibold">Empresas</h2>
          <p className="text-sm text-muted-foreground">Consulte, abra e edite os dados cadastrais das empresas. Mudanças de situação exigem motivo.</p>
        </div>
        <Button className="min-h-10 shrink-0" onClick={() => setVisao({ tipo: "nova" })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova Empresa</Button>
      </div>

      <div className="max-w-sm space-y-1">
        <Label htmlFor="emp-filtro">Buscar empresa</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="emp-filtro" className="pl-9" value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Razão social, nome fantasia ou CNPJ" />
        </div>
      </div>

      {orgs.isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>}
      {orgs.isError && (
        <div className="py-6 text-center space-y-2"><p className="text-sm text-muted-foreground">Não foi possível carregar as empresas.</p>
          <Button size="sm" variant="outline" onClick={() => orgs.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente</Button></div>
      )}
      {orgs.data && lista.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{filtro ? "Nenhuma empresa encontrada para a busca." : "Nenhuma empresa cadastrada."}</p>}

      {lista.length > 0 && (
        <>
          <ul className="space-y-2 md:hidden" aria-label="Empresas">
            {lista.map((org) => (
              <li key={org.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{org.nome}</p>
                    {org.nome_fantasia && <p className="text-xs text-muted-foreground break-words">{org.nome_fantasia}</p>}
                    <p className="text-xs text-muted-foreground">{formatarCnpj(org.cnpj)}</p>
                  </div>
                  {menuAcoes(org)}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant="outline">{ORG_STATUS_LABEL[org.status as OrgStatus] ?? org.status}</Badge>
                  <div className="flex gap-2"><Button size="sm" variant="outline" className="min-h-10" onClick={() => abrir(org.id, true)} aria-label={`Editar empresa ${org.nome}`}>Editar</Button><Button size="sm" className="min-h-10" onClick={() => abrir(org.id)} aria-label={`Abrir empresa ${org.nome}`}>Ver</Button></div>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>CNPJ</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {lista.map((org) => (
                  <TableRow key={org.id} className="cursor-pointer" onClick={() => abrir(org.id)}>
                    <TableCell className="font-medium">{org.nome}{org.nome_fantasia && <span className="block text-xs text-muted-foreground">{org.nome_fantasia}</span>}</TableCell>
                    <TableCell>{formatarCnpj(org.cnpj)}</TableCell>
                    <TableCell><Badge variant="outline">{ORG_STATUS_LABEL[org.status as OrgStatus] ?? org.status}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="min-h-9 mr-1" onClick={() => abrir(org.id)} aria-label={`Abrir empresa ${org.nome}`}>Ver</Button>
                      <Button size="sm" variant="outline" className="min-h-9 mr-1" onClick={() => abrir(org.id, true)} aria-label={`Editar empresa ${org.nome}`}>Editar</Button>
                      {menuAcoes(org)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(orgs.data?.length ?? 0) >= 200 && <p className="text-xs text-muted-foreground">Exibindo as primeiras 200 empresas. Refine a busca para encontrar outras.</p>}
        </>
      )}

      <AlertDialog open={Boolean(motivoDlg)} onOpenChange={(open) => !open && setMotivoDlg(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Alterar para “{motivoDlg ? ORG_STATUS_LABEL[motivoDlg.status] : ""}”</AlertDialogTitle><AlertDialogDescription>Informe o motivo (mínimo 5 caracteres). A mudança fica registrada.</AlertDialogDescription></AlertDialogHeader><div className="space-y-1"><Label htmlFor="emp-motivo">Motivo *</Label><Input id="emp-motivo" value={motivo} maxLength={500} onChange={(event) => setMotivo(event.target.value)} /></div><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={motivo.trim().length < 5 || alterar.isPending} onClick={(event) => { event.preventDefault(); void confirmarMudanca(); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>
  );
}
