import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { mensagemErroPlataforma, useAlterarStatusEmpresa, useOrganizacoesSaaS } from "@/hooks/usePlataformaSaaS";
import { ORG_STATUS_LABEL, type OrgStatus, normalizarCnpj, transicaoPermitida } from "@/lib/saas/orgOnboarding";
import OrganizationOnboardingFlow from "./OrganizationOnboardingFlow";

const ACOES_SUPERADMIN: OrgStatus[] = ["aguardando_ativacao", "rascunho", "suspensa", "ativa", "cancelada"];

export default function PlataformaEmpresas({ onAbrirAdministradores }: { onAbrirAdministradores: (organizationId: string) => void }) {
  const orgs = useOrganizacoesSaaS();
  const alterar = useAlterarStatusEmpresa();
  const [filtro, setFiltro] = useState("");
  const [motivoDlg, setMotivoDlg] = useState<{ org: string; status: OrgStatus } | null>(null);
  const [motivo, setMotivo] = useState("");

  const lista = (orgs.data ?? []).filter((org) => {
    const query = filtro.trim().toLowerCase();
    if (!query) return true;
    return [org.nome, org.nome_fantasia, org.cnpj].some((value) => (value ?? "").toLowerCase().includes(query)) ||
      Boolean(normalizarCnpj(query) && normalizarCnpj(org.cnpj ?? "")?.includes(normalizarCnpj(query) ?? ""));
  });

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

  return (
    <div className="space-y-6">
      <OrganizationOnboardingFlow
        onOpenAdmins={onAbrirAdministradores}
        onShowOrganization={(organizationId) => {
          const item = orgs.data?.find((org) => org.id === organizationId);
          setFiltro(item?.cnpj ?? item?.nome ?? organizationId);
          document.getElementById("lista-empresas")?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <Card id="lista-empresas">
        <CardHeader><CardTitle className="text-base">Empresas</CardTitle><CardDescription>Histórico separado da ação corrente. Mudanças de situação exigem motivo.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm space-y-1"><Label htmlFor="emp-filtro">Buscar empresa</Label><Input id="emp-filtro" value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Nome ou CNPJ" /></div>
          {orgs.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {orgs.isError && <Button size="sm" variant="outline" onClick={() => orgs.refetch()}>Tentar novamente</Button>}
          {orgs.data && lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>}
          {lista.length > 0 && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>CNPJ</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{lista.map((org) => {
            const status = org.status as OrgStatus;
            return <TableRow key={org.id}><TableCell className="font-medium">{org.nome}{org.nome_fantasia && <span className="block text-xs text-muted-foreground">{org.nome_fantasia}</span>}</TableCell><TableCell>{org.cnpj ?? "—"}</TableCell><TableCell><Badge variant="outline">{ORG_STATUS_LABEL[status] ?? org.status}</Badge></TableCell><TableCell className="space-x-1"><Button size="sm" variant="ghost" onClick={() => onAbrirAdministradores(org.id)}>Administradores</Button>{ACOES_SUPERADMIN.filter((next) => transicaoPermitida(status, next) && !(status === "onboarding" && next === "ativa")).map((next) => <Button key={next} size="sm" variant="ghost" disabled={alterar.isPending} onClick={() => { setMotivo(""); setMotivoDlg({ org: org.id, status: next }); }}>{ORG_STATUS_LABEL[next]}</Button>)}</TableCell></TableRow>;
          })}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(motivoDlg)} onOpenChange={(open) => !open && setMotivoDlg(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Alterar para “{motivoDlg ? ORG_STATUS_LABEL[motivoDlg.status] : ""}”</AlertDialogTitle><AlertDialogDescription>Informe o motivo (mínimo 5 caracteres). A mudança fica registrada.</AlertDialogDescription></AlertDialogHeader><div className="space-y-1"><Label htmlFor="emp-motivo">Motivo *</Label><Input id="emp-motivo" value={motivo} maxLength={500} onChange={(event) => setMotivo(event.target.value)} /></div><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={motivo.trim().length < 5 || alterar.isPending} onClick={(event) => { event.preventDefault(); void confirmarMudanca(); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
