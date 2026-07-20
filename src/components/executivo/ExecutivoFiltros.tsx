import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  filtros: ExecutivoFiltros;
  onChange: (next: ExecutivoFiltros) => void;
}

export function ExecutivoFiltros({ filtros, onChange }: Props) {
  const [clientes, setClientes] = useState<{ id: string; razao_social: string }[]>([]);
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, razao_social")
      .order("razao_social")
      .limit(200)
      .then(({ data }) => setClientes((data as any) ?? []));
  }, []);

  useEffect(() => {
    let q = supabase.from("fazendas").select("id, nome").order("nome").limit(200);
    if (filtros.cliente_id) q = q.eq("cliente_id", filtros.cliente_id);
    q.then(({ data }) => setFazendas((data as any) ?? []));
  }, [filtros.cliente_id]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-card">
      <div>
        <Label className="text-xs">Período</Label>
        <Select value={filtros.periodo ?? "30_dias"} onValueChange={(v) => onChange({ ...filtros, periodo: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7_dias">Últimos 7 dias</SelectItem>
            <SelectItem value="15_dias">Últimos 15 dias</SelectItem>
            <SelectItem value="30_dias">Últimos 30 dias</SelectItem>
            <SelectItem value="safra_atual">Safra atual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Cliente</Label>
        <Select
          value={filtros.cliente_id ?? "all"}
          onValueChange={(v) => onChange({ ...filtros, cliente_id: v === "all" ? undefined : v, fazenda_id: undefined })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Fazenda</Label>
        <Select
          value={filtros.fazenda_id ?? "all"}
          onValueChange={(v) => onChange({ ...filtros, fazenda_id: v === "all" ? undefined : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {fazendas.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Status operacional</Label>
        <Select
          value={filtros.status_operacional ?? "all"}
          onValueChange={(v) => onChange({ ...filtros, status_operacional: v === "all" ? undefined : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="atrasado">Atrasados</SelectItem>
            <SelectItem value="critico">Críticos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
