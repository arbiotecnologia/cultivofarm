import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, UserPlus, Loader2, X, Search } from "lucide-react";

type Assignment = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  assigned_at: string;
  profile?: { nome: string | null; email: string | null } | null;
};

const ROLES = [
  { value: "tecnico", label: "Técnico" },
  { value: "assistente", label: "Assistente" },
  { value: "observador", label: "Observador" },
];

export function EquipeVisitaCard({ registroId, canManage }: { registroId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("tecnico");
  const [selectedUser, setSelectedUser] = useState<{ id: string; label: string } | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["visit-team", registroId],
    enabled: !!registroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technical_visit_assignments")
        .select("id,user_id,role,is_active,assigned_at")
        .eq("registro_consultor_id", registroId)
        .eq("is_active", true)
        .order("assigned_at", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as Assignment[];
      if (rows.length === 0) return rows;
      const ids = rows.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,nome,email")
        .in("user_id", ids);
      const map = new Map((profs || []).map((p: any) => [p.user_id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) || null }));
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["visit-team-search", search],
    enabled: canManage && search.trim().length >= 2,
    queryFn: async () => {
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,nome,email")
        .or(`nome.ilike.${term},email.ilike.${term}`)
        .limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  const assign = useMutation({
    mutationFn: async ({ userId, roleValue }: { userId: string; roleValue: string }) => {
      const { data, error } = await supabase.rpc("rpc_assign_visit_technician" as any, {
        p_registro_id: registroId,
        p_user_id: userId,
        p_role: roleValue,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.reactivated ? "Técnico reativado" : "Técnico atribuído");
      setSelectedUser(null);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["visit-team", registroId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atribuir"),
  });

  const remove = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("rpc_remove_visit_technician" as any, {
        p_registro_id: registroId,
        p_user_id: userId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Técnico removido");
      qc.invalidateQueries({ queryKey: ["visit-team", registroId] });
    },
    onError: (e: any) => {
      const msg = e?.message || "";
      if (msg.includes("remocao_bloqueada_presenca_ativa")) {
        toast.error("Técnico com presença ativa — utilize o fluxo administrativo (checkout forçado) antes de remover.");
      } else if (msg.includes("motivo_remocao_obrigatorio")) {
        toast.error("Motivo é obrigatório para remoção.");
      } else {
        toast.error(msg || "Erro ao remover");
      }
    },
  });

  const promptRemove = (userId: string) => {
    const reason = window.prompt("Motivo da remoção do técnico:");
    if (!reason || !reason.trim()) return;
    remove.mutate({ userId, reason: reason.trim() });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-medium text-sm">Equipe da visita</h3>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
        </div>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum técnico atribuído.</p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary" className="text-[10px] uppercase">{a.role}</Badge>
                <span className="truncate">
                  {a.profile?.nome || a.profile?.email || a.user_id.slice(0, 8)}
                </span>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => promptRemove(a.user_id)}
                  disabled={remove.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Adicionar técnico</span>
          </div>
          <div className="relative">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-7 h-8 text-sm"
              placeholder="Buscar por nome ou e-mail…"
              value={selectedUser?.label ?? search}
              onChange={(e) => {
                setSelectedUser(null);
                setSearch(e.target.value);
              }}
            />
            {!selectedUser && search.trim().length >= 2 && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                {searchResults.map((p: any) => (
                  <button
                    key={p.user_id}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => setSelectedUser({ id: p.user_id, label: p.nome || p.email || p.user_id })}
                  >
                    <div className="truncate">{p.nome || "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 text-sm w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="flex-1"
              disabled={!selectedUser || assign.isPending}
              onClick={() => selectedUser && assign.mutate({ userId: selectedUser.id, roleValue: role })}
            >
              {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atribuir"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
