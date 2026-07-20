import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, User, Navigation, Phone, Compass } from "lucide-react";
import { getGoogleMapsUrl } from "@/lib/geo";
import { formatTelefone } from "@/lib/masks";
import TalhoesFazendaTab from "@/components/fazendas/TalhoesFazendaTab";
import { Skeleton } from "@/components/ui/skeleton";

interface FazendaDetalhe {
  id: string;
  nome: string;
  codigo_referencia: string | null;
  municipio: string | null;
  estado: string | null;
  area_total: number | null;
  area_produtiva: number | null;
  latitude: number | null;
  longitude: number | null;
  tipo_exploracao: string | null;
  endereco_acesso: string | null;
  ponto_referencia: string | null;
  responsavel_local_nome: string | null;
  responsavel_local_telefone: string | null;
  distancia_sede_km: number | null;
  ativo?: boolean;
  clientes?: { nome: string; nome_fantasia?: string } | null;
  profiles?: { nome: string } | null;
}

export default function FazendaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "visao";

  const [fazenda, setFazenda] = useState<FazendaDetalhe | null>(null);
  const [talhoesCount, setTalhoesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: f }, { count }] = await Promise.all([
      supabase.from("fazendas").select("*, clientes(nome, nome_fantasia), profiles:consultor_responsavel_id(nome)").eq("id", id).maybeSingle(),
      supabase.from("talhoes").select("id", { count: "exact", head: true }).eq("fazenda_id", id),
    ]);
    setFazenda(f as any);
    setTalhoesCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleTabChange = (v: string) => {
    const sp = new URLSearchParams(searchParams);
    if (v === "visao") sp.delete("tab"); else sp.set("tab", v);
    setSearchParams(sp, { replace: true });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!fazenda) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/fazendas")}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Fazenda não encontrada.</CardContent></Card>
      </div>
    );
  }

  const clienteNome = fazenda.clientes?.nome_fantasia || fazenda.clientes?.nome || "—";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/fazendas")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Fazendas
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{fazenda.nome}</h1>
                {fazenda.codigo_referencia && (
                  <Badge variant="secondary" className="text-xs uppercase tracking-wider">
                    {fazenda.codigo_referencia}
                  </Badge>
                )}
                {fazenda.ativo === false && <Badge variant="destructive">Inativa</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {clienteNome}
                {fazenda.municipio ? ` • ${fazenda.municipio}/${fazenda.estado || ""}` : ""}
              </p>
            </div>
            {fazenda.latitude && fazenda.longitude && (
              <Button asChild variant="outline" size="sm">
                <a href={getGoogleMapsUrl(fazenda.latitude, fazenda.longitude)} target="_blank" rel="noreferrer">
                  <Navigation className="h-4 w-4 mr-2" /> Como chegar
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="talhoes">
            Talhões {talhoesCount > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{talhoesCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Localização</h3>
                <Info label="Município / UF" value={fazenda.municipio ? `${fazenda.municipio} / ${fazenda.estado || "—"}` : "—"} />
                <Info label="Endereço de acesso" value={fazenda.endereco_acesso} />
                <Info label="Ponto de referência" value={fazenda.ponto_referencia} />
                <Info label="Distância da sede" value={fazenda.distancia_sede_km ? `${fazenda.distancia_sede_km} km` : "—"} />
                {fazenda.latitude && fazenda.longitude && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Compass className="h-3 w-3" /> {fazenda.latitude.toFixed(5)}, {fazenda.longitude.toFixed(5)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Responsáveis</h3>
                <Info label="Cliente" value={clienteNome} />
                <Info label="Consultor responsável" value={fazenda.profiles?.nome} />
                <Info label="Responsável local" value={fazenda.responsavel_local_nome} />
                {fazenda.responsavel_local_telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatTelefone(fazenda.responsavel_local_telefone)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Áreas e exploração</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Área total" value={fazenda.area_total} suffix="ha" />
                  <Metric label="Área produtiva" value={fazenda.area_produtiva} suffix="ha" accent />
                  <Metric label="Talhões" value={talhoesCount} />
                  <Info inline label="Exploração" value={fazenda.tipo_exploracao} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="talhoes" className="mt-4">
          <TalhoesFazendaTab fazendaId={fazenda.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value, inline }: { label: string; value?: string | null; inline?: boolean }) {
  return (
    <div className={inline ? "" : "space-y-0.5"}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className="text-sm text-foreground font-medium">{value || "—"}</p>
    </div>
  );
}

function Metric({ label, value, suffix, accent }: { label: string; value: number | null; suffix?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={`text-lg font-bold ${accent ? "text-emerald-700" : "text-foreground"}`}>
        {value ?? "0"}{suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </div>
  );
}
