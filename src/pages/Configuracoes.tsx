import { useState, useEffect, useRef, useMemo } from "react";
import {
  validarNovoUsuario,
  primeiroCampoInvalido,
  mapearErroCriacaoUsuario,
  lerCorpoErroFuncao,
  criacaoBemSucedida,
  ERRO_GENERICO_CRIACAO,
  REGRA_SENHA,
  senhaValida,
  validarEdicaoUsuario,
  primeiroCampoInvalidoEdicao,
  bloqueioAutoDesativacao,
  bloqueioAutoRemocaoAdmin,
  type ErrosEdicaoUsuario,



  SENHA_MIN,
  SENHA_MAX,
  USUARIOS_POR_PAGINA,
  type ErrosNovoUsuario,
  type CampoNovoUsuario,
} from "@/lib/configuracoes/usuariosValidation";
import {
  RPC_EDITAR_USUARIO,
  construirArgsEdicao,
  edicaoBemSucedida,
  validarLimiteClienteIds,
  classificarErroRpcEdicao,
  erroLocalEdicao,
  erroAmbiguoEdicao,
  executarComDeadlineEdicao,
  ErroStatusLocal,
  mapearErroStatusUsuario,
} from "@/lib/configuracoes/edicaoUsuarioRpc";


import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PARTNER_REGISTRATION_UNAVAILABLE } from "@/hooks/usePartnerUsers";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { tipoAcessoDoUsuario, ROTULO_TIPO_ACESSO, estadoVinculo, edicaoBloqueadaPorTipo, MSG_EDICAO_EXTERNA_INDISPONIVEL, ajudaSemElegiveis, type EstadoVinculo } from "@/lib/configuracoes/userLinks";
import { carregarVinculosUsuarios } from "@/lib/configuracoes/userLinksQuery";
import { ExternalCommonUserEditBoundary } from "@/components/configuracoes/ExternalCommonUserEditForm";
import { EXTERNAL_USER_EDIT_PHASE2_REVIEWED } from "@/lib/configuracoes/externalUserEditGate";
type LinhaUsuario = { user_id: string; roles?: string[] | null };
import { EXTERNAL_USER_ACTIVATION_REVIEWED, validateUserDraft, externalUserPayload, type UserRegistrationKind } from "@/lib/configuracoes/externalUserDraft";
import { useDebounce } from "@/hooks/useDebounce";
import { MaskedInput } from "@/components/ui/masked-input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatTelefone, formatCpfCnpj, unmask, unmaskCpfCnpj, validatePhoneBR } from "@/lib/masks";
import { Settings, Users, UserCog, Save, Plus, Pencil, Search, Palette, ListTree, ExternalLink, Mail, Phone, Shield, Eye, EyeOff, KeyRound, Timer, Download } from "lucide-react";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { SlaB2BTab } from "@/pages/configuracoes/SlaB2BTab";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROLE_LABELS, ROLE_VARIANTS, ACTIVE_ROLES } from "@/lib/permissions";
import AparenciaTab from "@/components/configuracoes/AparenciaTab";
import { Link } from "react-router-dom";
import { History, Wallet } from "lucide-react";
import { broadcastPortalEvent } from "@/lib/portalBroadcast";
import { changeAdminPassword, adminPasswordErrorMessage } from "@/lib/configuracoes/adminPassword";

import ConfiguracoesFinanceiras from "@/pages/financeiro/ConfiguracoesFinanceiras";
import { CreditCard } from "lucide-react";
import { MeuPlanoTab } from "@/pages/configuracoes/MeuPlanoTab";
import TenantEmailSettings from "@/pages/configuracoes/TenantEmailSettings";
import { canRunTenantSmtpProof } from "@/lib/configuracoes/tenantSmtp";
import { useOnboardingState } from "@/hooks/useOrgOnboarding";
import { FUSOS_BRASIL, REGIMES_TRIBUTARIOS } from "@/lib/saas/orgOnboarding";



export default function Configuracoes() {
  const isMobile = useIsMobile();
  const { profile, role, roles, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isAdmin = role === "administrador";
  const isPlatformSuperadmin = (roles ?? []).includes("superadmin");
  const tenantEmailScope = useStorageAccessScope("tenant-email-settings");
  const canTenantEmail = tenantEmailScope.ready && (roles ?? []).includes("administrador") && !isPlatformSuperadmin;
  // Aba "Meu Plano": administradores da empresa (qualquer papel da lista) e o
  // superadmin de plataforma QUANDO vinculado a uma organização. A checagem de
  // vínculo é fail-closed no servidor (RPC/RLS) — aqui é apenas visibilidade.
  const canMeuPlano =
    (roles ?? []).includes("administrador") || (roles ?? []).includes("superadmin");
  const canFin = isAdmin || role === "gestor" || role === "financeiro";
  const organizationProfile = useOnboardingState(isAdmin && !!profile?.organization_id);
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam === "usuarios" && isAdmin
      ? "usuarios"
      : tabParam === "financeiro" && canFin
        ? "financeiro"
        : tabParam === "meu-plano" && canMeuPlano
          ? "meu-plano"
          : tabParam === "aparencia" && isPlatformSuperadmin
            ? "aparencia"
            : tabParam && ["perfil", "empresa", "catalogos", "sla-b2b"].includes(tabParam)
            ? tabParam
            : "perfil";


  // Profile edit state
  const [nome, setNome] = useState(profile?.nome || "");
  const [phone, setPhone] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");

  useEffect(() => { 
    if (profile?.nome) setNome(profile.nome); 
    if ((profile as any)?.telefone) setPhone((profile as any).telefone);
    if ((profile as any)?.cpf_cnpj) setCpfCnpj((profile as any).cpf_cnpj);
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const chk = validatePhoneBR(phone, { fieldLabel: "Telefone" });
      if (!chk.ok) throw new Error(chk.error);
      const { error } = await supabase.from("profiles").update({ nome, telefone: chk.value, cpf_cnpj: unmaskCpfCnpj(cpfCnpj) }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Perfil atualizado com sucesso" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  // Admin da empresa: listagem paginada e filtrada no servidor pelo tenant da sessão.
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [pagina, setPagina] = useState(1);

  const {
    data: allUsers = { items: [] as any[], total: 0 },
    isLoading: usersLoading,
    isError: usersError,
    isFetching: usersFetching,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["admin-users", profile?.organization_id, user?.id, debouncedSearchTerm, filterRole, filterStatus, pagina],
    enabled: isAdmin,
    queryFn: async () => {
      // O contrato server-side retorna user_id e updated_at para edição otimista.
      const { data, error } = await (supabase as any).rpc("tenant_admin_list_users", {
        p_search: debouncedSearchTerm.trim() || null,
        p_role: filterRole === "all" ? null : filterRole,
        p_active: filterStatus === "all" ? null : filterStatus === "ativo",
        p_offset: (pagina - 1) * USUARIOS_POR_PAGINA,
        p_limit: USUARIOS_POR_PAGINA,
      });
      if (error) throw error;
      return { items: data?.items ?? [], total: Number(data?.total ?? 0) };
    },
  });

  const usersPage = useMemo(() => allUsers.items ?? [], [allUsers.items]);
  // Vínculo canônico atual: UMA leitura por página (sem N+1), tenant derivado no servidor.
  const pageUserIds = useMemo(() => (usersPage as LinhaUsuario[]).map((u) => u.user_id).filter((id): id is string => typeof id === "string" && id.length > 0), [usersPage]);
  const vinculos = useQuery({
    queryKey: ["admin-user-links", profile?.organization_id, user?.id, pageUserIds],
    enabled: isAdmin && pageUserIds.length > 0,
    retry: false,
    queryFn: ({ signal }) => carregarVinculosUsuarios(pageUserIds, signal),
  });
  const vinculoDe = (u: LinhaUsuario): EstadoVinculo => estadoVinculo(tipoAcessoDoUsuario(u.roles), vinculos, u.user_id);
  const renderVinculo = (u: LinhaUsuario, detalhado = false) => {
    const e = vinculoDe(u);
    if (e.estado === "carregando") return <span className="text-xs text-muted-foreground">Carregando vínculo…</span>;
    if (e.estado === "erro") return <span role="alert" className="text-xs text-destructive">Vínculo indisponível no momento</span>;
    if (e.estado === "nao_aplica") return <span className="text-xs text-muted-foreground">Não se aplica</span>;
    const fora = e.fora_do_alcance > 0 ? <span className="block text-xs text-muted-foreground">{e.fora_do_alcance} vínculo(s) fora do alcance da sua empresa</span> : null;
    if (e.estado === "sem_vinculo") return <span className="text-xs text-muted-foreground">Sem vínculo{fora}</span>;
    if (!detalhado) return <span className="text-sm">{e.resumo}{fora}</span>;
    return <ul className="text-sm space-y-1">{e.detalhes.map((d, i) => <li key={i}>{d}</li>)}{fora && <li>{fora}</li>}</ul>;
  };

  const TENANT_MANAGEABLE_ROLES = ACTIVE_ROLES.filter((candidate) =>
    !["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"].includes(candidate),
  );
  function toggleRole(roles: string[], r: string, on: boolean): string[] {
    let next = new Set(roles);
    if (on) {
      next.add(r);
    } else {
      next.delete(r);
    }
    return Array.from(next);
  }


  const filteredUsers = useMemo(() => {
    return usersPage;
  }, [usersPage]);

  // Paginação client-side sobre o conjunto JÁ filtrado (nada é truncado silenciosamente)
  useEffect(() => { setPagina(1); }, [filterRole, filterStatus, debouncedSearchTerm]);
  const paginacao = useMemo(() => ({
    total: allUsers.total ?? 0,
    totalPaginas: Math.max(1, Math.ceil((allUsers.total ?? 0) / USUARIOS_POR_PAGINA)),
    paginaAtual: pagina,
    itens: filteredUsers,
    inicio: (allUsers.total ?? 0) === 0 ? 0 : (pagina - 1) * USUARIOS_POR_PAGINA + 1,
    fim: Math.min(pagina * USUARIOS_POR_PAGINA, allUsers.total ?? 0),
  }), [allUsers.total, filteredUsers, pagina]);
  const usuariosPagina = paginacao.itens;

  // Toggle ativo — proteção de UX: ninguém desativa a própria conta
  const toggleAtivo = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      const bloqueio = bloqueioAutoDesativacao(userId === user?.id, ativo);
      if (bloqueio) throw new ErroStatusLocal(bloqueio);
      const { data, error } = await (supabase as any).rpc("tenant_admin_set_user_active", {
        p_user_id: userId,
        p_active: ativo,
      });
      if (error) throw error;
      if (data?.success !== true || data?.user_id !== userId) throw new ErroStatusLocal("Não foi possível confirmar a atualização do status.");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Status do usuário atualizado" });
    },
    onError: (e: unknown) => {
      toast({ title: "Erro", description: mapearErroStatusUsuario(e), variant: "destructive" });
    },
  });

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const initialNewUser = useMemo(() => ({
    nome: "", email: "", password: "",
    roles: ["administrativo"] as string[],
    partner_id: "" as string,
    telefone: "", cargo: "", cpf_cnpj: "", crea: "", especialidade: "",
  }), []);
  const [newUser, setNewUser] = useState(initialNewUser);
  const [registrationKind, setRegistrationKind] = useState<UserRegistrationKind>("internal");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [primaryClient, setPrimaryClient] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const createFence = useStorageAccessScope("tenant-user-registration");
  const [linkSearch, setLinkSearch] = useState("");
  const linkTerm = useDebounce(linkSearch, 300);
  const [linkPage, setLinkPage] = useState(0);
  const changeKind = (kind: UserRegistrationKind) => {
    setRegistrationKind(kind); setNewUser({ ...initialNewUser, nome: newUser.nome, email: newUser.email, roles: kind === "internal" ? ["administrativo"] : [kind === "b2b" ? "parceiro_b2b" : "cliente_produtor"] });
    setSelectedClients([]); setPrimaryClient(null); setLinkSearch(""); setLinkPage(0); requestKey.current = crypto.randomUUID();
  };
  useEffect(() => { setLinkPage(0); }, [linkTerm, registrationKind]);
  useEffect(() => {
    setCreateOpen(false); setSelectedClients([]); setPrimaryClient(null); setNewUser(initialNewUser); setCreateResumo(null); setCreateErros({});
    requestKey.current = crypto.randomUUID();
  }, [createFence.scope, initialNewUser]);
  const links = useQuery({
    queryKey: ["external-user-link-options", createFence.scope, registrationKind, linkTerm, linkPage],
    enabled: createOpen && createFence.ready && isAdmin && registrationKind !== "internal",
    retry: false,
    queryFn: async ({ signal }) => {
      const current = createFence.capture();
      const query = registrationKind === "b2b"
        ? supabase.from("partner_accounts").select("id, razao_social", { count: "exact" }).filter("commercial_owner_organization_id", "eq", profile?.organization_id ?? "").eq("ativo", true).is("deleted_at", null).ilike("razao_social", `%${linkTerm.replace(/[%_]/g, "")}%`).order("razao_social")
        : supabase.from("clientes").select("id, nome", { count: "exact" }).filter("organization_id", "eq", profile?.organization_id ?? "").eq("status_cliente", "ativo").ilike("nome", `%${linkTerm.replace(/[%_]/g, "")}%`).order("nome");
      const { data, error, count } = await query.range(linkPage * 20, linkPage * 20 + 19).abortSignal(signal);
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw new Error("Não foi possível consultar os vínculos.");
      return { items: (data ?? []).map(row => ({ id: row.id, label: "nome" in row ? row.nome : row.razao_social })), total: count ?? 0 };
    },
  });
  useEffect(() => { void queryClient.cancelQueries({ queryKey: ["external-user-link-options"] }); queryClient.removeQueries({ queryKey: ["external-user-link-options"], predicate: query => query.queryKey[1] !== createFence.scope }); }, [createFence.scope, queryClient]);

  const [createErros, setCreateErros] = useState<ErrosNovoUsuario>({});
  const [createResumo, setCreateResumo] = useState<string | null>(null);
  const campoRefs = useRef<Record<string, HTMLElement | null>>({});
  const createSubmitLock = useRef(false);
  const registrarCampo = (campo: CampoNovoUsuario) => (el: HTMLElement | null) => { campoRefs.current[campo] = el; };
  const erroProps = (campo: CampoNovoUsuario) =>
    createErros[campo]
      ? ({ "aria-invalid": true, "aria-describedby": `erro-${campo}` } as const)
      : ({} as const);

  const createUser = useMutation({
    mutationFn: async ({ current }: { current: () => boolean }) => {
      if (!current() || !isAdmin) throw new Error("Sessão indisponível para cadastro.");
      if (registrationKind !== "internal" && !EXTERNAL_USER_ACTIVATION_REVIEWED) throw new Error("Cadastro externo aguardando revisão para liberação.");
      const payload: any = registrationKind !== "internal" ? externalUserPayload({ ...newUser, cliente_ids: selectedClients, principal_cliente_id: primaryClient }, registrationKind, requestKey.current) : {
        ...newUser,
        nome: newUser.nome.trim(),
        email: newUser.email.trim(),
        // compat com fluxo legado que espera `role` string
        role: newUser.roles[0],
        roles: newUser.roles,
        partner_id: null,
        partner_papel: null,
        telefone: (() => { const c = validatePhoneBR(newUser.telefone, { fieldLabel: "Telefone" }); if (!c.ok) throw new Error(c.error); return c.value; })(),
        cpf_cnpj: unmaskCpfCnpj(newUser.cpf_cnpj),
        cliente_ids: [],
        principal_cliente_id: null,
      };
      const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
      if (error) {
        const corpo = await lerCorpoErroFuncao(error);
        throw new Error(mapearErroCriacaoUsuario(error, corpo));
      }
      if (!criacaoBemSucedida(data)) {
        throw new Error(mapearErroCriacaoUsuario(null, data) || ERRO_GENERICO_CRIACAO);
      }
      return data;
    },
    onSuccess: (_data, { current }) => {
      if (!current()) return;
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });
      toast({ title: "Usuário criado com sucesso" });
      setCreateOpen(false);
      setNewUser(initialNewUser);
      setCreateErros({});
      setCreateResumo(null);
    },
    onError: (e: Error, { current }) => {
      if (!current()) return;
      // Não limpamos o formulário: o administrador corrige e reenvia.
      setCreateResumo(e.message || ERRO_GENERICO_CRIACAO);
      toast({ title: "Erro ao criar usuário", description: e.message, variant: "destructive" });
    },
  });

  async function handleCriarUsuario() {
    if (createSubmitLock.current || createUser.isPending) return;
    // Synchronous, per-form exclusion before any await or React render.
    createSubmitLock.current = true;
    try {
      const erros = validateUserDraft({
        nome: newUser.nome,
        email: newUser.email,
        password: newUser.password,
        roles: newUser.roles,
        partner_id: newUser.partner_id,
        cliente_ids: selectedClients, principal_cliente_id: primaryClient,
      }, registrationKind);
      setCreateErros(erros);
      const primeiro = primeiroCampoInvalido(erros);
      if (primeiro) {
        setCreateResumo("Corrija os campos destacados antes de continuar.");
        requestAnimationFrame(() => campoRefs.current[primeiro]?.focus?.());
        return;
      }
      setCreateResumo(null);
      await createUser.mutateAsync({ current: createFence.capture() });
    } catch {
      // The existing mutation onError owns the safe message; no retry here.
    } finally {
      createSubmitLock.current = false;
    }
  }

  // Edit user dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const editOrig: LinhaUsuario | null = editUser
    ? ((usersPage as LinhaUsuario[]).find((u) => u.user_id === editUser.user_id) ?? (editUser as LinhaUsuario))
    : null;
  const editTipo = tipoAcessoDoUsuario(editOrig?.roles);
  const editSomenteLeitura = edicaoBloqueadaPorTipo(editTipo);
  const externalCommonCandidate = EXTERNAL_USER_EDIT_PHASE2_REVIEWED && (editTipo === 'producer' || editTipo === 'b2b');
  const externalScope = JSON.stringify([tenantEmailScope.scope, editOpen, editUser?.user_id]);
  const externalDialog = useRef({ scope: externalScope, generation: 0, open: editOpen });
  if (externalDialog.current.scope !== externalScope) {
    externalDialog.current = { scope: externalScope, generation: externalDialog.current.generation + 1, open: editOpen };
  }
  const externalGeneration = externalDialog.current.generation;
  const externalCurrent = () => externalDialog.current.open && externalDialog.current.scope === externalScope && externalDialog.current.generation === externalGeneration;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!editOpen) {
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setEditUser(null);
      setEditErros({});
      setEditResumo(null);
      setExigeRecargaEdicao(false);

    }
  }, [editOpen]);

  // Inicializa vínculos apenas quando abre o diálogo ou muda o usuário sendo editado
  // Usamos editUser?.user_id para evitar resetar o estado quando outros campos (nome, email) mudam
  useEffect(() => {
    if (editOpen && editUser?.user_id) {
    }
  }, [editOpen, editUser?.user_id]);

  // Deep-link: ?tab=usuarios&user_id=... — o parâmetro é CONSUMIDO ao abrir,
  // para que fechar o diálogo não o reabra.
  const deepLinkConsumido = useRef<string | null>(null);
  useEffect(() => {
    const uid = searchParams.get("user_id");
    if (!uid || !isAdmin) return;
    if (deepLinkConsumido.current === uid) return;
    if (usersPage.length === 0) return;
    deepLinkConsumido.current = uid;
    const found = usersPage.find((u: any) => u.user_id === uid);
    if (found) { setEditUser(found); setEditOpen(true); }
    const sp = new URLSearchParams(searchParams);
    sp.delete("user_id");
    setSearchParams(sp, { replace: true });
  }, [searchParams, usersPage, isAdmin, setSearchParams]);


  // Estado da edição: erros por campo, resumo e trava de recarga pós conflito/incerteza
  const [editErros, setEditErros] = useState<ErrosEdicaoUsuario>({});
  const [editResumo, setEditResumo] = useState<string | null>(null);
  const [exigeRecargaEdicao, setExigeRecargaEdicao] = useState(false);

  const saveEditUser = useMutation({
    // Sem retry automático: a RPC é transacional e o conflito exige nova versão original.
    retry: false,
    mutationFn: async () => {
      // Sem usuário em edição não existe operação possível — nunca cair em onSuccess.
      if (!editUser) throw erroLocalEdicao("Nenhum usuário em edição. Reabra o cadastro.");
      // Segundo envio antes de recarregar é bloqueado (estado da linha é incerto).
      if (exigeRecargaEdicao) throw erroAmbiguoEdicao();
      // Editor geral não altera externos; dados comuns usam exclusivamente o caminho F2 separado.
      if (editSomenteLeitura) throw erroLocalEdicao(MSG_EDICAO_EXTERNA_INDISPONIVEL);



      // ---- 1) VALIDAÇÃO COMPLETA ANTES DA ÚNICA ESCRITA (RPC transacional) ----
      const desiredRoles: string[] = editUser.roles ?? [];
      const erros = validarEdicaoUsuario(
        {
          nome: editUser.nome ?? "",
          telefone: editUser.telefone ?? "",
          roles: desiredRoles,
          partner_id: editUser.partner_id ?? "",
          cliente_ids: [],
        },
        (v) => validatePhoneBR(v as any, { fieldLabel: "Telefone" }),
      );
      setEditErros(erros);
      const primeiro = primeiroCampoInvalidoEdicao(erros);
      if (primeiro) throw erroLocalEdicao(erros[primeiro]!);

      // Limite de vínculos: rejeitado localmente, nunca truncado silenciosamente.
      const excesso = validarLimiteClienteIds([]);
      if (excesso) throw erroLocalEdicao(excesso);

      const originalUser = usersPage.find((u: any) => u.user_id === editUser.user_id);
      const originalRoles: string[] = originalUser?.roles ?? [];
      const isSelf = editUser.user_id === user?.id;
      const bloqueioAdmin = bloqueioAutoRemocaoAdmin(isSelf, originalRoles, desiredRoles);
      if (bloqueioAdmin) throw erroLocalEdicao(bloqueioAdmin);

      const telefoneValidado = validatePhoneBR(editUser.telefone, { fieldLabel: "Telefone" });
      if (!telefoneValidado.ok) throw erroLocalEdicao(telefoneValidado.error);

      // ---- 2) UMA ÚNICA CHAMADA: RPC transacional com versão original (updated_at) ----
      const args = construirArgsEdicao({
        userId: editUser.user_id,
        expectedUpdatedAt: editUser.updated_at,
        profile: {
          nome: editUser.nome,
          telefone: telefoneValidado.value,
          cargo: editUser.cargo,
          cpf_cnpj: unmaskCpfCnpj(editUser.cpf_cnpj),
          crea: editUser.crea,
          especialidade: editUser.especialidade,
        },
        roles: desiredRoles,
        clienteIds: [],
        principalClienteId: null,
        // partner_id somente quando há papel B2B; caso contrário null (servidor deriva o papel)
        partnerId: null,
      });

      // Prazo rígido (~20s) cobrindo toda a espera, inclusive sessão/pré-fetch.
      // Estouro → estado ambíguo: exige recarga, sem repetir e sem afirmar rollback.
      const data = await executarComDeadlineEdicao(async (signal) => {
        let req: any = (supabase as any).rpc(RPC_EDITAR_USUARIO, args);
        if (signal && typeof req?.abortSignal === "function") req = req.abortSignal(signal);
        try {
          const res = await req;
          // Erro da RPC: classificado UMA única vez, preservando o token original.
          if (res?.error) throw classificarErroRpcEdicao(res.error);
          return res?.data as unknown;
        } catch (e) {
          // Rede/abort/exceção de transporte: estado ambíguo, nunca mensagem crua.
          throw classificarErroRpcEdicao(e);
        }
      });

      // Sucesso estrito: success===true, user_id do alvo e updated_at válido.
      if (!edicaoBemSucedida(data, editUser.user_id)) throw erroAmbiguoEdicao();

      const rolesChanged =
        desiredRoles.length !== originalRoles.length ||
        desiredRoles.some((r) => !originalRoles.includes(r));
      return { rolesChanged, userId: editUser.user_id };
    },
    onSuccess: (result) => {
      setEditErros({});
      setEditResumo(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });
      // Cross-tab: se os papéis do usuário mudaram, avisa a sessão dele (se estiver logada em outra aba)
      // para recarregar roles/portais sem exigir novo login. Não autoriza acesso — RLS/RPC seguem soberanos.
      if (result?.rolesChanged && result?.userId) {
        broadcastPortalEvent({ type: "roles_updated", at: Date.now(), userId: result.userId });
      }
      toast({ title: "Usuário atualizado" });
      setEditOpen(false);
      const sp = new URLSearchParams(searchParams);
      sp.delete("user_id");
      setSearchParams(sp, { replace: true });
    },

    onError: (e: unknown) => {
      // O erro já chega classificado (ErroEdicaoUsuario). Nenhum remapeamento aqui:
      // validação local mantém a mensagem específica; conflito/ambíguo exigem recarga.
      const erro = classificarErroRpcEdicao(e);
      if (erro.exigeRecarga) setExigeRecargaEdicao(true);
      setEditResumo(erro.message);
      toast({ title: "Erro", description: erro.message, variant: "destructive" });
    },
  });



  const senhaForte = (s: string) => senhaValida(s);


  const updateUserPassword = useMutation({
    mutationFn: async () => {
      if (!editUser) throw new Error("Usuário não selecionado");
      await changeAdminPassword(editUser.user_id, newPassword, confirmPassword,
        (body) => supabase.functions.invoke("admin-update-user-password", { body }),
        lerCorpoErroFuncao);
    },
    onSuccess: () => {
      toast({ title: "Senha atualizada com sucesso", description: "A alteração não confirma o email nem conclui o primeiro acesso pelo titular." });
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: unknown) => {
      toast({ title: "Erro ao alterar senha", description: adminPasswordErrorMessage(e), variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerenciamento do sistema e usuários"
        action={
          <Button asChild variant="outline" className="gap-2">
            <a href="/docs/MANUAL-DO-USUARIO.pdf" download="MANUAL-DO-USUARIO.pdf">
              <Download className="h-4 w-4" />
              Baixar manual (PDF)
            </a>
          </Button>
        }
      />

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="w-full h-auto p-1 bg-muted/50 rounded-lg flex overflow-x-auto justify-start sm:justify-center gap-1 mb-4">
          <TabsTrigger value="perfil" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
            <Settings className="h-3 w-3 sm:h-4 sm:w-4" />Meu perfil pessoal
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="empresa" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Shield className="h-3 w-3 sm:h-4 sm:w-4" />Perfil da empresa
            </TabsTrigger>
          )}
          {isPlatformSuperadmin && (
            <TabsTrigger value="aparencia" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Palette className="h-3 w-3 sm:h-4 sm:w-4" />Visual da plataforma
            </TabsTrigger>
          )}
          {canMeuPlano && (
            <TabsTrigger value="meu-plano" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4" />Meu Plano
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="usuarios" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />Usuários
            </TabsTrigger>
          )}
          {(isAdmin || role === "gestor") && (
            <TabsTrigger value="catalogos" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <ListTree className="h-3 w-3 sm:h-4 sm:w-4" />Catálogos
            </TabsTrigger>
          )}
          {(isAdmin || role === "gestor" || role === "gestor_comercial" || role === "producao" || role === "administrativo") && (
            <TabsTrigger value="sla-b2b" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Timer className="h-3 w-3 sm:h-4 sm:w-4" />SLA B2B
            </TabsTrigger>
          )}
          {canFin && (
            <TabsTrigger value="financeiro" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />Financeiro
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sla-b2b">
          <SlaB2BTab podeEditar={isAdmin || role === "gestor"} />
        </TabsContent>

        {canFin && (
          <TabsContent value="financeiro">
            <ConfiguracoesFinanceiras />
          </TabsContent>
        )}

        {/* Meu Plano (Fase S4): somente leitura — administrador da empresa ou
            superadmin vinculado a uma organização (vínculo validado no servidor) */}
        {canMeuPlano && (
          <TabsContent value="meu-plano">
            <MeuPlanoTab />
          </TabsContent>
        )}

        {/* Profile Tab */}
        <TabsContent value="perfil">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" />Meu Perfil</CardTitle>
              <CardDescription>Atualize suas informações pessoais</CardDescription>
            </CardHeader>
            <CardContent className="form-spacing-mobile max-w-md">
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Nome</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" />
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Telefone</Label>
                <MaskedInput mask="telefone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>CPF/CNPJ</Label>
                <MaskedInput mask="cpf-cnpj" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Perfil de Acesso</Label>
                <div className="mt-1">
                  <Badge variant={ROLE_VARIANTS[role || ""] || "outline"} className="h-6">
                    {ROLE_LABELS[role || ""] || role || "—"}
                  </Badge>
                </div>
              </div>
              <div className="pt-2">
                <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="w-full sm:w-auto">
                  <Save className="h-4 w-4 mr-2" />Salvar Alterações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="empresa">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Perfil da empresa</CardTitle>
                <CardDescription>Dados institucionais registrados no cadastro da empresa.</CardDescription>
              </CardHeader>
              <CardContent>
                {organizationProfile.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando dados da empresa…</p>
                ) : organizationProfile.isError ? (
                  <p className="text-sm text-destructive">Não foi possível carregar os dados da empresa.</p>
                ) : (
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {[
                      ["Razão social", organizationProfile.data?.razao_social],
                      ["Nome fantasia", organizationProfile.data?.nome_fantasia],
                      ["CNPJ", organizationProfile.data?.cnpj],
                      ["E-mail corporativo", organizationProfile.data?.email_corporativo ?? organizationProfile.data?.dados?.email_contato],
                      ["Telefone", formatTelefone(organizationProfile.data?.dados?.telefone)],
                      ["Endereço", [organizationProfile.data?.dados?.logradouro, organizationProfile.data?.dados?.numero, organizationProfile.data?.dados?.bairro].filter(Boolean).join(", ")],
                      ["Cidade / UF", [organizationProfile.data?.dados?.cidade, organizationProfile.data?.dados?.uf].filter(Boolean).join(" / ")],
                      ["CEP", organizationProfile.data?.dados?.cep],
                      ["Fuso horário", FUSOS_BRASIL.find((item) => item.value === (organizationProfile.data?.fuso_horario ?? organizationProfile.data?.dados?.fuso_horario))?.label ?? organizationProfile.data?.fuso_horario ?? organizationProfile.data?.dados?.fuso_horario],
                      ["Idioma", organizationProfile.data?.dados?.idioma],
                      ["Regime tributário", REGIMES_TRIBUTARIOS.find((item) => item.value === organizationProfile.data?.dados?.regime_tributario)?.label ?? organizationProfile.data?.dados?.regime_tributario],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="text-sm font-medium">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
            {canTenantEmail && <TenantEmailSettings key={tenantEmailScope.scope} scope={tenantEmailScope.scope} proofEligible={canRunTenantSmtpProof({ready:tenantEmailScope.ready,userId:user?.id,organizationId:profile?.organization_id,roles:roles ?? []})} />}
          </TabsContent>
        )}

        {/* Aparência Tab */}
        {isPlatformSuperadmin && (
          <TabsContent value="aparencia">
            <AparenciaTab />
          </TabsContent>
        )}

        {(isAdmin || role === "gestor") && (
          <TabsContent value="catalogos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListTree className="h-5 w-5" />Catálogos</CardTitle>
                <CardDescription>Gerencie listas e sugestões pré-definidas exibidas nos formulários do sistema.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link
                  to="/configuracoes/objetivos-visita"
                  className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">Objetivos de Visita Técnica</div>
                    <div className="text-xs text-muted-foreground">
                      Sugestões exibidas no campo "Objetivo da visita" do formulário, por cultura ou genéricas.
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
                {isPlatformSuperadmin && (
                  <Link
                    to="/configuracoes/catalogo-ia"
                    className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm">Atualização global das fichas técnicas com IA</div>
                      <div className="text-xs text-muted-foreground">
                        Gera sugestões em lote para o catálogo global, com aprovação humana antes da substituição.
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                )}
                <Link
                  to="/configuracoes/parametros-cq"
                  className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">Parâmetros de referência do CQ</div>
                    <div className="text-xs text-muted-foreground">
                      Faixas esperadas (pH, concentração, aparência, odor, contaminação) por microrganismo/produto — exibidas como comparativo informativo no registro do CQ.
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        )}


        {/* Users Tab */}
        {isAdmin && (
          <TabsContent value="usuarios">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Gestão de Usuários</CardTitle>
                    <CardDescription>Gerencie os perfis de acesso dos usuários do sistema</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link to="/auditoria?tab=senhas">
                        <History className="h-4 w-4 mr-2" />
                        Auditoria de Senhas
                      </Link>
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                      <DialogTrigger asChild>
                        <Button><Plus className="h-4 w-4 mr-2" />Novo Usuário</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md flex flex-col max-h-[85vh] gap-0 overflow-hidden p-0">
                        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
                          <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                          <div className="pt-2">
                            <Label id="tipo-cadastro-label">Tipo de cadastro</Label>
                            <div role="radiogroup" aria-labelledby="tipo-cadastro-label" className="grid grid-cols-3 gap-2 mt-1">
                              {([
                                { kind: "internal" as UserRegistrationKind, titulo: "Interno", descricao: "Equipe da empresa" },
                                { kind: "b2b" as UserRegistrationKind, titulo: "Parceiro B2B", descricao: "Gestor do parceiro comercial" },
                                { kind: "producer" as UserRegistrationKind, titulo: "Cliente Produtor", descricao: "Vinculado a clientes" },
                              ]).map(opcao => (
                                <button
                                  key={opcao.kind}
                                  type="button"
                                  role="radio"
                                  aria-checked={registrationKind === opcao.kind}
                                  disabled={createUser.isPending}
                                  onClick={() => changeKind(opcao.kind)}
                                  className={`rounded-md border p-2 text-left transition-colors disabled:opacity-50 ${registrationKind === opcao.kind ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
                                >
                                  <span className="block text-sm font-medium">{opcao.titulo}</span>
                                  <span className="block text-xs text-muted-foreground">{opcao.descricao}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </DialogHeader>
                        <div className="space-y-3 flex-1 overflow-y-auto px-6 py-4">
                          {createResumo && (
                            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                              {createResumo}
                             </div>
                          )}
                          {registrationKind !== "internal" && <>
<p role="status" className="text-sm text-muted-foreground">{EXTERNAL_USER_ACTIVATION_REVIEWED
                              ? "Cadastro externo liberado: perfil externo exclusivo, vínculo obrigatório com um registro da própria empresa e primeiro acesso definido pelo titular. Técnico B2B permanece indisponível."
                              : "Cadastro externo aguardando revisão para liberação."}</p>
                            <Label htmlFor="buscar-vinculo">{registrationKind === "b2b" ? "Parceiro vinculado" : "Clientes vinculados"}</Label>
                            <Input id="buscar-vinculo" value={linkSearch} onChange={event => setLinkSearch(event.target.value)} placeholder="Buscar vínculo" />
                            {links.isLoading || (links.isFetching && !links.data) ? <p role="status" className="text-sm text-muted-foreground">Carregando opções…</p> : links.isError ? <div role="alert" className="text-sm text-destructive">Não foi possível consultar os vínculos. <Button variant="link" size="sm" onClick={() => links.refetch()}>Tentar novamente</Button></div> : <div className="space-y-2">
                              {links.data?.items.map(item => <label key={item.id} className="flex items-center gap-2 text-sm">
                                <Checkbox checked={registrationKind === "b2b" ? newUser.partner_id === item.id : selectedClients.includes(item.id)} onCheckedChange={checked => {
                                  if (registrationKind === "b2b") setNewUser({ ...newUser, partner_id: checked === true ? item.id : "" });
                                  else { const next = checked === true ? [...selectedClients, item.id] : selectedClients.filter(id => id !== item.id); setSelectedClients(next); if (!next.includes(primaryClient ?? "")) setPrimaryClient(next[0] ?? null); }
                                }} />{item.label}
                                {registrationKind === "producer" && selectedClients.includes(item.id) && <Button size="sm" variant="ghost" onClick={() => setPrimaryClient(item.id)}>{primaryClient === item.id ? "Principal" : "Tornar principal"}</Button>}
                              </label>)}
                              {links.data && !links.data.items.length && <p className="text-sm text-muted-foreground">{ajudaSemElegiveis(registrationKind === "b2b" ? "b2b" : "producer", linkSearch)}</p>}
                            </div>}
                            <div className="flex justify-between"><Button variant="outline" size="sm" disabled={linkPage === 0} onClick={() => setLinkPage(page => page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(linkPage + 1) * 20 >= (links.data?.total ?? 0)} onClick={() => setLinkPage(page => page + 1)}>Próxima</Button></div>
                            {createErros.partner_id && <p role="alert" className="text-sm text-destructive">{createErros.partner_id}</p>}{createErros.cliente_ids && <p role="alert" className="text-sm text-destructive">{createErros.cliente_ids}</p>}
                          </>}
                          <div>
                            <Label htmlFor="novo-nome">Nome *</Label>
                            <Input id="novo-nome" ref={registrarCampo("nome")} value={newUser.nome} onChange={e => setNewUser({ ...newUser, nome: e.target.value })} {...erroProps("nome")} />
                            {createErros.nome && <p id="erro-nome" className="text-xs text-destructive mt-1">{createErros.nome}</p>}
                          </div>
                          <div>
                            <Label htmlFor="novo-email">Email *</Label>
                            <Input id="novo-email" ref={registrarCampo("email")} type="email" maxLength={254} value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} {...erroProps("email")} />
                            {createErros.email && <p id="erro-email" className="text-xs text-destructive mt-1">{createErros.email}</p>}
                          </div>
                          {registrationKind === "internal" && <><div>
                            <Label htmlFor="nova-senha">Senha *</Label>
                            <Input id="nova-senha" ref={registrarCampo("password")} type="password" minLength={SENHA_MIN} maxLength={SENHA_MAX} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} {...erroProps("password")} />
                            <p className="text-xs text-muted-foreground mt-1">{REGRA_SENHA}</p>
                            {createErros.password && <p id="erro-password" className="text-xs text-destructive mt-1">{createErros.password}</p>}
                          </div>
                          <div>
                            <Label>Perfis * (selecione um ou mais)</Label>
                            <div
                              ref={registrarCampo("roles")}
                              tabIndex={-1}
                              className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-48 overflow-y-auto"
                              {...erroProps("roles")}
                            >
                              {TENANT_MANAGEABLE_ROLES.map(r => {
                                const checked = newUser.roles.includes(r);
                                return (
                                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) =>
                                        setNewUser({ ...newUser, roles: toggleRole(newUser.roles, r, v === true) })
                                      }
                                    />
                                    {ROLE_LABELS[r]}
                                  </label>
                                );
                              })}
                            </div>
<p className="text-xs text-muted-foreground mt-1">{EXTERNAL_USER_ACTIVATION_REVIEWED
                                ? "Cadastros externos (Parceiro B2B gestor e Cliente Produtor) usam perfil exclusivo, vínculo obrigatório da própria empresa e primeiro acesso pelo titular. Técnico B2B permanece indisponível."
                                : PARTNER_REGISTRATION_UNAVAILABLE}</p>
                            {createErros.roles && <p id="erro-roles" className="text-xs text-destructive mt-1">{createErros.roles}</p>}
                          </div>
                           </>}
                          {registrationKind === "internal" && <><div><Label>Telefone</Label><MaskedInput mask="telefone" value={newUser.telefone} onChange={e => setNewUser({ ...newUser, telefone: e.target.value })} /></div>
                           <div><Label>Cargo</Label><Input value={newUser.cargo} onChange={e => setNewUser({ ...newUser, cargo: e.target.value })} /></div>
                           <div><Label>CPF/CNPJ</Label><MaskedInput mask="cpf-cnpj" value={newUser.cpf_cnpj} onChange={e => setNewUser({ ...newUser, cpf_cnpj: e.target.value })} /></div></>}
                          {newUser.roles.some(r => r === 'tecnico_agronomo' || r === 'consultor_tecnico') && (
                            <>
                              <div><Label>CREA</Label><Input value={newUser.crea} onChange={e => setNewUser({ ...newUser, crea: e.target.value })} /></div>
                              <div><Label>Especialidade</Label><Input value={newUser.especialidade} onChange={e => setNewUser({ ...newUser, especialidade: e.target.value })} /></div>
                            </>
                          )}

                          <Button className="w-full" onClick={handleCriarUsuario} disabled={createUser.isPending || (registrationKind !== "internal" && !EXTERNAL_USER_ACTIVATION_REVIEWED)}>
                            {createUser.isPending ? "Criando..." : "Criar Usuário"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className={isMobile ? "p-3" : "p-6"}>
<p role="status" className="text-sm text-muted-foreground mb-4">{EXTERNAL_USER_ACTIVATION_REVIEWED
                  ? "Cadastros externos liberados: Parceiro B2B (gestor) e Cliente Produtor com perfil exclusivo, vínculo obrigatório da própria empresa e primeiro acesso definido pelo titular. Técnico B2B permanece indisponível."
                  : "Cadastros externos aguardam revisão para liberação. Técnico B2B permanece indisponível."}</p>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por nome ou email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar perfil" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os perfis</SelectItem>
                      {ACTIVE_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ativo">Ativos</SelectItem>
                      <SelectItem value="inativo">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Table */}
                {usersLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground" aria-live="polite">
                    Carregando usuários…
                  </div>
                ) : usersError ? (
                  <div role="alert" className="py-10 text-center space-y-3">
                    <p className="text-sm text-destructive">
                      Não foi possível carregar a lista de usuários. Os dados podem estar incompletos.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetchUsers()}>Tentar novamente</Button>
                  </div>
                ) : (
                <>
                <ResponsiveTable
                  mobileCards={
                    usuariosPagina.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</div>
                    ) : usuariosPagina.map((u: any) => (
                      <MobileCard
                        key={u.user_id}
                        onClick={() => { setEditUser(u); setEditOpen(true); }}
                        ariaLabel={`Editar usuário ${u.nome || u.email || ""}`}
                        title={u.nome || "—"}
                        subtitle={u.email}
                        status={
                          <div className="flex items-center gap-2" onClick={stopRowClick}>
                            <Switch
                              checked={u.ativo !== false}
                              disabled={u.user_id === user?.id}
                              onCheckedChange={(checked) => toggleAtivo.mutate({ userId: u.user_id, ativo: checked })}

                            />
                            <Badge variant={u.ativo === false ? "secondary" : "default"} className="text-[10px]">
                              {u.ativo === false ? "Inativo" : "Ativo"}
                            </Badge>
                          </div>
                        }
                        content={[
                          { label: "Perfil", value: (
                            <div className="flex flex-wrap gap-1">
                              {u.roles.map((r: string) => (
                                <Badge key={r} variant={ROLE_VARIANTS[r] || "outline"} className="text-[10px]">
                                  {ROLE_LABELS[r] || r}
                                </Badge>
                              ))}
                            </div>
                          )},
                          { label: "Tipo de acesso", value: ROTULO_TIPO_ACESSO[tipoAcessoDoUsuario(u.roles)] },
                          { label: "Vínculo", value: renderVinculo(u) },
                          { label: "Identificação", value: formatCpfCnpj(u.cpf_cnpj) || "—" },
                          { label: "Telefone", value: formatTelefone(u.telefone) || "—" },
                          { label: "Cargo", value: u.cargo || "—" },
                        ]}
                        actions={
                          <div className="flex w-full gap-2 items-center justify-end" onClick={stopRowClick}>
                            <Button variant="outline" size="sm" onClick={() => { setEditUser(u); setEditOpen(true); }}>
                              <Pencil className="h-3 w-3 mr-1" /> Editar
                            </Button>
                          </div>
                        }
                      />
                    ))
                  }
                >
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead>Vínculo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuariosPagina.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum usuário encontrado</TableCell>
                        </TableRow>
                      ) : usuariosPagina.map((u: any) => (
                        <TableRow
                          key={u.user_id}
                          {...rowClickProps(() => { setEditUser(u); setEditOpen(true); })}
                          className={`${u.ativo === false ? "opacity-50 " : ""}cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                        >
                          <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                          <TableCell>{u.email || "—"}</TableCell>
                          <TableCell>
                            {u.roles.map((r: string) => (
                              <Badge key={r} variant={ROLE_VARIANTS[r] || "outline"} className="mr-1">
                                {ROLE_LABELS[r] || r}
                              </Badge>
                            ))}
                            {u.roles.length === 0 && <span className="text-muted-foreground text-sm">Sem perfil</span>}
                          </TableCell>
                          <TableCell>{renderVinculo(u)}</TableCell>
                          <TableCell onClick={stopRowClick}>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={u.ativo !== false}
                                disabled={u.user_id === user?.id}
                                onCheckedChange={(checked) => toggleAtivo.mutate({ userId: u.user_id, ativo: checked })}

                              />
                              <span className="text-xs text-muted-foreground">{u.ativo === false ? "Inativo" : "Ativo"}</span>
                            </div>
                          </TableCell>
                          <TableCell onClick={stopRowClick}>
                            <Button variant="ghost" size="icon" onClick={() => { setEditUser(u); setEditOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ResponsiveTable>

                {paginacao.total > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
                    <p className="text-xs text-muted-foreground">
                      Exibindo {paginacao.inicio}–{paginacao.fim} de {paginacao.total} usuários
                      {usersFetching ? " · atualizando…" : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={paginacao.paginaAtual <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Página {paginacao.paginaAtual} de {paginacao.totalPaginas}
                      </span>
                      <Button variant="outline" size="sm" disabled={paginacao.paginaAtual >= paginacao.totalPaginas} onClick={() => setPagina(p => p + 1)}>
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
                </>
                )}
              </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={(open) => {
              if (!open) {
                externalDialog.current.open = false;
                externalDialog.current.generation += 1;
              }
              setEditOpen(open);
              if (!open) {
                const sp = new URLSearchParams(searchParams);
                if (sp.has("user_id")) {
                  sp.delete("user_id");
                  setSearchParams(sp, { replace: true });
                }
              }
            }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Editar Usuário</DialogTitle>
                </DialogHeader>
                {editUser && (
                  <div className="space-y-3">
                    <div><Label>Email</Label><Input value={editUser.email || ""} disabled className="bg-muted" /></div>
                    <div><Label>Tipo de acesso</Label><p className="text-sm">{ROTULO_TIPO_ACESSO[editTipo]}</p></div>
                    <div><Label>Vínculo atual</Label><div className="border rounded-md p-2">{renderVinculo(editOrig ?? editUser, true)}</div></div>
                    {externalCommonCandidate && <ExternalCommonUserEditBoundary
                      key={`${externalScope}:${externalGeneration}`}
                      target={editUser} scope={externalScope} actorId={user?.id ?? ''} organizationId={profile?.organization_id ?? ''}
                      ready={canTenantEmail} expectedVersion={vinculos.data?.get(editUser.user_id)?.expected_version}
                      snapshotReady={!vinculos.isFetching && !vinculos.isError}
                      snapshotError={vinculos.isError}
                      isCurrent={externalCurrent}
                      onSuccess={() => {
                        if (!externalCurrent()) return;
                        queryClient.invalidateQueries({ queryKey: ['admin-users', profile?.organization_id, user?.id] });
                        queryClient.invalidateQueries({ queryKey: ['admin-user-links', profile?.organization_id, user?.id] });
                        if (!externalCurrent()) return;
                        toast({ title: 'Usuário atualizado' });
                        externalDialog.current.open = false;
                        externalDialog.current.generation += 1;
                        setEditOpen(false);
                      }}
                      onError={message => {
                        if (externalCurrent()) toast({ title: 'Erro', description: message, variant: 'destructive' });
                      }}
                    />}
                    {!externalCommonCandidate && <>
                    {editSomenteLeitura && <p role="status" className="text-xs text-muted-foreground border rounded-md p-2">{MSG_EDICAO_EXTERNA_INDISPONIVEL}</p>}
                    {editTipo === 'internal' && <div>
                      <Label>Perfis de Acesso (selecione um ou mais)</Label>
                      <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                      {TENANT_MANAGEABLE_ROLES.map(r => {
                          const currentRoles: string[] = editUser.roles ?? [];
                          const checked = currentRoles.includes(r);
                          return (
                            <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={checked}
                                disabled={r === "administrador" && checked && editUser.user_id === user?.id}
                                onCheckedChange={(v) =>
                                  setEditUser({ ...editUser, roles: toggleRole(currentRoles, r, v === true) })
                                }
                              />
                              {ROLE_LABELS[r]}
                            </label>

                          );
                        })}
                      </div>
                    </div>}
                    <fieldset disabled={editSomenteLeitura} className="space-y-3 disabled:opacity-70">
                    <div><Label>Nome</Label><Input value={editUser.nome || ""} onChange={e => setEditUser({ ...editUser, nome: e.target.value })} /></div>
                    <div><Label>Telefone</Label><MaskedInput mask="telefone" value={editUser.telefone || ""} onChange={e => setEditUser({ ...editUser, telefone: e.target.value })} /></div>
                    <div><Label>Cargo</Label><Input value={editUser.cargo || ""} onChange={e => setEditUser({ ...editUser, cargo: e.target.value })} /></div>
                    <div><Label>CPF/CNPJ</Label><MaskedInput mask="cpf-cnpj" value={editUser.cpf_cnpj || ""} onChange={e => setEditUser({ ...editUser, cpf_cnpj: e.target.value })} /></div>
                    {editUser.roles?.some((r: string) => r === 'tecnico_agronomo' || r === 'consultor_tecnico') && (
                      <>
                        <div><Label>CREA</Label><Input value={editUser.crea || ""} onChange={e => setEditUser({ ...editUser, crea: e.target.value })} /></div>
                        <div><Label>Especialidade</Label><Input value={editUser.especialidade || ""} onChange={e => setEditUser({ ...editUser, especialidade: e.target.value })} /></div>
                      </>
                    )}
                    </fieldset>
                    {editResumo && (
                      <p role="alert" className="text-xs text-destructive border border-destructive/40 rounded-md p-2">
                        {editResumo}
                      </p>
                    )}
                    {Object.values(editErros).filter(Boolean).length > 0 && (
                      <ul className="text-xs text-destructive list-disc pl-4">
                        {Object.entries(editErros).map(([campo, msg]) => (
                          <li key={campo}>{msg as string}</li>
                        ))}
                      </ul>
                    )}
                    <Button className="w-full" onClick={() => { if (!saveEditUser.isPending) saveEditUser.mutate(); }} disabled={saveEditUser.isPending || exigeRecargaEdicao || editSomenteLeitura}>
                      {saveEditUser.isPending ? "Salvando..." : exigeRecargaEdicao ? "Recarregue a lista para tentar novamente" : editSomenteLeitura ? "Edição indisponível para usuário externo" : "Salvar Alterações"}
                    </Button>
                    </>}


                    <div className="border-t pt-4 mt-2 space-y-3">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-sm">Alterar Senha</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A alteração administrativa não confirma o email nem conclui o primeiro acesso. Se houver pendência, o titular deve concluir o fluxo seguro de primeiro acesso ou recuperação; alterar a senha não libera esse acesso. {REGRA_SENHA}
                      </p>
                      <div>
                        <Label>Nova Senha</Label>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Mín. 8 caracteres, com letra e número"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label>Confirmar Senha</Label>
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Repita a nova senha"
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                          <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => updateUserPassword.mutate()}
                        disabled={
                          updateUserPassword.isPending ||
                          !senhaForte(newPassword) ||
                          newPassword !== confirmPassword
                        }
                      >
                        <KeyRound className="h-4 w-4 mr-2" />
                        {updateUserPassword.isPending ? "Atualizando..." : "Atualizar Senha"}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
