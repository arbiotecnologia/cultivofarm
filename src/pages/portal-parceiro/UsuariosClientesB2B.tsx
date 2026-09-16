import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfilesByUserIds, displayPartnerUserName } from "@/lib/partnerUserProfiles";

import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Link2, Link2Off, UserCog } from "lucide-react";

type Usuario = { user_id: string; nome: string | null; email: string | null; papel: string };
type Cliente = {
  cliente_id: string;
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  documento_mascarado: string | null;
  ja_vinculado_ao_parceiro: boolean;
};
type Vinculo = { cliente_id: string; assignment_type: string; can_create_simulation: boolean; can_monitor: boolean };

const ASSIGNMENT_TYPES = [
  { value: "monitoramento", label: "Monitoramento" },
  { value: "tecnico", label: "Técnico" },
  { value: "comercial", label: "Comercial" },
  { value: "gestao", label: "Gestão" },
];

export default function UsuariosClientesB2B() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [userSel, setUserSel] = useState<string>("");
  const [papelFiltro, setPapelFiltro] = useState<"todos" | "gestor" | "tecnico">("todos");
  const [busca, setBusca] = useState("");
  const [assignmentType, setAssignmentType] = useState<string>("monitoramento");

  // Lista usuários B2B do parceiro (via partner_users + profiles, casando por user_id)
  const { data: usuarios = [] } = useQuery({
    queryKey: ["b2b-partner-users", partner?.id],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data: pu, error } = await supabase
        .from("partner_users")
        .select("user_id, papel")
        .eq("partner_id", partner.id);
      if (error) throw error;
      const ids = (pu ?? []).map((p) => p.user_id);
      if (ids.length === 0) return [] as Usuario[];
      const byId = await fetchProfilesByUserIds(ids);
      return (pu ?? []).map((p: any) => {
        const prof = byId.get(p.user_id);
        return {
          user_id: p.user_id,
          nome: prof?.nome ?? null,
          email: prof?.email ?? null,
          papel: p.papel,
        };
      }) as Usuario[];
    },
  });


  const usuariosFiltrados = useMemo(() => {
    if (papelFiltro === "todos") return usuarios;
    return usuarios.filter((u) => u.papel === papelFiltro);
  }, [usuarios, papelFiltro]);

  // Lista clientes do parceiro disponíveis para vínculo (via RPC segura)
  const { data: clientes = [] } = useQuery({
    queryKey: ["b2b-partner-clientes-assign", partner?.id, busca],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_partner_clients_for_assignment_secure", {
        p_search: busca || null,
      });
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  // Vínculos ativos do usuário selecionado
  const { data: vinculos = [] } = useQuery({
    queryKey: ["b2b-user-vinculos", userSel],
    enabled: !!userSel,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_user_clients_secure", {
        p_user_id: userSel,
        p_search: null,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        cliente_id: r.cliente_id,
        assignment_type: r.assignment_type,
        can_create_simulation: r.can_create_simulation,
        can_monitor: r.can_monitor,
      })) as Vinculo[];
    },
  });

  const vinculosDoUser = useMemo(() => new Set(vinculos.map((v) => v.cliente_id)), [vinculos]);

  const link = useMutation({
    mutationFn: async ({ cliente_id, linked }: { cliente_id: string; linked: boolean }) => {
      if (!userSel) throw new Error("Selecione um usuário");
      if (linked) {
        const { error } = await (supabase.rpc as any)("unassign_b2b_user_client_secure", {
          p_user_id: userSel,
          p_cliente_id: cliente_id,
          p_reason: null,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase.rpc as any)("assign_b2b_user_client_secure", {
          p_user_id: userSel,
          p_cliente_id: cliente_id,
          p_assignment_type: assignmentType,
          p_can_create_simulation: true,
          p_can_monitor: true,
          p_notes: null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["b2b-user-vinculos", userSel] });
      qc.invalidateQueries({ queryKey: ["b2b-partner-clientes-assign", partner?.id] });
      toast.success("Vínculo atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const contagemPorUser = useMemo(() => {
    // Sem RPC agregada, esse contador aparece apenas para o usuário selecionado.
    const m = new Map<string, number>();
    if (userSel) m.set(userSel, vinculos.length);
    return m;
  }, [vinculos, userSel]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Usuários B2B × Clientes/Produtores
        </h1>
        <p className="text-sm text-muted-foreground">
          Vincule qualquer usuário B2B (gestor ou técnico) aos clientes/produtores do parceiro.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4" /> Usuários da equipe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(["todos", "gestor", "tecnico"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={papelFiltro === p ? "default" : "outline"}
                onClick={() => setPapelFiltro(p)}
              >
                {p === "todos" ? "Todos" : p === "gestor" ? "Gestores" : "Técnicos"}
              </Button>
            ))}
          </div>
          {usuariosFiltrados.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {usuariosFiltrados.map((u) => (
                <Button
                  key={u.user_id}
                  size="sm"
                  variant={userSel === u.user_id ? "default" : "outline"}
                  onClick={() => setUserSel(u.user_id)}
                >
                  {displayPartnerUserName(u.nome || u.email ? { user_id: u.user_id, nome: u.nome, email: u.email } : undefined, u.user_id)}
                  <Badge variant="secondary" className="ml-2">{u.papel}</Badge>
                  {contagemPorUser.has(u.user_id) && (
                    <Badge variant="outline" className="ml-1">{contagemPorUser.get(u.user_id)}</Badge>
                  )}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {userSel && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Clientes/Produtores do parceiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Buscar por nome..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="flex-1"
              />
              <Select value={assignmentType} onValueChange={setAssignmentType}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="divide-y max-h-[60vh] overflow-y-auto border rounded-md">
              {clientes.map((c) => {
                const linked = vinculosDoUser.has(c.cliente_id);
                return (
                  <div key={c.cliente_id} className="p-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {c.nome_fantasia || c.razao_social || c.nome || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[c.cidade, c.estado].filter(Boolean).join(" / ") || "—"}
                        {c.documento_mascarado ? ` · ${c.documento_mascarado}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={linked ? "outline" : "default"}
                      disabled={link.isPending}
                      onClick={() => link.mutate({ cliente_id: c.cliente_id, linked })}
                    >
                      {linked ? (
                        <><Link2Off className="h-3.5 w-3.5 mr-1" />Desvincular</>
                      ) : (
                        <><Link2 className="h-3.5 w-3.5 mr-1" />Vincular</>
                      )}
                    </Button>
                  </div>
                );
              })}
              {clientes.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Nenhum cliente vinculado ao parceiro. Solicite à Cultivo Farm o vínculo de produtores.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
