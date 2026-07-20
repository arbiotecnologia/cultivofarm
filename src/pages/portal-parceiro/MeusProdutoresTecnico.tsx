import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, FlaskConical, User, Search, Eye } from "lucide-react";
import { format } from "date-fns";

type Row = {
  cliente_id: string;
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo_pessoa: string | null;
  documento_mascarado: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  ultima_simulacao_at: string | null;
  total_simulacoes: number;
  assigned_at: string | null;
};

export default function MeusProdutoresTecnico() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["b2b-user-clientes"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_user_clients_secure", {
        p_user_id: null,
        p_search: null,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter((r) => {
      const nome = (r.nome_fantasia || r.razao_social || r.nome || "").toLowerCase();
      const okQ = !q || nome.includes(q) || (r.cidade || "").toLowerCase().includes(q);
      const okUf = !uf || (r.estado || "").toLowerCase() === uf.toLowerCase();
      return okQ && okUf;
    });
  }, [data, busca, uf]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Meus Produtores B2B</h1>
        <p className="text-sm text-muted-foreground">
          Produtores/clientes vinculados ao seu usuário. Somente estes podem ser usados em simulações técnicas.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Input
          className="sm:w-24"
          placeholder="UF"
          maxLength={2}
          value={uf}
          onChange={(e) => setUf(e.target.value.toUpperCase())}
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {data.length === 0
              ? "Nenhum produtor vinculado ao seu usuário. Solicite ao gestor B2B o vínculo de produtores para iniciar simulações."
              : "Nenhum produtor encontrado com esses filtros."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const nome = r.nome_fantasia || r.razao_social || r.nome || "—";
            return (
              <Card key={r.cliente_id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-primary shrink-0" />
                      <div className="font-medium truncate">{nome}</div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {r.total_simulacoes} sim.
                    </Badge>
                  </div>

                  {(r.cidade || r.estado) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[r.cidade, r.estado].filter(Boolean).join(" / ")}
                    </div>
                  )}

                  {r.documento_mascarado && (
                    <div className="text-xs text-muted-foreground">Doc: {r.documento_mascarado}</div>
                  )}

                  {r.ultima_simulacao_at && (
                    <div className="text-xs text-muted-foreground">
                      Última simulação: {format(new Date(r.ultima_simulacao_at), "dd/MM/yyyy")}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => navigate(`/portal-parceiro/meus-produtores/${r.cliente_id}`)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/portal-parceiro/simulador?clienteId=${r.cliente_id}`)}
                    >
                      <FlaskConical className="h-3.5 w-3.5 mr-1" /> Simular
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
