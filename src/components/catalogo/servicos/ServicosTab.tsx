import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  ServiceConflictError, requestNfseEmission, useBillServices, useCatalogServices, useNfseReadiness, useSaveCatalogService,
  useSaveEngagement, useServiceCustomers, useServiceEngagements, useServiceFiscalProfilesByService, useServiceInvoices,
  type CatalogService, type ServiceEngagement, type ServiceInput,
} from "@/hooks/useCatalogServices";
import {
  BillingKeyStore, ENGAGEMENT_STATUS_LABEL, NFSE_STATE_LABEL, READINESS_MISSING_LABEL, canBillServices, canEditServiceFiscalProfile,
  canRecordEngagement, canWriteServiceCatalog, nfseDisplayState, validateBillingSelection,
} from "@/lib/services/serviceBilling";
import { ServiceFiscalEditDrawer } from "@/pages/configuracoes/FiscalServicos";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date().toISOString().slice(0, 10);

export function ServicosTab() {
  const { roles = [], profile, user } = useAuth();
  const canWrite = canWriteServiceCatalog(roles);
  const services = useCatalogServices();
  const profiles = useServiceFiscalProfilesByService();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);
  const list = useMemo(() => (services.data ?? []).filter(s => !search || `${s.name} ${s.code ?? ""}`.toLowerCase().includes(search.toLowerCase())), [services.data, search]);
  const profileBySvc = useMemo(() => new Map((profiles.data ?? []).map(p => [p.service_id as string, p])), [profiles.data]);
  const scope = `${user?.id}|${profile?.organization_id}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">Serviços da empresa</CardTitle>
          {canWrite && <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" />Novo serviço</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Buscar por nome ou código" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar serviço" />
          {services.isLoading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p>
            : services.isError ? <p className="text-destructive">Não foi possível carregar os serviços.</p>
            : list.length === 0 ? <p className="text-muted-foreground">Nenhum serviço cadastrado.</p>
            : <Table><TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Preço</TableHead><TableHead>Fiscal</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{list.map(s => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.name}</div>{s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}</TableCell>
                  <TableCell>{s.unit}</TableCell><TableCell className="text-right">{brl(Number(s.unit_price))}</TableCell>
                  <TableCell>{profileBySvc.has(s.id) ? <Badge variant="secondary">Perfil {profileBySvc.get(s.id)!.profile_status}</Badge> : <Badge variant="outline">Sem perfil</Badge>}</TableCell>
                  <TableCell>{s.is_active ? "Ativo" : "Inativo"}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => setEditing(s)}>{canWrite ? "Editar" : "Ver"}</Button></TableCell>
                </TableRow>))}</TableBody></Table>}
        </CardContent>
      </Card>
      {canRecordEngagement(roles) && <EngagementsSection services={services.data ?? []} scope={scope} />}
      {editing !== null && <ServiceDialog item={editing} canWrite={canWrite} profile={editing === "new" ? undefined : profileBySvc.get(editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceDialog({ item, canWrite, profile, onClose }: { item: CatalogService | "new"; canWrite: boolean; profile?: ReturnType<typeof useServiceFiscalProfilesByService>["data"] extends (infer T)[] | undefined ? T : never; onClose: () => void }) {
  const { roles = [] } = useAuth();
  const isNew = item === "new";
  const save = useSaveCatalogService();
  const [v, setV] = useState<ServiceInput>(() => isNew ? { code: "", name: "", description: "", unit: "UN", unit_price: 0, is_active: true } : { code: item.code ?? "", name: item.name, description: item.description ?? "", unit: item.unit, unit_price: Number(item.unit_price), is_active: item.is_active });
  const [fiscalOpen, setFiscalOpen] = useState(false);
  async function submit() {
    try {
      await save.mutateAsync({ id: isNew ? null : item.id, expectedUpdatedAt: isNew ? null : item.updated_at, values: v });
      toast({ title: "Serviço salvo" }); onClose();
    } catch (e) {
      const msg = e instanceof ServiceConflictError ? (e.kind === "duplicate" ? "Já existe serviço ativo com este nome ou código." : "O serviço foi alterado por outra pessoa. Feche e abra novamente.") : (e as Error).message;
      toast({ title: "Não foi salvo", description: msg, variant: "destructive" });
    }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isNew ? "Novo serviço" : item.name}</DialogTitle></DialogHeader>
        <Tabs defaultValue="cadastro">
          <TabsList><TabsTrigger value="cadastro">Cadastro</TabsTrigger><TabsTrigger value="fiscal" disabled={isNew}>Fiscal</TabsTrigger></TabsList>
          <TabsContent value="cadastro">
            <fieldset disabled={!canWrite || save.isPending} className="grid gap-3">
              <div className="grid gap-1"><Label htmlFor="svc-name">Nome</Label><Input id="svc-name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Ex.: Consultoria agronômica" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1"><Label htmlFor="svc-code">Código</Label><Input id="svc-code" value={v.code} onChange={e => setV({ ...v, code: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="svc-unit">Unidade</Label><Input id="svc-unit" value={v.unit} onChange={e => setV({ ...v, unit: e.target.value })} placeholder="UN, H, HA" /></div>
                <div className="grid gap-1"><Label htmlFor="svc-price">Preço</Label><Input id="svc-price" type="number" min={0} step="0.01" value={v.unit_price} onChange={e => setV({ ...v, unit_price: Number(e.target.value) })} /></div>
              </div>
              <div className="grid gap-1"><Label htmlFor="svc-desc">Descrição</Label><Textarea id="svc-desc" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch id="svc-active" checked={v.is_active} onCheckedChange={c => setV({ ...v, is_active: c })} /><Label htmlFor="svc-active">Ativo</Label></div>
            </fieldset>
            {canWrite && <DialogFooter className="mt-4"><Button onClick={submit} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter>}
          </TabsContent>
          {!isNew && <TabsContent value="fiscal" className="space-y-3">
            {profile ? <div className="space-y-1 text-sm"><p>Situação: <Badge variant="secondary">{profile.profile_status}</Badge></p><p>Item LC 116: {profile.lc116_item ?? "pendente"}</p><p>Código nacional: {profile.national_taxation_code ?? "pendente"}</p><p>Código municipal: {profile.municipal_taxation_code ?? "pendente"}</p></div>
              : <p className="text-sm text-muted-foreground">Este serviço ainda não tem perfil fiscal. Sem ele não é possível faturar.</p>}
            {canEditServiceFiscalProfile(roles) ? <Button variant="outline" onClick={() => setFiscalOpen(true)}>{profile ? "Editar perfil fiscal" : "Criar perfil fiscal"}</Button>
              : <p className="text-xs text-muted-foreground">Somente administrador ou financeiro editam o perfil fiscal.</p>}
          </TabsContent>}
        </Tabs>
        {fiscalOpen && !isNew && <ServiceFiscalEditDrawer item={profile ?? "new"} canEdit linkedService={{ id: item.id, name: item.name }} onClose={() => setFiscalOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const keyStore = new BillingKeyStore();

function EngagementsSection({ services, scope }: { services: CatalogService[]; scope: string }) {
  const { roles = [] } = useAuth();
  const engagements = useServiceEngagements(true);
  const customers = useServiceCustomers(true);
  const save = useSaveEngagement();
  const bill = useBillServices();
  const canBill = canBillServices(roles);
  const readiness = useNfseReadiness(canBill);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);
  const rows = engagements.data ?? [];
  const invoiceIds = useMemo(() => [...new Set(rows.map(r => r.fiscal_invoice_id).filter((x): x is string => !!x))], [rows]);
  const invoices = useServiceInvoices(invoiceIds);
  const invById = new Map((invoices.data ?? []).map(i => [i.id, i]));
  const svcName = new Map(services.map(s => [s.id, s.name]));
  const custName = new Map((customers.data ?? []).map(c => [c.id, c.nome]));
  const selRows = rows.filter(r => selected.includes(r.id));
  const selError = validateBillingSelection(selRows);

  async function setStatus(r: ServiceEngagement, status: "READY" | "DRAFT" | "CANCELED") {
    try { await save.mutateAsync({ id: r.id, expectedUpdatedAt: r.updated_at, status }); }
    catch (e) { toast({ title: "Não foi alterado", description: e instanceof ServiceConflictError ? "Registro alterado por outra pessoa; recarregado." : (e as Error).message, variant: "destructive" }); }
  }
  async function doBill() {
    if (busy.current || selError) return;
    busy.current = true;
    const ids = [...selected];
    const key = keyStore.keyFor(scope, ids);
    try {
      const res = await bill.mutateAsync({ ids, key });
      keyStore.settle(scope, ids); setSelected([]);
      toast({ title: res.replayed ? "Faturamento já registrado" : "Rascunho de NFS-e criado", description: "Nenhum valor a receber é criado antes da autorização da nota." });
    } catch (e) {
      const err = e as Error & { definitive?: boolean };
      if (err.definitive) keyStore.settle(scope, ids);
      toast({ title: "Faturamento não concluído", description: err.definitive ? err.message : "Resposta incerta; tente de novo — a mesma chave impede duplicidade.", variant: "destructive" });
    } finally { busy.current = false; }
  }
  const NFSE_RESULT_LABEL: Record<string, string> = {
    transmission_disabled: "Envio NFS-e desligado neste ambiente", production_blocked: "Emissão em produção bloqueada",
    rejected: "NFS-e rejeitada pelo Sistema Nacional", reconciliation_required: "Envio pendente de confirmação",
    authorization_unverified: "Resposta não confirmada — em conferência", ledger_not_installed: "Registro de envios ainda não instalado",
    dps_incomplete: "Dados fiscais incompletos para a DPS", signing_failed: "Falha na assinatura com o certificado da empresa",
    replayed: "Envio já registrado", invoice_not_draft: "A nota não está em rascunho",
  };
  async function emit(invoiceId: string) {
    try {
      const r = await requestNfseEmission(invoiceId);
      if (r.code === "integration_not_configured") toast({ title: "Integração NFS-e não configurada", description: (r.missing ?? []).map(m => READINESS_MISSING_LABEL[m] ?? m).join(", ") || "Configure o provedor da empresa." });
      else if (r.code === "authorized" || (r.code === "replayed" && (r as { authorized?: boolean }).authorized)) toast({ title: "NFS-e autorizada", description: "Autorização conferida no XML devolvido pelo Sistema Nacional." });
      else toast({ title: NFSE_RESULT_LABEL[r.code] ?? "Envio não realizado", description: r.message ?? (r.missing?.length ? r.missing.join(", ") : r.code), variant: r.code === "rejected" ? "destructive" : undefined });
    } catch { toast({ title: "Falha ao solicitar envio", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">Serviços prestados</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} disabled={services.filter(s => s.is_active).length === 0}><Plus className="mr-1 h-4 w-4" />Registrar</Button>
          {canBill && <Button size="sm" onClick={doBill} disabled={!!selError || bill.isPending}>{bill.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Faturar selecionados</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {canBill && readiness.data && !readiness.data.ready && (
          <Alert><AlertTitle>Emissão de NFS-e pendente de configuração</AlertTitle>
            <AlertDescription>O faturamento gera rascunho; o envio só ocorre com o provedor da empresa configurado. Falta: {readiness.data.missing.map(m => READINESS_MISSING_LABEL[m] ?? m).join(", ")}.</AlertDescription></Alert>)}
        {selected.length > 0 && selError === "mixed_customers" && <p className="text-sm text-destructive">Selecione serviços de um único cliente.</p>}
        {selected.length > 0 && selError === "not_ready" && <p className="text-sm text-destructive">Só registros "Pronto para faturar" podem ser faturados.</p>}
        {engagements.isLoading ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p>
          : engagements.isError ? <p className="text-destructive">Não foi possível carregar os registros.</p>
          : rows.length === 0 ? <p className="text-muted-foreground">Nenhum serviço prestado registrado.</p>
          : <Table><TableHeader><TableRow><TableHead /><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Serviço</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{rows.map(r => {
              const inv = r.fiscal_invoice_id ? invById.get(r.fiscal_invoice_id) : undefined;
              return (<TableRow key={r.id}>
                <TableCell>{r.status === "READY" && canBill && <Checkbox aria-label="Selecionar" checked={selected.includes(r.id)} onCheckedChange={c => setSelected(s => c ? [...s, r.id] : s.filter(x => x !== r.id))} />}</TableCell>
                <TableCell>{r.performed_on.split("-").reverse().join("/")}</TableCell>
                <TableCell>{custName.get(r.customer_id) ?? "—"}</TableCell><TableCell>{svcName.get(r.service_id) ?? "—"}</TableCell>
                <TableCell className="text-right">{Number(r.quantity)}</TableCell><TableCell className="text-right">{brl(Number(r.total_amount))}</TableCell>
                <TableCell><Badge variant="outline">{ENGAGEMENT_STATUS_LABEL[r.status]}</Badge>{r.fiscal_invoice_id && <div className="mt-1 text-xs text-muted-foreground">NFS-e: {NFSE_STATE_LABEL[nfseDisplayState(inv)]}</div>}</TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  {r.status === "DRAFT" && <Button size="sm" variant="ghost" onClick={() => setStatus(r, "READY")}>Pronto</Button>}
                  {r.status === "READY" && <Button size="sm" variant="ghost" onClick={() => setStatus(r, "DRAFT")}>Voltar</Button>}
                  {(r.status === "DRAFT" || r.status === "READY") && <Button size="sm" variant="ghost" onClick={() => setStatus(r, "CANCELED")}>Cancelar</Button>}
                  {r.fiscal_invoice_id && canBill && nfseDisplayState(inv) === "RASCUNHO" && <Button size="sm" variant="ghost" onClick={() => emit(r.fiscal_invoice_id!)}>Enviar NFS-e</Button>}
                </TableCell>
              </TableRow>);
            })}</TableBody></Table>}
      </CardContent>
      {creating && <EngagementDialog services={services.filter(s => s.is_active)} customers={customers.data ?? []} onClose={() => setCreating(false)} />}
    </Card>
  );
}

function EngagementDialog({ services, customers, onClose }: { services: CatalogService[]; customers: Array<{ id: string; nome: string }>; onClose: () => void }) {
  const save = useSaveEngagement();
  const [v, setV] = useState({ service_id: "", customer_id: "", performed_on: today(), quantity: 1, unit_price: 0, description: "" });
  async function submit() {
    if (!v.service_id || !v.customer_id) { toast({ title: "Informe serviço e cliente", variant: "destructive" }); return; }
    try { await save.mutateAsync({ id: null, expectedUpdatedAt: null, values: v }); toast({ title: "Serviço prestado registrado" }); onClose(); }
    catch (e) { toast({ title: "Não foi salvo", description: (e as Error).message, variant: "destructive" }); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar serviço prestado</DialogTitle></DialogHeader>
        <fieldset disabled={save.isPending} className="grid gap-3">
          <div className="grid gap-1"><Label>Serviço</Label><Select value={v.service_id} onValueChange={id => { const s = services.find(x => x.id === id); setV({ ...v, service_id: id, unit_price: s ? Number(s.unit_price) : v.unit_price }); }}><SelectTrigger aria-label="Serviço"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-1"><Label>Cliente</Label><Select value={v.customer_id} onValueChange={id => setV({ ...v, customer_id: id })}><SelectTrigger aria-label="Cliente"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1"><Label htmlFor="eng-date">Data</Label><Input id="eng-date" type="date" value={v.performed_on} onChange={e => setV({ ...v, performed_on: e.target.value })} /></div>
            <div className="grid gap-1"><Label htmlFor="eng-qty">Quantidade</Label><Input id="eng-qty" type="number" min={0} step="0.0001" value={v.quantity} onChange={e => setV({ ...v, quantity: Number(e.target.value) })} /></div>
            <div className="grid gap-1"><Label htmlFor="eng-price">Valor unitário</Label><Input id="eng-price" type="number" min={0} step="0.01" value={v.unit_price} onChange={e => setV({ ...v, unit_price: Number(e.target.value) })} /></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="eng-desc">Descrição (opcional)</Label><Textarea id="eng-desc" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></div>
          <p className="text-sm">Total: {brl(Math.round(v.quantity * v.unit_price * 100) / 100)}</p>
        </fieldset>
        <DialogFooter><Button onClick={submit} disabled={save.isPending}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
