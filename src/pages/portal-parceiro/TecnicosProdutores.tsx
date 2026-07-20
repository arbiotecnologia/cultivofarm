import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Link2, Link2Off } from "lucide-react";

type Tecnico = { user_id: string; nome: string | null; email: string | null };
type Cliente = { id: string; nome: string | null; razao_social: string | null; nome_fantasia: string | null; endereco_municipio: string | null; endereco_estado: string | null };
type Vinculo = { id: string; technician_user_id: string; cliente_id: string; active: boolean };

export default function TecnicosProdutores() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tecSel, setTecSel] = useState<string>("");
  const [busca, setBusca] = useState("");

  const { data: tecnicos = [] } = useQuery({
    queryKey: ["b2b-partner-tecnicos", partner?.id],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data: pu, error } = await supabase
        .from("partner_users")
        .select("user_id, papel")
        .eq("partner_id", partner.id);
      if (error) throw error;
      const ids = (pu ?? []).map((p: any) => p.user_id);
      if (ids.length === 0) return [] as Tecnico[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .in("id", ids);
      // Somente técnicos (papel do partner_user ou role global) — mostra todos os users do parceiro
      return (profs ?? []).map((p: any) => ({ user_id: p.id, nome: p.nome, email: p.email })) as Tecnico[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["b2b-partner-clientes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, razao_social, nome_fantasia, endereco_municipio, endereco_estado")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  const { data: vinculos = [] } = useQuery({
    queryKey: ["b2b-partner-vinculos", partner?.id],
    enabled: !!partner?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_technician_clients")
        .select("id, technician_user_id, cliente_id, active")
        .eq("partner_id", partner.id);
      if (error) throw error;
      return (data ?? []) as Vinculo[];
    },
  });

  const vinculosDoTec = useMemo(() => {
    const set = new Set(vinculos.filter((v) => v.active && v.technician_user_id === tecSel).map((v) => v.cliente_id));
    return set;
  }, [vinculos, tecSel]);

  const filteredClientes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (!q) return true;
      const nome = (c.nome_fantasia || c.razao_social || c.nome || "").toLowerCase();
      return nome.includes(q) || (c.endereco_municipio || "").toLowerCase().includes(q);
    });
  }, [clientes, busca]);

  const link = useMutation({
    mutationFn: async ({ cliente_id, current }: { cliente_id: string; current: Vinculo | undefined }) => {
      if (!partner?.id || !tecSel) throw new Error("Selecione um técnico");
      if (current) {
        const { error } = await supabase
          .from("partner_technician_clients")
          .update({ active: !current.active })
          .eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("partner_technician_clients")
          .insert({
            partner_id: partner.id,
            technician_user_id: tecSel,
            cliente_id,
            assigned_by: user?.id,
            active: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["b2b-partner-vinculos", partner?.id] });
      toast.success("Vínculo atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar vínculo"),
  });

  const contagemPorTecnico = useMemo(() => {
    const m = new Map<string, number>();
    vinculos.filter((v) => v.active).forEach((v) => m.set(v.technician_user_id, (m.get(v.technician_user_id) ?? 0) + 1));
    return m;
  }, [vinculos]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Técnicos × Produtores
        </h1>
        <p className="text-sm text-muted-foreground">
          Vincule técnicos B2B aos produtores/clientes que eles podem atender.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Técnicos da equipe</CardTitle></CardHeader>
        <CardContent>
          {tecnicos.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum técnico cadastrado no seu parceiro.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tecnicos.map((t) => (
                <Button
                  key={t.user_id}
                  size="sm"
                  variant={tecSel === t.user_id ? "default" : "outline"}
                  onClick={() => setTecSel(t.user_id)}
                >
                  {t.nome || t.email || t.user_id.slice(0, 8)}
                  <Badge variant="secondary" className="ml-2">{contagemPorTecnico.get(t.user_id) ?? 0}</Badge>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {tecSel && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtores/Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar por nome ou cidade..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="divide-y max-h-[60vh] overflow-y-auto border rounded-md">
              {filteredClientes.map((c) => {
                const linked = vinculosDoTec.has(c.id);
                const current = vinculos.find((v) => v.technician_user_id === tecSel && v.cliente_id === c.id);
                return (
                  <div key={c.id} className="p-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {c.nome_fantasia || c.razao_social || c.nome || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[c.endereco_municipio, c.endereco_estado].filter(Boolean).join(" / ") || "—"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={linked ? "outline" : "default"}
                      disabled={link.isPending}
                      onClick={() => link.mutate({ cliente_id: c.id, current })}
                    >
                      {linked ? <><Link2Off className="h-3.5 w-3.5 mr-1" />Desvincular</> : <><Link2 className="h-3.5 w-3.5 mr-1" />Vincular</>}
                    </Button>
                  </div>
                );
              })}
              {filteredClientes.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">Nenhum cliente encontrado.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
