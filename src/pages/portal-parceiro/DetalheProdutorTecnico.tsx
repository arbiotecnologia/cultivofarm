import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FlaskConical, MapPin, Phone, Mail, User } from "lucide-react";
import { format } from "date-fns";

type Detail = {
  cliente_id: string;
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo_pessoa: string | null;
  documento_mascarado: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
  logradouro: string | null;
  observacoes: string | null;
  total_simulacoes: number;
  ultima_simulacao_at: string | null;
};

type Sim = {
  id: string;
  titulo: string | null;
  status: string;
  total_cheio: number | null;
  created_at: string;
};

export default function DetalheProdutorTecnico() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["b2b-user-cliente-detail", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_user_client_detail_secure", {
        p_cliente_id: clienteId!,
        p_scope: "meus_produtores",
      });
      if (error) throw error;
      return (data?.[0] ?? null) as Detail | null;
    },
  });

  const { data: sims = [] } = useQuery({
    queryKey: ["b2b-user-cliente-sims", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_b2b_user_client_simulations_secure", {
        p_cliente_id: clienteId!,
      });
      if (error) throw error;
      return (data ?? []) as Sim[];
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Produtor não encontrado ou você não tem acesso a este cliente.
          </CardContent>
        </Card>
      </div>
    );
  }

  const nome = data.nome_fantasia || data.razao_social || data.nome || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> {nome}
          </h1>
        </div>
        <Button onClick={() => navigate(`/portal-parceiro/simulador?clienteId=${data.cliente_id}`)}>
          <FlaskConical className="h-4 w-4 mr-1" /> Nova simulação
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados básicos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.razao_social && <div><span className="text-muted-foreground">Razão social:</span> {data.razao_social}</div>}
            {data.documento_mascarado && <div><span className="text-muted-foreground">Documento:</span> {data.documento_mascarado}</div>}
            {data.telefone && (
              <div className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {data.telefone}</div>
            )}
            {data.email && (
              <div className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {data.email}</div>
            )}
            {(data.cidade || data.estado || data.bairro || data.logradouro) && (
              <div className="flex items-start gap-1">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <span>
                  {[data.logradouro, data.bairro].filter(Boolean).join(", ")}
                  {(data.logradouro || data.bairro) && (data.cidade || data.estado) && " — "}
                  {[data.cidade, data.estado].filter(Boolean).join(" / ")}
                </span>
              </div>
            )}
            {data.observacoes && (
              <div className="pt-2 border-t">
                <div className="text-muted-foreground text-xs mb-1">Observações</div>
                <div className="whitespace-pre-wrap">{data.observacoes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Atividade técnica</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Total de simulações:</span> {data.total_simulacoes}</div>
            <div>
              <span className="text-muted-foreground">Última simulação:</span>{" "}
              {data.ultima_simulacao_at ? format(new Date(data.ultima_simulacao_at), "dd/MM/yyyy HH:mm") : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de simulações</CardTitle></CardHeader>
        <CardContent>
          {sims.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma simulação registrada para este produtor.</div>
          ) : (
            <div className="divide-y">
              {sims.map((s) => (
                <div key={s.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.titulo || "Simulação"}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "dd/MM/yyyy HH:mm")} · {s.status}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {s.total_cheio != null && (
                      <div className="tabular-nums">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(s.total_cheio))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Valores exibidos são valores de tabela, sem desconto. Condições comerciais finais são aplicadas pelo gestor B2B.
      </p>
    </div>
  );
}
