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
import {
  FONTE_AUTOMATICA,
  SYNC_TIMEOUT_MS,
  existeLeituraNoMesmoHorario,
  formatDataHoraSaoPaulo,
  formatDiaSaoPaulo,
  formatMetrica,
  horasDesde,
  mediaOuNulo,
  numeroOuNulo,
  rotuloFrescor,
  somaOuNulo,
  validarCoordenadas,
  validarLeituraManual,
  type FormClimaManual,
} from "@/lib/previsao/clima";

const FORM_INICIAL: FormClimaManual = {
  data_hora: "",
  temperatura: "",
  umidade: "",
  chuva_mm: "",
  vento_kmh: "",
  radiacao_solar: "",
};

export function DashboardClimatico() {
  const [open, setOpen] = useState(false);
  const [fazendaId, setFazendaId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormClimaManual>(FORM_INICIAL);

  const fazendasQuery = useQuery({
    queryKey: ["fazendas-clima"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fazendas").select("id, nome, latitude, longitude, municipio, estado").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const climaQuery = useQuery({
    queryKey: ["clima_dados", fazendaId],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await (supabase as any)
        .from("clima_dados")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .gte("data_hora", sevenDaysAgo.toISOString())
        .order("data_hora", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const climaData = climaQuery.data ?? [];

  const chartData = climaData.map((d: any) => ({
    data: formatDiaSaoPaulo(d.data_hora),
    temperatura: numeroOuNulo(d.temperatura),
    umidade: numeroOuNulo(d.umidade),
    chuva: numeroOuNulo(d.chuva_mm),
    vento: numeroOuNulo(d.vento_kmh),
  }));

  const tempMedia = mediaOuNulo(chartData.map((d) => d.temperatura));
  const umidMedia = mediaOuNulo(chartData.map((d) => d.umidade));
  const chuvaAcum = somaOuNulo(chartData.map((d) => d.chuva));
  const ventoMedia = mediaOuNulo(chartData.map((d) => d.vento));

  const ultima = climaData.length ? climaData[climaData.length - 1] : null;
  const frescor = rotuloFrescor(horasDesde(ultima?.data_hora));

  const selectedFazenda = (fazendasQuery.data ?? []).find((f: any) => f.id === fazendaId);
  const coords = selectedFazenda ? validarCoordenadas(selectedFazenda.latitude, selectedFazenda.longitude) : null;
  const hasCoords = coords?.ok === true;
  const missingCoords = selectedFazenda?.latitude == null || selectedFazenda?.longitude == null || (Number(selectedFazenda.latitude) === 0 && Number(selectedFazenda.longitude) === 0);
  const useCity = !!selectedFazenda && missingCoords && !!selectedFazenda.municipio?.trim() && !!selectedFazenda.estado?.trim();
  const canSync = hasCoords || useCity;

  const handleSync = async () => {
    if (syncing) return;
    if (!fazendaId) { toast.error("Selecione uma fazenda"); return; }
    if (!canSync) { toast.error("Cadastre coordenadas válidas ou cidade e estado na fazenda."); return; }
    setSyncing(true);
    try {
      const invoke = supabase.functions.invoke("sync-clima", { body: { fazenda_id: fazendaId } });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado ao sincronizar dados climáticos. Tente novamente.")), SYNC_TIMEOUT_MS)
      );
      const { data, error } = (await Promise.race([invoke, timeout])) as any;
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`Dados de ${FONTE_AUTOMATICA} sincronizados: ${data?.registros ?? 0} registros (${data?.periodo ?? "período informado pela fonte"})${data?.localizacao?.origem === "cidade" ? ` · ${data.localizacao.descricao}` : ""}`);
      await climaQuery.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao sincronizar dados climáticos");
    } finally {
      setSyncing(false);
    }
  };

  const handleInsert = async () => {
    if (saving) return;
    if (!fazendaId) { toast.error("Selecione uma fazenda"); return; }
    const validacao = validarLeituraManual(form);
    if (!validacao.ok || !validacao.leitura) { toast.error(validacao.erro ?? "Dados inválidos"); return; }
    if (existeLeituraNoMesmoHorario(climaData, validacao.leitura.data_hora)) {
      toast.error("Já existe leitura registrada para esta fazenda neste horário.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("clima_dados").insert({
        fazenda_id: fazendaId,
        ...validacao.leitura,
      });
      if (error) throw error;
      toast.success("Dados climáticos registrados");
      setForm(FORM_INICIAL);
      setOpen(false);
      await climaQuery.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar dados climáticos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="w-64">
          <Select value={fazendaId} onValueChange={setFazendaId}>
            <SelectTrigger aria-label="Selecionar fazenda"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
            <SelectContent>
              {(fazendasQuery.data ?? []).map((f: any) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}{validarCoordenadas(f.latitude, f.longitude).ok ? "" : " (sem coordenadas)"}
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
            disabled={!fazendaId || syncing || !canSync}
            title={!canSync ? "Cadastre coordenadas ou cidade e estado da fazenda" : useCity ? `Buscar clima de ${selectedFazenda.municipio}/${selectedFazenda.estado}` : `Buscar dados climáticos automáticos via ${FONTE_AUTOMATICA}`}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Clima"}
          </Button>
          <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!fazendaId}><Plus className="h-4 w-4 mr-1" /> Inserir Manual</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Dados Climáticos</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="clima-data">Data e hora da medição</Label>
                  <Input id="clima-data" type="datetime-local" value={form.data_hora} onChange={e => setForm(p => ({ ...p, data_hora: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Deixe em branco para usar o momento atual. Não são aceitas datas futuras.</p>
                </div>
                <div><Label htmlFor="clima-temp">Temperatura (°C)</Label><Input id="clima-temp" type="number" value={form.temperatura} onChange={e => setForm(p => ({ ...p, temperatura: e.target.value }))} /></div>
                <div><Label htmlFor="clima-umid">Umidade (%)</Label><Input id="clima-umid" type="number" min={0} max={100} value={form.umidade} onChange={e => setForm(p => ({ ...p, umidade: e.target.value }))} /></div>
                <div><Label htmlFor="clima-chuva">Chuva (mm)</Label><Input id="clima-chuva" type="number" min={0} value={form.chuva_mm} onChange={e => setForm(p => ({ ...p, chuva_mm: e.target.value }))} /></div>
                <div><Label htmlFor="clima-vento">Vento (km/h)</Label><Input id="clima-vento" type="number" min={0} value={form.vento_kmh} onChange={e => setForm(p => ({ ...p, vento_kmh: e.target.value }))} /></div>
                <div className="col-span-2"><Label htmlFor="clima-rad">Radiação Solar</Label><Input id="clima-rad" type="number" min={0} value={form.radiacao_solar} onChange={e => setForm(p => ({ ...p, radiacao_solar: e.target.value }))} /></div>
              </div>
              <Button onClick={handleInsert} disabled={saving} className="w-full mt-4">{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {fazendasQuery.isError && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 flex items-center justify-between gap-4 text-sm">
            <span>Não foi possível carregar as fazendas.</span>
            <Button size="sm" variant="outline" onClick={() => fazendasQuery.refetch()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {fazendaId && !canSync && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="py-3 text-sm text-orange-700 dark:text-orange-400">
            Cadastre coordenadas válidas ou cidade e estado da fazenda para sincronizar o clima.
          </CardContent>
        </Card>
      )}

      {useCity && (
        <p className="text-sm text-muted-foreground">Sem coordenadas da fazenda: o clima usará a localização de {selectedFazenda.municipio}/{selectedFazenda.estado}. Cadastre as coordenadas para maior precisão.</p>
      )}

      {fazendaId && (
        <p className="text-xs text-muted-foreground">
          Janela exibida: últimos 7 dias · Fuso America/São Paulo · Fonte automática: {FONTE_AUTOMATICA} · Última leitura: {ultima ? `${formatDataHoraSaoPaulo(ultima.data_hora)} (${frescor})` : "—"}
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Thermometer className="h-4 w-4" />Temp. Média</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMetrica(tempMedia, 1, "°C")}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Droplets className="h-4 w-4" />Umidade Média</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMetrica(umidMedia, 0, "%")}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><CloudRain className="h-4 w-4" />Chuva Acum.</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMetrica(chuvaAcum, 1, " mm")}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Wind className="h-4 w-4" />Vento Médio</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMetrica(ventoMedia, 1, " km/h")}</p></CardContent></Card>
      </div>

      {/* Charts */}
      {climaQuery.isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando dados climáticos...</CardContent></Card>
      ) : climaQuery.isError ? (
        <Card className="border-destructive/40"><CardContent className="py-8 text-center space-y-3">
          <p className="text-sm">Não foi possível carregar os dados climáticos desta fazenda.</p>
          <Button size="sm" variant="outline" onClick={() => climaQuery.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : chartData.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle className="text-base">Temperatura e Umidade</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="temperatura" stroke="hsl(var(--destructive))" name="Temp (°C)" strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="umidade" stroke="hsl(var(--primary))" name="Umidade (%)" strokeWidth={2} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Precipitação e Vento</CardTitle></CardHeader><CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="chuva" stroke="hsl(210 80% 50%)" name="Chuva (mm)" strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="vento" stroke="hsl(150 60% 40%)" name="Vento (km/h)" strokeWidth={2} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {fazendaId
            ? canSync
              ? "Nenhum dado climático nos últimos 7 dias. Clique em 'Sincronizar Clima' para buscar dados automáticos."
              : "Nenhum dado climático. Cadastre coordenadas ou cidade e estado, ou use 'Inserir Manual'."
            : "Selecione uma fazenda para visualizar os dados climáticos."}
        </CardContent></Card>
      )}
    </div>
  );
}
