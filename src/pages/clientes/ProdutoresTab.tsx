import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, MoreHorizontal, History, ExternalLink, Tag, MapPin, Phone, Filter, X, Archive, Trash2 } from "lucide-react";
import { ExcluirInativarDialog } from "@/components/cadastros/ExcluirInativarDialog";
import { checkClienteDeps } from "@/lib/cadastros";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormField, FormItem } from "@/components/ui/form";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clienteSchema, ClienteSchema } from "@/lib/schemas/cliente";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { ClienteFormTabs } from "@/components/clientes/ClienteFormTabs";
import { ClienteHistoricoDialog } from "@/components/clientes/ClienteHistoricoDialog";
import { canWrite } from "@/lib/permissions";

import { unmask, unmaskCpfCnpj, formatCpfCnpj, getTipoDocumento, validatePhoneBR, normalizePhoneBR } from "@/lib/masks";
import { normalizeInscricaoEstadualCadastro } from "@/lib/schemas/inscricaoEstadualCadastro";
import { useCommercialRegistrationScope } from "@/hooks/useCommercialRegistrationScope";
import { commercialRegistrationError } from "@/lib/commercialRegistrationErrors";
import { Link } from "react-router-dom";

export default function ProdutoresTab() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const scope = useCommercialRegistrationScope();
  const submitLock = useRef(false);
  const draftId = useRef(crypto.randomUUID());
  const readGeneration = useRef(0);
  const isAdmin = role === "administrador";
  const canManage = scope.ready && canWrite(role, "/clientes");
  const [clientRows, setClientes] = useState<{ scope: string; rows: any[] }>({ scope: "", rows: [] });
  const clientes = scope.ready && clientRows.scope === scope.scope ? clientRows.rows : [];
  const [accessState, setPortalAccess] = useState<{ scope: string; ids: Set<string> }>({ scope: "", ids: new Set() });
  const portalAccess = scope.ready && accessState.scope === scope.scope ? accessState.ids : new Set<string>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [portalFilter, setPortalFilter] = useState<"all" | "com" | "sem">("all");
  const [open, setOpen] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [delDialog, setDelDialog] = useState<{ id: string; nome: string; inativo: boolean } | null>(null);

  const defaultValues: ClienteSchema = {
    tipo_pessoa: "fisica",
    status_cliente: "ativo",
    tags: [],
    cobranca_mesmo_endereco: true,
    nome_fantasia: "",
    razao_social: "",
    nome: "",
    telefones_adicionais: []
  };

  const methods = useForm<ClienteSchema>({
    resolver: zodResolver(clienteSchema),
    defaultValues
  });

  // Converte um registro do banco em valores prontos para o formulário,
  // garantindo que nulls virem strings vazias e que campos derivados
  // (telefones_adicionais, condição de pagamento) sejam preenchidos.
  const clienteToFormValues = (cliente: any): any => {
    if (!cliente) return defaultValues;

    const telefonesAdicionais = (cliente.telefones || [])
      .slice(1)
      .map((t: string) => ({ value: t || "" }));

    const condicao = cliente.condicao_pagamento || "";
    const condicaoMatch = typeof condicao === 'string' ? condicao.match(/^(\d+)\s+(.+)$/) : null;
    const condicao_pagamento_valor = condicaoMatch ? condicaoMatch[1] : "";
    const condicao_pagamento_unidade = condicaoMatch ? condicaoMatch[2] : "dias";

    const sanitized: any = { ...cliente };
    delete sanitized.fazendas;
    Object.keys(sanitized).forEach((key) => {
      if (sanitized[key] === null || sanitized[key] === undefined) {
        if (key === "tags") sanitized[key] = [];
        else if (key === "cobranca_mesmo_endereco") sanitized[key] = true;
        else sanitized[key] = "";
      }
    });

    return {
      ...defaultValues,
      ...sanitized,
      telefones_adicionais: telefonesAdicionais,
      condicao_pagamento_valor,
      condicao_pagamento_unidade,
    };
  };

  const fetchClientes = async () => {
    if (!scope.ready) return;
    const fence = scope.capture();
    const generation = ++readGeneration.current;
    const current = () => fence() && readGeneration.current === generation;
    const { data, error } = await supabase
      .from("clientes")
      .select("*, fazendas(count)").filter("organization_id", "eq", scope.organizationId ?? "")
      .order("nome_fantasia");
    if (!current()) return;
    if (error) { toast.error(commercialRegistrationError(error)); return; }
    if (data) setClientes({ scope: scope.scope, rows: data });

    // Fetch portal access map: cliente_id -> tem produtor ativo
    try {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, cliente_id, ativo").eq("organization_id", scope.organizationId ?? "")
        .not("cliente_id", "is", null)
        .eq("ativo", true);
      const userIds = (profs ?? []).map(p => p.user_id);
      if (userIds.length > 0) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
          .eq("role", "cliente_produtor");
        const produtorSet = new Set((roles ?? []).map(r => r.user_id));
        const clientesComAcesso = new Set(
          (profs ?? []).filter(p => produtorSet.has(p.user_id)).map(p => p.cliente_id as string)
        );
        if (current()) setPortalAccess({ scope: scope.scope, ids: clientesComAcesso });
      } else {
        if (current()) setPortalAccess({ scope: scope.scope, ids: new Set() });
      }
    } catch (e) {
      if (current()) setPortalAccess({ scope: scope.scope, ids: new Set() });
    }
  };

  useEffect(() => {
    setOpen(false); setSelectedClienteId(null); setDelDialog(null); setHistoryOpen(false);
    methods.reset(defaultValues); draftId.current = crypto.randomUUID();
    void fetchClientes();
  }, [scope.scope]);

  const handleCreateOrUpdate = async (values: ClienteSchema) => {
    if (submitLock.current || !canManage) return;
    const current = scope.capture();
    // Validação e normalização dos telefones antes de qualquer persistência.
    const mainCheck = validatePhoneBR(values.telefone, { fieldLabel: "Telefone principal" });
    if (!mainCheck.ok) { toast.error(mainCheck.error); return; }
    const mainPhone = mainCheck.value ?? "";

    const additionalPhones: string[] = [];
    for (const [idx, t] of (values.telefones_adicionais ?? []).entries()) {
      const chk = validatePhoneBR(t?.value, { fieldLabel: `Telefone adicional ${idx + 1}` });
      if (!chk.ok) { toast.error(chk.error); return; }
      if (chk.value) additionalPhones.push(chk.value);
    }
    const telefonesArray = [mainPhone, ...additionalPhones].filter((t) => t.length > 0);

    const financeiroCheck = validatePhoneBR(values.contato_financeiro_telefone, { fieldLabel: "Telefone financeiro" });
    if (!financeiroCheck.ok) { toast.error(financeiroCheck.error); return; }

    const {
      telefones_adicionais,
      condicao_pagamento_valor,
      condicao_pagamento_unidade,
      nome: _ignoredNome,
      fazendas: _ignoredFazendas,
      ...cleanValues
    } = values as any;

    const payload: any = {
      ...cleanValues,
      nome: (values.nome_fantasia || values.razao_social || "Sem Nome").trim(),
      cpf_cnpj: unmaskCpfCnpj(values.cpf_cnpj) || null,
      telefone: mainPhone || null,
      telefones: telefonesArray,
      endereco_cep: unmask(values.endereco_cep) || null,
      cobranca_cep: unmask(values.cobranca_cep) || null,
      inscricao_estadual: normalizeInscricaoEstadualCadastro(values.inscricao_estadual),
      contato_financeiro_telefone: financeiroCheck.value,
    };

    // Strings vazias viram null para evitar erro em colunas numéricas/enums.
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") payload[key] = null;
    });

    // Campos numéricos opcionais: garantir null quando vazios.
    ["limite_credito", "endereco_latitude", "endereco_longitude"].forEach((k) => {
      if (payload[k] === "" || payload[k] === undefined || Number.isNaN(payload[k])) {
        payload[k] = null;
      }
    });

    submitLock.current = true;
    try {
    let savedRow: any = null;
    if (selectedClienteId) {
      const { data, error } = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", selectedClienteId)
        .select("*, fazendas(count)")
        .single();
      if (!current()) return;
      if (error) {
        if (error.code === "23505") toast.error("Já existe um cliente cadastrado com este CPF/CNPJ.");
        else toast.error(commercialRegistrationError(error));
        return;
      }
      savedRow = data;
      toast.success("Cliente atualizado!");
    } else {
      const { data, error } = await supabase
        .from("clientes")
        .insert([{ ...payload, id: draftId.current }])
        .select("*, fazendas(count)")
        .single();
      if (!current()) return;
      if (error) {
        if (error.code === "23505") toast.error("Já existe um cliente cadastrado com este CPF/CNPJ.");
        else toast.error(commercialRegistrationError(error));
        return;
      }
      savedRow = data;
      toast.success("Cliente cadastrado!");
    }

    // Fechar modal e limpar estado após salvar com sucesso.
    if (!current()) return;
    if (savedRow) {
      setOpen(false);
      setSelectedClienteId(null);
      methods.reset(defaultValues);
    }
    fetchClientes();
    } catch (error) { if (current()) toast.error(commercialRegistrationError(error)); }
    finally { submitLock.current = false; }
  };

  const handleEdit = (cliente: any) => {
    setSelectedClienteId(cliente.id);
    methods.reset(clienteToFormValues(cliente));
    setOpen(true);
  };

  const handleInativarCliente = async (id: string, novoStatus: "ativo" | "inativo") => {
    if (!canManage) throw new Error("cadastro_not_ready");
    const current = scope.capture();
    const { error } = await supabase.from("clientes").update({ status_cliente: novoStatus }).eq("id", id);
    if (!current()) throw new Error("commercial_context_changed");
    if (error) { toast.error(commercialRegistrationError(error)); throw new Error("cadastro_action_failed"); }
    toast.success(novoStatus === "inativo" ? "Cliente inativado" : "Cliente reativado");
    fetchClientes();
  };

  const handleExcluirCliente = async (id: string) => {
    if (!canManage) throw new Error("cadastro_not_ready");
    const current = scope.capture();
    // cliente_contatos, cliente_documentos, portal_notificacoes, portal_solicitacoes e audit_log 
    // já são configurados com ON DELETE CASCADE ou tratados no banco.
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (!current()) throw new Error("commercial_context_changed");
    if (error) { 
      toast.error(commercialRegistrationError(error));
      throw new Error("cadastro_action_failed"); 
    }
    toast.success("Cliente excluído definitivamente");
    fetchClientes();
  };

  const filtered = clientes.filter((c) => {
    const q = search.toLowerCase();
    const cleanQ = unmask(q);
    // Busca CPF/CNPJ com suporte a CNPJ alfanumérico (Fase 3.19):
    // compara tanto por dígitos quanto pela forma normalizada preservando letras.
    const cleanQDocs = unmaskCpfCnpj(search).toUpperCase();

    const codigoNorm = (c.codigo_cliente || "").replace(/^0+/, "");
    const qNorm = cleanQ.replace(/^0+/, "");
    const docNorm = unmaskCpfCnpj(c.cpf_cnpj || "").toUpperCase();
    const matchesSearch = (
      (c.nome_fantasia || "").toLowerCase().includes(q) ||
      (c.razao_social || "").toLowerCase().includes(q) ||
      (c.cpf_cnpj || "").includes(cleanQ) ||
      (cleanQDocs.length > 0 && docNorm.includes(cleanQDocs)) ||
      (c.codigo_cliente || "").includes(cleanQ) ||
      (qNorm.length > 0 && codigoNorm.includes(qNorm))
    );


    const matchesStatus = statusFilter === "all" || c.status_cliente === statusFilter;
    const matchesTag = tagFilter === "all" || (c.tags || []).includes(tagFilter);
    const hasPortal = portalAccess.has(c.id);
    const matchesPortal =
      portalFilter === "all" ||
      (portalFilter === "com" && hasPortal) ||
      (portalFilter === "sem" && !hasPortal);

    return matchesSearch && matchesStatus && matchesTag && matchesPortal;
  });

  const allTags = Array.from(new Set(clientes.flatMap(c => c.tags || []))).sort();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage ? <Dialog open={open} onOpenChange={(v) => { setOpen(v); if(!v) { setSelectedClienteId(null); methods.reset(defaultValues); } }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" onClick={() => { draftId.current = crypto.randomUUID(); setSelectedClienteId(null); methods.reset(defaultValues); }}><Plus className="h-4 w-4 mr-2" />Novo Produtor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedClienteId ? "Editar Produtor" : "Novo Produtor"}</DialogTitle></DialogHeader>
            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(handleCreateOrUpdate, (errors) => {
                const fieldLabels: Record<string, string> = {
                  nome_fantasia: "Nome Fantasia",
                  razao_social: "Razão Social",
                  nome: "Nome",
                  cpf_cnpj: "CPF/CNPJ",
                  email: "E-mail",
                  telefone: "Telefone",
                  site: "Site",
                  limite_credito: "Limite de Crédito",
                  contato_financeiro_email: "E-mail do Financeiro",
                  tipo_pessoa: "Tipo de Pessoa",
                  status_cliente: "Status do Cliente",
                };
                const entries = Object.entries(errors);
                if (entries.length === 0) {
                  toast.error("Verifique os campos do formulário antes de salvar.");
                  return;
                }
                const [field, err] = entries[0];
                const label = fieldLabels[field] || field.replace(/_/g, " ");
                const rawMsg = (err as any)?.message;
                const friendlyMsg = typeof rawMsg === "string" && rawMsg && !rawMsg.toLowerCase().includes("expected")
                  ? rawMsg
                  : "preenchimento inválido";
                const extra = entries.length > 1 ? ` (e mais ${entries.length - 1} campo${entries.length > 2 ? "s" : ""})` : "";
                toast.error(`${label}: ${friendlyMsg}${extra}`);
              })} className="space-y-6">
                <ClienteFormTabs clienteId={selectedClienteId || undefined} />
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={methods.formState.isSubmitting}>{selectedClienteId ? "Atualizar" : "Salvar Produtor"}</Button>
                </div>
              </form>
            </FormProvider>
          </DialogContent>
        </Dialog> : null}
      </div>


      <Card>
        <CardHeader className="pb-3 border-b mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por código, nome, razão social ou CPF/CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <Badge 
                  variant={statusFilter === "all" && tagFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => { setStatusFilter("all"); setTagFilter("all"); }}
                >
                  Todos
                </Badge>
                {statusFilter !== "all" && <Badge variant="secondary" className="whitespace-nowrap capitalize">{statusFilter.replace('_', ' ')} <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} /></Badge>}
                {tagFilter !== "all" && <Badge variant="secondary" className="whitespace-nowrap">Tag: {tagFilter} <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTagFilter("all")} /></Badge>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Status do Cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="bloqueado_financeiro">Bloqueado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Filtrar por Tag" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={portalFilter} onValueChange={(v) => setPortalFilter(v as any)}>
                <SelectTrigger className="w-full h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Acesso ao Portal" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Portal: todos</SelectItem>
                  <SelectItem value="com">Com acesso ao portal</SelectItem>
                  <SelectItem value="sem">Sem acesso ao portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-4" : "p-0 sm:p-6 sm:pt-0"}>
          <ResponsiveTable
            mobileCards={
              filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</div>
              ) : (
                filtered.map((c) => (
                  <MobileCard
                    onClick={canManage ? () => handleEdit(c) : undefined}
                    ariaLabel={canManage ? `Editar ${c.nome_fantasia || c.nome}` : `Ver ${c.nome_fantasia || c.nome}`}
                    key={c.id}
                    title={`${c.codigo_cliente ? c.codigo_cliente + " · " : ""}${c.nome_fantasia || c.nome}`}
                    subtitle={c.razao_social}
                    status={
                      <Badge variant={c.status_cliente === 'ativo' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                        {c.status_cliente?.replace('_', ' ')}
                      </Badge>
                    }
                    content={[
                      { label: "Identificação", value: (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {getTipoDocumento(c.cpf_cnpj, c.tipo_pessoa) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
                              {getTipoDocumento(c.cpf_cnpj, c.tipo_pessoa)}
                            </Badge>
                          )}
                          <span className="font-mono-data">{formatCpfCnpj(c.cpf_cnpj) || "—"}</span>
                        </span>
                      ) },
                      { label: "Município", value: c.endereco_municipio ? `${c.endereco_municipio}/${c.endereco_estado}` : "—" },
                      { label: "Fazendas", value: (
                        <Link to={`/fazendas?cliente=${c.id}`} className="text-primary hover:underline" onClick={stopRowClick}>
                          {c.fazendas?.[0]?.count || 0} propriedades
                        </Link>
                      )},
                    ]}
                    actions={
                      <div className="flex w-full gap-2" onClick={stopRowClick}>
                        {canManage ? <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(c)}>Editar</Button> : null}
                        {canManage ? <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/fazendas?cliente=${c.id}`}>Ver Fazendas</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setSelectedClienteId(c.id); setHistoryOpen(true); }}>
                              <History className="h-4 w-4 mr-2" /> Histórico
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDelDialog({ id: c.id, nome: c.nome_fantasia || c.nome, inativo: c.status_cliente === "inativo" })}>
                              {c.status_cliente === "inativo" ? <><Archive className="h-4 w-4 mr-2" /> Reativar / Excluir</> : <><Trash2 className="h-4 w-4 mr-2" /> Inativar / Excluir</>}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu> : null}
                      </div>
                    }
                  />
                ))
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 whitespace-nowrap">Código</TableHead>
                  <TableHead>Cliente / Produtor</TableHead>
                  <TableHead className="whitespace-nowrap">Identificação</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Fazendas</TableHead>
                  <TableHead className="whitespace-nowrap">Portal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id} {...(canManage ? rowClickProps(() => handleEdit(c)) : {})}>
                      <TableCell className="font-mono-data text-xs font-semibold">{c.codigo_cliente || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{c.nome_fantasia || c.nome}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.razao_social}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getTipoDocumento(c.cpf_cnpj, c.tipo_pessoa) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
                              {getTipoDocumento(c.cpf_cnpj, c.tipo_pessoa)}
                            </Badge>
                          )}
                          <span className="font-mono-data text-xs">{formatCpfCnpj(c.cpf_cnpj) || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.endereco_municipio ? `${c.endereco_municipio}/${c.endereco_estado}` : "—"}
                      </TableCell>
                      <TableCell onClick={stopRowClick}>
                        <Button variant="link" asChild className="h-auto p-0 text-primary">
                          <Link to={`/fazendas?cliente=${c.id}`}>
                            {c.fazendas?.[0]?.count || 0} propriedades
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell>
                        {portalAccess.has(c.id) ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Sem acesso</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status_cliente === 'ativo' ? 'default' : 'secondary'} className="capitalize">
                          {c.status_cliente?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={stopRowClick}>
                        {canManage ? <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleEdit(c)}>Editar Cadastro</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/fazendas?cliente=${c.id}`}>Ver Fazendas</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setSelectedClienteId(c.id); setHistoryOpen(true); }}>
                              <History className="h-4 w-4 mr-2" /> Histórico
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDelDialog({ id: c.id, nome: c.nome_fantasia || c.nome, inativo: c.status_cliente === "inativo" })}>
                              {c.status_cliente === "inativo" ? <><Archive className="h-4 w-4 mr-2" /> Reativar / Excluir</> : <><Trash2 className="h-4 w-4 mr-2" /> Inativar / Excluir</>}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu> : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      {selectedClienteId && (
        <>
          <ClienteHistoricoDialog 
            clienteId={selectedClienteId} 
            open={historyOpen} 
            onOpenChange={setHistoryOpen} 
          />
        </>
      )}

      {canManage && delDialog && (
        <ExcluirInativarDialog
          open={!!delDialog}
          onOpenChange={(v) => !v && setDelDialog(null)}
          nome={delDialog.nome}
          entidade="cliente"
          entidadeId={delDialog.id}
          isAdmin={isAdmin}
          jaInativo={delDialog.inativo}
          loadDeps={() => checkClienteDeps(delDialog.id)}
          onInativar={() => handleInativarCliente(delDialog.id, "inativo")}
          onReativar={() => handleInativarCliente(delDialog.id, "ativo")}
          onExcluir={() => handleExcluirCliente(delDialog.id)}
        />
      )}
    </div>
  );
}
