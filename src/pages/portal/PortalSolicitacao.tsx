import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { unmask } from "@/lib/masks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";

const TIPOS = ["Praga", "Doença", "Planta Daninha", "Nematoide", "Solo", "Nutrição Biológica", "Manejo Preventivo", "Outro"];
const URGENCIAS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];

export default function PortalSolicitacao() {
  const { clienteId, loading: cl } = usePortalCliente();
  const { user } = useAuth();
  const fence = useStorageAccessScope(`producer-request:${clienteId}`);
  const { toast } = useToast();
  const [form, setForm] = useState({
    fazenda_id: "", talhao_id: "", tipo_demanda: "", descricao: "", urgencia: "media",
    solicitante_nome: "", solicitante_contato: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: fazendas = [] } = useScopedPortalQuery({
    queryKey: ["portal-request-farms", clienteId], enabled: !!clienteId,
    queryFn: async signal => {
      const { data, error } = await supabase.from("fazendas").select("id, nome").eq("cliente_id", clienteId ?? "").abortSignal(signal);
      if (error) throw error; return data || [];
    }
  });
  const { data: talhoes = [] } = useScopedPortalQuery({
    queryKey: ["portal-request-fields", clienteId, form.fazenda_id],
    enabled: !!clienteId && fazendas.some(f => f.id === form.fazenda_id),
    queryFn: async signal => {
      const { data, error } = await supabase.from("talhoes").select("id, nome").eq("fazenda_id", form.fazenda_id).abortSignal(signal);
      if (error) throw error; return data || [];
    }
  });
  useEffect(() => {
    setForm({ fazenda_id: "", talhao_id: "", tipo_demanda: "", descricao: "", urgencia: "media", solicitante_nome: "", solicitante_contato: "" });
    setSaving(false);
  }, [fence.scope]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !user || !fence.ready || saving) return;
    if (form.fazenda_id && !fazendas.some(f => f.id === form.fazenda_id)) return;
    if (form.talhao_id && !talhoes.some(t => t.id === form.talhao_id)) return;
    const current = fence.capture();
    setSaving(true);
    const { error } = await supabase.from("portal_solicitacoes").insert({
      cliente_id: clienteId,
      user_id: user.id,
      fazenda_id: form.fazenda_id || null,
      talhao_id: form.talhao_id || null,
      tipo_demanda: form.tipo_demanda,
      descricao: form.descricao,
      urgencia: form.urgencia,
      solicitante_nome: form.solicitante_nome || null,
      solicitante_contato: unmask(form.solicitante_contato) || null,
    });
    if (!current()) return;
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Solicitação enviada!", description: "A equipe Cultivo Farm receberá sua solicitação em breve." });
      setForm({ fazenda_id: "", talhao_id: "", tipo_demanda: "", descricao: "", urgencia: "media", solicitante_nome: "", solicitante_contato: "" });
    }
  };

  if (cl) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Solicitar Atendimento</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" /> Nova Solicitação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Solicitante</Label>
                <Input value={form.solicitante_nome} onChange={(e) => setForm({ ...form, solicitante_nome: e.target.value })} placeholder="Nome de quem está pedindo" />
              </div>
              <div className="space-y-2">
                <Label>Telefone para Contato</Label>
                <MaskedInput mask="telefone" value={form.solicitante_contato} onChange={(e) => setForm({ ...form, solicitante_contato: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fazenda</Label>
                <Select value={form.fazenda_id} onValueChange={(v) => setForm({ ...form, fazenda_id: v, talhao_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{fazendas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Talhão</Label>
                <Select value={form.talhao_id} onValueChange={(v) => setForm({ ...form, talhao_id: v })} disabled={!talhoes.length}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{talhoes.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Demanda *</Label>
                <Select value={form.tipo_demanda} onValueChange={(v) => setForm({ ...form, tipo_demanda: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Urgência</Label>
                <Select value={form.urgencia} onValueChange={(v) => setForm({ ...form, urgencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{URGENCIAS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva o problema ou necessidade..." rows={4} />
            </div>
            <Button type="submit" disabled={saving || !form.tipo_demanda} className="w-full sm:w-auto">
              {saving ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
