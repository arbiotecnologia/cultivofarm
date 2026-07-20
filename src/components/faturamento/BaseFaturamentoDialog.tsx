import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Beaker, Calculator, Receipt } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { brl } from "@/lib/financial/format";

interface BaseFaturamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  osId: string;
  osTipo: 'TRADICIONAL' | 'ON_FARM';
  initialData?: any;
  onSuccess: () => void;
}

export function BaseFaturamentoDialog({ open, onOpenChange, osId, osTipo, initialData, onSuccess }: BaseFaturamentoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [osData, setOsData] = useState<any>(null);
  const [form, setForm] = useState({
    modelo_precificacao: "HA",
    area_hectares_snapshot: 0,
    volume_total_ml_snapshot: 0,
    valor_ha_snapshot: 0,
    desconto_valor: 0,
    acrescimo_valor: 0,
    condicao_pagamento_snapshot: "",
    numero_parcelas_sugerido: 1,
    primeiro_vencimento_sugerido: "",
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          modelo_precificacao: initialData.modelo_precificacao,
          area_hectares_snapshot: initialData.area_hectares_snapshot,
          volume_total_ml_snapshot: initialData.volume_total_ml_snapshot,
          valor_ha_snapshot: initialData.valor_ha_snapshot,
          desconto_valor: initialData.desconto_valor,
          acrescimo_valor: initialData.acrescimo_valor,
          condicao_pagamento_snapshot: initialData.condicao_pagamento_snapshot || "",
          numero_parcelas_sugerido: initialData.numero_parcelas_sugerido,
          primeiro_vencimento_sugerido: initialData.primeiro_vencimento_sugerido || "",
        });
      } else {
        fetchOSData();
      }
    }
  }, [open, initialData]);

  const fetchOSData = async () => {
    const table = osTipo === 'ON_FARM' ? 'ordens_servico_onfarm' : 'ordens_servico';
    const { data, error } = await supabase
      .from(table as any)
      .select('*, clientes(id, nome), produtos(id, nome, preco_base_ha), microrganismos(id, nome)')
      .eq('id', osId)
      .single();

    if (error) {
      toast.error("Erro ao carregar dados da OS");
      return;
    }

    const os = data as any;
    setOsData(os);
    setForm(prev => ({
      ...prev,
      area_hectares_snapshot: os.area_hectares || 0,
      volume_total_ml_snapshot: os.volume_total_ml || 0,
      valor_ha_snapshot: os.produtos?.preco_base_ha || 0,
    }));
  };

  const subtotal = form.modelo_precificacao === 'HA' 
    ? form.area_hectares_snapshot * form.valor_ha_snapshot 
    : 0;

  const total = subtotal - form.desconto_valor + form.acrescimo_valor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ordem_servico_id: osId,
        origem_os_tipo: osTipo,
        cliente_id: osData?.cliente_id || initialData?.cliente_id,
        produto_id: osData?.produto_id || initialData?.produto_id,
        ...form,
        subtotal,
        valor_total_faturavel: total,
      };

      let error;
      if (initialData) {
        const { error: err } = await supabase
          .from('os_faturamento_base')
          .update(payload as any)
          .eq('id', initialData.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('os_faturamento_base')
          .insert([payload] as any);
        error = err;
      }

      if (error) throw error;

      toast.success(initialData ? "Base de faturamento atualizada!" : "Base de faturamento criada!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            {initialData ? "Editar Base de Faturamento" : "Configurar Base de Faturamento"}
            {osData?.numero_os && (
              <span className="text-xs font-mono text-muted-foreground ml-2">· {osData.numero_os}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30 border">
            <div className="space-y-2">
              <Label>Modelo de Precificação</Label>
              <Select 
                value={form.modelo_precificacao} 
                onValueChange={(v) => setForm({...form, modelo_precificacao: v})}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HA">Por Hectare (HA)</SelectItem>
                  <SelectItem value="FIXO">Valor Fixo / Protocolo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor por Hectare</Label>
              <MoneyInput 
                value={form.valor_ha_snapshot} 
                onValueChange={(v) => setForm({...form, valor_ha_snapshot: v})}
                disabled={form.modelo_precificacao !== 'HA'}
              />
            </div>

            <div className="space-y-2">
              <Label>Área Snapshot (ha)</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={form.area_hectares_snapshot} 
                onChange={(e) => setForm({...form, area_hectares_snapshot: Number(e.target.value)})}
              />
            </div>

            <div className="space-y-2">
              <Label>Volume Snapshot (mL)</Label>
              <Input 
                type="number" 
                value={form.volume_total_ml_snapshot} 
                onChange={(e) => setForm({...form, volume_total_ml_snapshot: Number(e.target.value)})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desconto</Label>
              <MoneyInput 
                value={form.desconto_valor} 
                onValueChange={(v) => setForm({...form, desconto_valor: v})}
              />
            </div>
            <div className="space-y-2">
              <Label>Acréscimo</Label>
              <MoneyInput 
                value={form.acrescimo_valor} 
                onValueChange={(v) => setForm({...form, acrescimo_valor: v})}
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Condições de Pagamento
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Condição de Pagamento</Label>
                <Input 
                  placeholder="Ex: 30/60 dias" 
                  value={form.condicao_pagamento_snapshot} 
                  onChange={(e) => setForm({...form, condicao_pagamento_snapshot: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input 
                    type="number" 
                    min="1" 
                    value={form.numero_parcelas_sugerido} 
                    onChange={(e) => setForm({...form, numero_parcelas_sugerido: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>1º Vencimento</Label>
                  <Input 
                    type="date" 
                    value={form.primeiro_vencimento_sugerido} 
                    onChange={(e) => setForm({...form, primeiro_vencimento_sugerido: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono-data">{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-primary pt-1 border-t border-primary/10">
              <span>Total Faturável:</span>
              <span className="font-mono-data">{brl(total)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : (initialData ? "Salvar Alterações" : "Gerar Base de Faturamento")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
