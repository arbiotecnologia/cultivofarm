import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Thermometer, Droplets, CloudRain, Wind, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function DashboardClimatico() {
  const [open, setOpen] = useState(false);
  const [fazendaId, setFazendaId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ temperatura: "", umidade: "", chuva_mm: "", vento_kmh: "", radiacao_solar: "" });

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fazendas").select("id, nome, latitude, longitude").order("nome");
      return data ?? [];
    },
  });

  const { data: climaData, refetch } = useQuery({
    queryKey: ["clima_dados", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data } = await (supabase as any)
        .from("clima_dados")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .gte("data_hora", sevenDaysAgo.toISOString())
        .order("data_hora", { ascending: true });
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const chartData = (climaData ?? []).map((d: any) => ({
    data: new Date(d.data_hora).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    temperatura: Number(d.temperatura) || 0,
    umidade: Number(d.umidade) || 0,
    chuva: Number(d.chuva_mm) || 0,
    vento: Number(d.vento_kmh) || 0,
  }));

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const tempMedia = avg(chartData.map(d => d.temperatura));
  const umidMedia = avg(chartData.map(d => d.umidade));
  const chuvaAcum = chartData.reduce((s, d) => s + d.chuva, 0);
  const ventoMedia = avg(chartData.map(d => d.vento));

  const selectedFazenda = (fazendas ?? []).find(f => f.id === fazendaId);
  const hasCoords = selectedFazenda?.latitude && selectedFazenda?.longitude;

  const handleSync = async () => {
    if (!fazendaId) { toast.error("Selecione uma fazenda"); return; }
    if (!hasCoords) { toast.error("Fazenda sem coordenadas cadastradas. Atualize latitude e longitude na página de Fazendas."); return; }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-clima", {
        body: { fazenda_id: fazendaId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`Dados sincronizados: ${data.registros} registros de ${data.periodo}`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao sincronizar dados climáticos");
    } finally {
      setSyncing(false);
    }
  };

  const handleInsert = async () => {
    if (!fazendaId) { toast.error("Selecione uma fazenda"); return; }
    const { error } = await (supabase as any).from("clima_dados").insert({
      fazenda_id: fazendaId,
      temperatura: form.temperatura ? Number(form.temperatura) : null,
      umidade: form.umidade ? Number(form.umidade) : null,
      chuva_mm: form.chuva_mm ? Number(form.chuva_mm) : 0,
      vento_kmh: form.vento_kmh ? Number(form.vento_kmh) : null,
      radiacao_solar: form.radiacao_solar ? Number(form.radiacao_solar) : null,
    });
    if (error) { toast.error("Erro ao salvar dados climáticos"); return; }
    toast.success("Dados climáticos registrados");
    setForm({ temperatura: "", umidade: "", chuva_mm: "", vento_kmh: "", radiacao_solar: "" });
    setOpen(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="w-64">
          <Select value={fazendaId} onValueChange={setFazendaId}>
            <SelectTrigger><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
            <SelectContent>
              {(fazendas ?? []).map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome} {f.latitude && f.longitude ? "" : " (sem coordenadas)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={!fazendaId || syncing || !hasCoords}
            title={!hasCoords ? "Cadastre latitude/longitude da fazenda primeiro" : "Buscar dados climáticos automáticos via Open-Meteo"}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Clima"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Inserir Manual</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Dados Climáticos</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Temperatura (°C)</Label><Input type="number" value={form.temperatura} onChange={e => setForm(p => ({ ...p, temperatura: e.target.value }))} /></div>
                <div><Label>Umidade (%)</Label><Input type="number" value={form.umidade} onChange={e => setForm(p => ({ ...p, umidade: e.target.value }))} /></div>
                <div><Label>Chuva (mm)</Label><Input type="number" value={form.chuva_mm} onChange={e => setForm(p => ({ ...p, chuva_mm: e.target.value }))} /></div>
                <div><Label>Vento (km/h)</Label><Input type="number" value={form.vento_kmh} onChange={e => setForm(p => ({ ...p, vento_kmh: e.target.value }))} /></div>
                <div className="col-span-2"><Label>Radiação Solar</Label><Input type="number" value={form.radiacao_solar} onChange={e => setForm(p => ({ ...p, radiacao_solar: e.target.value }))} /></div>
              </div>
              <Button onClick={handleInsert} className="w-full mt-4">Salvar</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Coordinates info */}
      {fazendaId && !hasCoords && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="py-3 text-sm text-orange-700 dark:text-orange-400">
            ⚠️ Esta fazenda não possui coordenadas cadastradas. Atualize a latitude e longitude na página de <strong>Fazendas</strong> para habilitar a sincronização automática de dados climáticos.
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Thermometer className="h-4 w-4" />Temp. Média</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{tempMedia.toFixed(1)}°C</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Droplets className="h-4 w-4" />Umidade Média</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{umidMedia.toFixed(0)}%</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><CloudRain className="h-4 w-4" />Chuva Acum.</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{chuvaAcum.toFixed(1)} mm</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Wind className="h-4 w-4" />Vento Médio</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{ventoMedia.toFixed(1)} km/h</p></CardContent></Card>
      </div>

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle className="text-base">Temperatura e Umidade</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="temperatura" stroke="hsl(var(--destructive))" name="Temp (°C)" strokeWidth={2} />
                <Line type="monotone" dataKey="umidade" stroke="hsl(var(--primary))" name="Umidade (%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Precipitação e Vento</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="chuva" stroke="hsl(210 80% 50%)" name="Chuva (mm)" strokeWidth={2} />
                <Line type="monotone" dataKey="vento" stroke="hsl(150 60% 40%)" name="Vento (km/h)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {fazendaId
            ? hasCoords
              ? "Nenhum dado climático nos últimos 7 dias. Clique em 'Sincronizar Clima' para buscar dados automáticos."
              : "Nenhum dado climático. Cadastre coordenadas ou use 'Inserir Manual'."
            : "Selecione uma fazenda para visualizar os dados climáticos."}
        </CardContent></Card>
      )}
    </div>
  );
}
