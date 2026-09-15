import { useState, useEffect, useRef, useMemo } from "react";
import {
  validarNovoUsuario,
  primeiroCampoInvalido,
  mapearErroCriacaoUsuario,
  lerCorpoErroFuncao,
  criacaoBemSucedida,
  filtrarUsuariosPorBusca,
  paginar,
  ERRO_GENERICO_CRIACAO,
  REGRA_SENHA,
  senhaValida,
  validarEdicaoUsuario,
  primeiroCampoInvalidoEdicao,
  diferencaPapeis,
  bloqueioAutoDesativacao,
  bloqueioAutoRemocaoAdmin,
  exigirUmaLinha,
  ERRO_EDICAO_PARCIAL,
  type ErrosEdicaoUsuario,



  SENHA_MIN,
  SENHA_MAX,
  USUARIOS_POR_PAGINA,
  type ErrosNovoUsuario,
  type CampoNovoUsuario,
} from "@/lib/configuracoes/usuariosValidation";
import { fetchAllRows } from "@/lib/configuracoes/fetchAllRows";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Settings, Users, UserCog, Save, Plus, Pencil, Search, Palette, ListTree, ExternalLink, Mail, Phone, Shield, Eye, EyeOff, KeyRound, Star, Timer, Download } from "lucide-react";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { SlaB2BTab } from "@/pages/configuracoes/SlaB2BTab";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { ROLE_LABELS, ROLE_VARIANTS, ACTIVE_ROLES } from "@/lib/permissions";
import AparenciaTab from "@/components/configuracoes/AparenciaTab";
import { ClientesVinculadosField, type ClienteVinculo } from "@/components/configuracoes/ClientesVinculadosField";
import { Link } from "react-router-dom";
import { History, Wallet } from "lucide-react";
import { broadcastPortalEvent } from "@/lib/portalBroadcast";

import ConfiguracoesFinanceiras from "@/pages/financeiro/ConfiguracoesFinanceiras";
import ComunicacaoConfigTab from "@/pages/configuracoes/ComunicacaoConfigTab";
import { isComunicacaoModuleEnabled } from "@/features/comunicacao/flags";
import { MessageSquare } from "lucide-react";



export default function Configuracoes() {
  const isMobile = useIsMobile();
  const { profile, role, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isAdmin = role === "administrador";
  const canFin = isAdmin || role === "gestor" || role === "financeiro";
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam === "usuarios" && isAdmin
      ? "usuarios"
      : tabParam === "financeiro" && canFin
        ? "financeiro"
        : tabParam && ["perfil", "aparencia", "catalogos", "sla-b2b", "comunicacao"].includes(tabParam)
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

  // Admin: list all users
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const {
    data: allUsers = [],
    isLoading: usersLoading,
    isError: usersError,
    isFetching: usersFetching,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      // Leitura paginada real: sem truncar silenciosamente e com ordem estável por PK.
      const profiles = await fetchAllRows<any>((from, to) =>
        supabase
          .from("profiles")
          .select("user_id, nome, email, telefone, cpf_cnpj, ativo, created_at, cargo, crea, especialidade")
          .order("user_id", { ascending: true })
          .range(from, to),
      );
      // Falhas em papéis/vínculos NÃO podem ser tratadas como "sem dados".
      const roles = await fetchAllRows<any>((from, to) =>
        (supabase as any).from("user_roles").select("user_id, role").order("id", { ascending: true }).range(from, to),
      );
      const vinc = await fetchAllRows<any>((from, to) =>
        (supabase as any)
          .from("user_clientes")
          .select("user_id, cliente_id, principal")
          .order("id", { ascending: true })
          .range(from, to),
      );
      const rolesByUser = new Map<string, string[]>();
      for (const r of roles) {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      }
      const vincByUser = new Map<string, ClienteVinculo[]>();
      for (const v of vinc) {
        const arr = vincByUser.get(v.user_id) ?? [];
        arr.push({ cliente_id: v.cliente_id, principal: !!v.principal } as ClienteVinculo);
        vincByUser.set(v.user_id, arr);
      }
      return profiles
        .map((p: any) => ({
          ...p,
          roles: rolesByUser.get(p.user_id) ?? [],
          vinculos: vincByUser.get(p.user_id) ?? [],
        }))
        .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-lista"],
    enabled: isAdmin,
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        supabase.from("clientes").select("id, nome, cpf_cnpj").order("id", { ascending: true }).range(from, to),
      );
      return [...data].sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""))) as {
        id: string;
        nome: string;
        cpf_cnpj: string | null;
      }[];
    },
  });

  // Parceiros B2B (para vínculo quando papel parceiro_b2b* é selecionado)
  const { data: partners = [] } = useQuery({
    queryKey: ["partner-accounts-lista"],
    enabled: isAdmin,
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        (supabase as any)
          .from("partner_accounts")
          .select("id, codigo, razao_social, nome_fantasia, ativo")
          .eq("ativo", true)
          .order("id", { ascending: true })
          .range(from, to),
      );
      return [...data].sort((a, b) =>
        String(a.razao_social ?? "").localeCompare(String(b.razao_social ?? "")),
      ) as { id: string; codigo: string | null; razao_social: string; nome_fantasia: string | null; ativo: boolean }[];
    },
  });

  // Vínculo atual dos usuários com parceiros
  const { data: partnerLinks = [] } = useQuery({
    queryKey: ["partner-users-links"],
    enabled: isAdmin,
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) =>
        (supabase as any)
          .from("partner_users")
          .select("id, user_id, partner_id, papel")
          .order("id", { ascending: true })
          .range(from, to),
      );
      return data as { id: string; user_id: string; partner_id: string; papel: string }[];
    },
  });


  const clienteNomeById = (id: string) => clientes.find(c => c.id === id)?.nome ?? id.slice(0, 8);
  const partnerLinkByUser = (uid: string) => partnerLinks.find(l => l.user_id === uid) || null;

  // Helpers de papéis
  const PARTNER_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico"] as const;
  const hasPartnerRole = (roles: string[]) => roles.some(r => (PARTNER_ROLES as readonly string[]).includes(r));
  const partnerPapelFromRoles = (roles: string[]): "gestor" | "tecnico" =>
    roles.includes("parceiro_b2b_tecnico") ? "tecnico" : "gestor";
  function toggleRole(roles: string[], r: string, on: boolean): string[] {
    let next = new Set(roles);
    if (on) {
      next.add(r);
      // cliente_produtor é exclusivo
      if (r === "cliente_produtor") next = new Set(["cliente_produtor"]);
      else next.delete("cliente_produtor");
      // gestor/técnico do parceiro são mutuamente exclusivos entre si
      if (r === "parceiro_b2b") next.delete("parceiro_b2b_tecnico");
      if (r === "parceiro_b2b_tecnico") next.delete("parceiro_b2b");
    } else {
      next.delete(r);
    }
    return Array.from(next);
  }


  const filteredUsers = useMemo(() => {
    const porFiltros = allUsers.filter((u: any) => {
      if (filterRole !== "all" && !u.roles.includes(filterRole)) return false;
      if (filterStatus === "ativo" && u.ativo === false) return false;
      if (filterStatus === "inativo" && u.ativo !== false) return false;
      return true;
    });
    return filtrarUsuariosPorBusca(porFiltros as any[], debouncedSearchTerm) as any[];
  }, [allUsers, filterRole, filterStatus, debouncedSearchTerm]);

  // Paginação client-side sobre o conjunto JÁ filtrado (nada é truncado silenciosamente)
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [filterRole, filterStatus, debouncedSearchTerm]);
  const paginacao = useMemo(() => paginar(filteredUsers, pagina, USUARIOS_POR_PAGINA), [filteredUsers, pagina]);
  const usuariosPagina = paginacao.itens;

  /**
   * Sincroniza papéis + vínculo com parceiro.
   * NÃO é atômico (sem RPC transacional): por isso aplicamos diferença mínima
   * (insere novos, remove só os retirados) e propagamos TODOS os erros.
   */
  async function syncUserRolesAndPartner(userId: string, desiredRoles: string[], partnerId: string) {
    const sb = supabase as any;
    const { data: atuaisRoles, error: rolesSelErr } = await sb
      .from("user_roles")
      .select("id, role")
      .eq("user_id", userId);
    if (rolesSelErr) throw rolesSelErr;

    const atuais = (atuaisRoles ?? []).map((r: any) => r.role as string);
    const { inserir, remover } = diferencaPapeis(atuais, desiredRoles);

    // 1) Primeiro insere os novos (nunca deixa o usuário sem papel algum)
    if (inserir.length > 0) {
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert(inserir.map((r) => ({ user_id: userId, role: r as any })));
      if (insErr) throw insErr;
    }
    // 2) Depois remove apenas os retirados; os comuns são preservados
    if (remover.length > 0) {
      const idsRemover = (atuaisRoles ?? [])
        .filter((r: any) => remover.includes(r.role))
        .map((r: any) => r.id);
      const { error: delErr } = await sb.from("user_roles").delete().in("id", idsRemover);
      if (delErr) throw delErr;
    }

    // 3) Sincroniza partner_users (erro de select NÃO é tratado como ausência)
    const isPartner = hasPartnerRole(desiredRoles);
    const papel = partnerPapelFromRoles(desiredRoles);
    const { data: existing, error: partnerSelErr } = await sb
      .from("partner_users")
      .select("id, partner_id, papel")
      .eq("user_id", userId)
      .maybeSingle();
    if (partnerSelErr) throw partnerSelErr;

    if (isPartner) {
      if (!existing) {
        const { error } = await sb.from("partner_users").insert({ user_id: userId, partner_id: partnerId, papel });
        if (error) throw error;
      } else if (existing.partner_id !== partnerId || existing.papel !== papel) {
        const { error } = await sb.from("partner_users").update({ partner_id: partnerId, papel }).eq("id", existing.id);
        if (error) throw error;
      }
    } else if (existing) {
      const { error: delPartnerErr } = await sb.from("partner_users").delete().eq("id", existing.id);
      if (delPartnerErr) throw delPartnerErr;
    }
  }


  // Toggle ativo — proteção de UX: ninguém desativa a própria conta
  const toggleAtivo = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      const bloqueio = bloqueioAutoDesativacao(userId === user?.id, ativo);
      if (bloqueio) throw new Error(bloqueio);
      const { data, error } = await supabase
        .from("profiles")
        .update({ ativo } as any)
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      exigirUmaLinha(data, "status do usuário");
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Status do usuário atualizado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const initialNewUser = {
    nome: "", email: "", password: "",
    roles: ["administrativo"] as string[],
    partner_id: "" as string,
    telefone: "", cargo: "", cpf_cnpj: "", crea: "", especialidade: "",
  };
  const [newUser, setNewUser] = useState(initialNewUser);
  const [newUserVinculos, setNewUserVinculos] = useState<ClienteVinculo[]>([]);

  const [createErros, setCreateErros] = useState<ErrosNovoUsuario>({});
  const [createResumo, setCreateResumo] = useState<string | null>(null);
  const campoRefs = useRef<Record<string, HTMLElement | null>>({});
  const registrarCampo = (campo: CampoNovoUsuario) => (el: HTMLElement | null) => { campoRefs.current[campo] = el; };
  const erroProps = (campo: CampoNovoUsuario) =>
    createErros[campo]
      ? ({ "aria-invalid": true, "aria-describedby": `erro-${campo}` } as const)
      : ({} as const);

  const createUser = useMutation({
    mutationFn: async () => {
      const principal = newUserVinculos.find(v => v.principal)?.cliente_id ?? newUserVinculos[0]?.cliente_id;
      const payload: any = {
        ...newUser,
        nome: newUser.nome.trim(),
        email: newUser.email.trim(),
        // compat com fluxo legado que espera `role` string
        role: newUser.roles[0],
        roles: newUser.roles,
        partner_id: newUser.partner_id || null,
        partner_papel: hasPartnerRole(newUser.roles) ? partnerPapelFromRoles(newUser.roles) : null,
        telefone: (() => { const c = validatePhoneBR(newUser.telefone, { fieldLabel: "Telefone" }); if (!c.ok) throw new Error(c.error); return c.value; })(),
        cpf_cnpj: unmaskCpfCnpj(newUser.cpf_cnpj),
        cliente_ids: newUserVinculos.map(v => v.cliente_id),
        principal_cliente_id: principal,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });
      toast({ title: "Usuário criado com sucesso" });
      setCreateOpen(false);
      setNewUser(initialNewUser);
      setNewUserVinculos([]);
      setCreateErros({});
      setCreateResumo(null);
    },
    onError: (e: Error) => {
      // Não limpamos o formulário: o administrador corrige e reenvia.
      setCreateResumo(e.message || ERRO_GENERICO_CRIACAO);
      toast({ title: "Erro ao criar usuário", description: e.message, variant: "destructive" });
    },
  });

  function handleCriarUsuario() {
    if (createUser.isPending) return; // bloqueia envio duplicado
    const erros = validarNovoUsuario({
      nome: newUser.nome,
      email: newUser.email,
      password: newUser.password,
      roles: newUser.roles,
      partner_id: newUser.partner_id,
      cliente_ids: newUserVinculos.map(v => v.cliente_id),
    });
    setCreateErros(erros);
    const primeiro = primeiroCampoInvalido(erros);
    if (primeiro) {
      setCreateResumo("Corrija os campos destacados antes de continuar.");
      requestAnimationFrame(() => campoRefs.current[primeiro]?.focus?.());
      return;
    }
    setCreateResumo(null);
    createUser.mutate();
  }

  // Edit user dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [editVinculos, setEditVinculos] = useState<ClienteVinculo[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!editOpen) {
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setEditUser(null);
      setEditVinculos([]);
      setEditErros({});
      setEditResumo(null);

    }
  }, [editOpen]);

  // Inicializa vínculos apenas quando abre o diálogo ou muda o usuário sendo editado
  // Usamos editUser?.user_id para evitar resetar o estado quando outros campos (nome, email) mudam
  useEffect(() => {
    if (editOpen && editUser?.user_id) {
      setEditVinculos(editUser.vinculos || []);
      // Popula partner_id a partir do vínculo atual (fase multiportal)
      const link = partnerLinkByUser(editUser.user_id);
      if (link && !editUser.partner_id) {
        setEditUser((prev: any) => (prev ? { ...prev, partner_id: link.partner_id } : prev));
      }
    }
  }, [editOpen, editUser?.user_id, partnerLinks]);

  // Deep-link: ?tab=usuarios&user_id=... — o parâmetro é CONSUMIDO ao abrir,
  // para que fechar o diálogo não o reabra.
  const deepLinkConsumido = useRef<string | null>(null);
  useEffect(() => {
    const uid = searchParams.get("user_id");
    if (!uid || !isAdmin) return;
    if (deepLinkConsumido.current === uid) return;
    if (allUsers.length === 0) return;
    deepLinkConsumido.current = uid;
    const found = allUsers.find((u: any) => u.user_id === uid);
    if (found) { setEditUser(found); setEditOpen(true); }
    const sp = new URLSearchParams(searchParams);
    sp.delete("user_id");
    setSearchParams(sp, { replace: true });
  }, [searchParams, allUsers, isAdmin, setSearchParams]);


  // Estado da edição: erros por campo, resumo e marca de escrita já iniciada
  const [editErros, setEditErros] = useState<ErrosEdicaoUsuario>({});
  const [editResumo, setEditResumo] = useState<string | null>(null);
  const escritaIniciada = useRef(false);

  const saveEditUser = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      escritaIniciada.current = false;

      // ---- 1) VALIDAÇÃO COMPLETA ANTES DE QUALQUER ESCRITA ----
      const desiredRoles: string[] = editUser.roles ?? [];
      const erros = validarEdicaoUsuario(
        {
          nome: editUser.nome ?? "",
          telefone: editUser.telefone ?? "",
          roles: desiredRoles,
          partner_id: editUser.partner_id ?? "",
          cliente_ids: editVinculos.map((v) => v.cliente_id),
        },
        (v) => validatePhoneBR(v as any, { fieldLabel: "Telefone" }),
      );
      setEditErros(erros);
      const primeiro = primeiroCampoInvalidoEdicao(erros);
      if (primeiro) throw new Error(erros[primeiro]!);

      const originalUser = allUsers.find((u) => u.user_id === editUser.user_id);
      const originalRoles: string[] = originalUser?.roles ?? [];
      const isSelf = editUser.user_id === user?.id;
      const bloqueioAdmin = bloqueioAutoRemocaoAdmin(isSelf, originalRoles, desiredRoles);
      if (bloqueioAdmin) throw new Error(bloqueioAdmin);

      const telefoneValidado = validatePhoneBR(editUser.telefone, { fieldLabel: "Telefone" });
      if (!telefoneValidado.ok) throw new Error(telefoneValidado.error);

      const sb = supabase as any;
      const { data: atuais, error: selectErr } = await sb
        .from("user_clientes")
        .select("id, cliente_id, principal")
        .eq("user_id", editUser.user_id);
      if (selectErr) throw selectErr;

      const atuaisMap = new Map<string, { id: string; principal: boolean }>((atuais ?? []).map((r: any) => [r.cliente_id, { id: r.id, principal: !!r.principal }]));
      const desejados = new Set(editVinculos.map(v => v.cliente_id));

      // ---- 2) ESCRITAS (sem atomicidade: a partir daqui pode haver estado parcial) ----
      escritaIniciada.current = true;

      const toDelete = (atuais ?? []).filter((r: any) => !desejados.has(r.cliente_id)).map((r: any) => r.id);
      if (toDelete.length) {
        const { error: delErr } = await sb.from("user_clientes").delete().in("id", toDelete);
        if (delErr) throw delErr;
      }

      for (const v of editVinculos) {
        const existing = atuaisMap.get(v.cliente_id);
        if (!existing) {
          const { error: insErr } = await sb.from("user_clientes").insert({ user_id: editUser.user_id, cliente_id: v.cliente_id, principal: v.principal });
          if (insErr) throw insErr;
        } else if (existing.principal !== v.principal) {
          const { error: updErr } = await sb.from("user_clientes").update({ principal: v.principal }).eq("id", existing.id);
          if (updErr) throw updErr;
        }
      }

      // Perfil básico — confirma que exatamente UMA linha foi atualizada
      const { data: perfilAtualizado, error: profileErr } = await supabase.from("profiles")
        .update({
          nome: (editUser.nome ?? "").trim(),
          telefone: telefoneValidado.value,
          cargo: editUser.cargo,
          cpf_cnpj: unmaskCpfCnpj(editUser.cpf_cnpj),
          crea: editUser.crea,
          especialidade: editUser.especialidade,
        } as any)
        .eq("user_id", editUser.user_id)
        .select("user_id");
      if (profileErr) throw profileErr;
      exigirUmaLinha(perfilAtualizado, "dados do perfil");

      // Papéis + vínculo com parceiro B2B
      const rolesChanged =
        desiredRoles.length !== originalRoles.length ||
        desiredRoles.some((r) => !originalRoles.includes(r));
      const originalLink = partnerLinkByUser(editUser.user_id);
      const partnerChanged =
        (hasPartnerRole(desiredRoles) && (originalLink?.partner_id !== editUser.partner_id
          || originalLink?.papel !== partnerPapelFromRoles(desiredRoles)))
        || (!hasPartnerRole(desiredRoles) && !!originalLink);

      if (rolesChanged || partnerChanged) {
        await syncUserRolesAndPartner(editUser.user_id, desiredRoles, editUser.partner_id || "");
      }
      return { rolesChanged, userId: editUser.user_id };
    },
    onSuccess: (result) => {
      escritaIniciada.current = false;
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

    onError: (e: Error) => {
      // Falha após início das escritas: estado pode estar parcial. Não repetimos automaticamente
      // e mantemos o formulário aberto para conferência.
      const parcial = escritaIniciada.current;
      escritaIniciada.current = false;
      if (parcial) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        queryClient.invalidateQueries({ queryKey: ["partner-users-links"] });
      }
      const msg = parcial ? `${e.message} ${ERRO_EDICAO_PARCIAL}` : e.message;
      setEditResumo(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });



  const senhaForte = (s: string) => senhaValida(s);


  const updateUserPassword = useMutation({
    mutationFn: async () => {
      if (!editUser) throw new Error("Usuário não selecionado");
      if (!senhaForte(newPassword)) throw new Error(REGRA_SENHA);
      if (newPassword !== confirmPassword) throw new Error("As senhas não coincidem");
      const { data, error } = await supabase.functions.invoke("admin-update-user-password", {
        body: { user_id: editUser.user_id, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: "Senha atualizada com sucesso" });
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao alterar senha", description: e.message, variant: "destructive" });
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
            <Settings className="h-3 w-3 sm:h-4 sm:w-4" />Perfil
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="aparencia" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <Palette className="h-3 w-3 sm:h-4 sm:w-4" />Visual
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
          {isAdmin && isComunicacaoModuleEnabled() && (
            <TabsTrigger value="comunicacao" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3 whitespace-nowrap">
              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />Comunicação
            </TabsTrigger>
          )}
        </TabsList>

        {isAdmin && isComunicacaoModuleEnabled() && (
          <TabsContent value="comunicacao">
            <ComunicacaoConfigTab />
          </TabsContent>
        )}

        <TabsContent value="sla-b2b">
          <SlaB2BTab podeEditar={isAdmin || role === "gestor"} />
        </TabsContent>

        {canFin && (
          <TabsContent value="financeiro">
            <ConfiguracoesFinanceiras />
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

        {/* Aparência Tab */}
        {isAdmin && (
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
                <Link
                  to="/configuracoes/catalogo-ia"
                  className="flex items-center justify-between border rounded-md p-3 hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm">Atualização das fichas técnicas com IA</div>
                    <div className="text-xs text-muted-foreground">
                      Gera sugestões em lote para campos de produtos e microrganismos. Cada sugestão cria uma versão pendente de aprovação.
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
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
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                          {createResumo && (
                            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                              {createResumo}
                            </div>
                          )}
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
                          <div>
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
                              {ACTIVE_ROLES.map(r => {
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
                            {createErros.roles && <p id="erro-roles" className="text-xs text-destructive mt-1">{createErros.roles}</p>}
                          </div>
                          {hasPartnerRole(newUser.roles) && (
                            <div>
                              <Label>Parceiro B2B vinculado *</Label>
                              <Select value={newUser.partner_id} onValueChange={v => setNewUser({ ...newUser, partner_id: v })}>
                                <SelectTrigger ref={registrarCampo("partner_id")} {...erroProps("partner_id")}><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
                                <SelectContent>
                                  {partners.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.razao_social}{p.codigo ? ` (${p.codigo})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-1">
                                Papel no parceiro: <b>{partnerPapelFromRoles(newUser.roles) === "tecnico" ? "Técnico" : "Gestor"}</b>
                              </p>
                              {createErros.partner_id && <p id="erro-partner_id" className="text-xs text-destructive mt-1">{createErros.partner_id}</p>}
                            </div>
                          )}
                           <div><Label>Telefone</Label><MaskedInput mask="telefone" value={newUser.telefone} onChange={e => setNewUser({ ...newUser, telefone: e.target.value })} /></div>
                           <div><Label>Cargo</Label><Input value={newUser.cargo} onChange={e => setNewUser({ ...newUser, cargo: e.target.value })} /></div>
                           <div><Label>CPF/CNPJ</Label><MaskedInput mask="cpf-cnpj" value={newUser.cpf_cnpj} onChange={e => setNewUser({ ...newUser, cpf_cnpj: e.target.value })} /></div>
                          {newUser.roles.some(r => r === 'tecnico_agronomo' || r === 'consultor_tecnico') && (
                            <>
                              <div><Label>CREA</Label><Input value={newUser.crea} onChange={e => setNewUser({ ...newUser, crea: e.target.value })} /></div>
                              <div><Label>Especialidade</Label><Input value={newUser.especialidade} onChange={e => setNewUser({ ...newUser, especialidade: e.target.value })} /></div>
                            </>
                          )}
                          <div ref={registrarCampo("cliente_ids")} tabIndex={-1} {...erroProps("cliente_ids")}>
                            <ClientesVinculadosField
                              clientes={clientes}
                              value={newUserVinculos}
                              onChange={setNewUserVinculos}
                              required={newUser.roles.includes('cliente_produtor')}
                              helperText={newUser.roles.includes('cliente_produtor')
                                ? "Obrigatório para o perfil Produtor. O cliente marcado como principal é o padrão ao acessar o portal."
                                : "Opcional. Define quais clientes este usuário poderá visualizar pelo Portal do Produtor."}
                            />
                            {createErros.cliente_ids && <p id="erro-cliente_ids" className="text-xs text-destructive mt-1">{createErros.cliente_ids}</p>}
                          </div>

                          <Button className="w-full" onClick={handleCriarUsuario} disabled={createUser.isPending}>
                            {createUser.isPending ? "Criando..." : "Criar Usuário"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className={isMobile ? "p-3" : "p-6"}>
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
                          { label: "Identificação", value: formatCpfCnpj(u.cpf_cnpj) || "—" },
                          { label: "Telefone", value: formatTelefone(u.telefone) || "—" },
                          { label: "Cargo", value: u.cargo || "—" },
                          { label: "Vínculos", value: (
                            <div className="flex flex-wrap gap-1">
                              {u.vinculos?.map((v: ClienteVinculo) => (
                                <Badge key={v.cliente_id} variant={v.principal ? "default" : "outline"} className="text-[10px]">
                                  {v.principal && <Star className="h-2 w-2 mr-1 fill-current" />}
                                  {clienteNomeById(v.cliente_id)}
                                </Badge>
                              ))}
                              {(!u.vinculos || u.vinculos.length === 0) && "—"}
                            </div>
                          )},
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
                        <TableHead>Status</TableHead>
                        <TableHead>Vínculos</TableHead>
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
                          <TableCell onClick={stopRowClick}>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={u.ativo !== false}
                                onCheckedChange={(checked) => toggleAtivo.mutate({ userId: u.user_id, ativo: checked })}
                              />
                              <span className="text-xs text-muted-foreground">{u.ativo === false ? "Inativo" : "Ativo"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {u.vinculos?.map((v: ClienteVinculo) => (
                                <Badge key={v.cliente_id} variant={v.principal ? "default" : "outline"} className="text-[10px]">
                                  {v.principal && <Star className="h-2 w-2 mr-1 fill-current" />}
                                  {clienteNomeById(v.cliente_id)}
                                </Badge>
                              ))}
                              {(!u.vinculos || u.vinculos.length === 0) && <span className="text-muted-foreground text-xs">—</span>}
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
                    <div>
                      <Label>Perfis de Acesso (selecione um ou mais)</Label>
                      <div className="grid grid-cols-2 gap-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                        {ACTIVE_ROLES.map(r => {
                          const currentRoles: string[] = editUser.roles ?? [];
                          const checked = currentRoles.includes(r);
                          return (
                            <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setEditUser({ ...editUser, roles: toggleRole(currentRoles, r, v === true) })
                                }
                              />
                              {ROLE_LABELS[r]}
                            </label>
                          );
                        })}
                      </div>
                      {(editUser.roles ?? []).includes("cliente_produtor") && (editUser.roles ?? []).length > 1 && (
                        <p className="text-xs text-destructive mt-1">Produtor não pode ser combinado com outros perfis.</p>
                      )}
                    </div>
                    {hasPartnerRole(editUser.roles ?? []) && (
                      <div>
                        <Label>Parceiro B2B vinculado *</Label>
                        <Select
                          value={editUser.partner_id || ""}
                          onValueChange={v => setEditUser({ ...editUser, partner_id: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
                          <SelectContent>
                            {partners.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.razao_social}{p.codigo ? ` (${p.codigo})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Papel no parceiro: <b>{partnerPapelFromRoles(editUser.roles ?? []) === "tecnico" ? "Técnico" : "Gestor"}</b>
                        </p>
                      </div>
                    )}
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
                    <ClientesVinculadosField
                      clientes={clientes}
                      value={editVinculos}
                      onChange={setEditVinculos}
                      required={editUser.roles?.includes('cliente_produtor')}
                      helperText={editUser.roles?.includes('cliente_produtor')
                        ? "Obrigatório para o perfil Produtor. O cliente marcado como principal é o padrão ao acessar o portal."
                        : "Opcional. Define quais clientes este usuário poderá visualizar pelo Portal do Produtor."}
                    />
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
                    <Button className="w-full" onClick={() => { if (!saveEditUser.isPending) saveEditUser.mutate(); }} disabled={saveEditUser.isPending}>
                      {saveEditUser.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>


                    <div className="border-t pt-4 mt-2 space-y-3">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-sm">Alterar Senha</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Defina uma nova senha para este usuário. Ele precisará usar a nova senha no próximo login. {REGRA_SENHA}
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
