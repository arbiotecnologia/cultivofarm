import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BaseFaturamentoStatusBadge } from "./BaseFaturamentoStatusBadge";
import { BaseFaturamentoDialog } from "./BaseFaturamentoDialog";
import { 
  Receipt, 
  Plus, 
  Edit3, 
  CheckCircle2, 
  XCircle, 
  History,
  AlertCircle,
  FileText
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { brl } from "@/lib/financial/format";

interface BaseFaturamentoSectionProps {
  osId: string;
  osTipo: 'TRADICIONAL' | 'ON_FARM';
}

export function BaseFaturamentoSection({ osId, osTipo }: BaseFaturamentoSectionProps) {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAdmin = ['admin', 'gestor'].includes(role || '');

  const fetchBase = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('os_faturamento_base')
      .select('*, clientes(nome), produtos(nome)')
      .eq('ordem_servico_id', osId)
      .eq('origem_os_tipo', osTipo)
      .neq('status', 'CANCELADO')
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar base de faturamento:", error);
    } else {
      setBase(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBase();
  }, [osId, osTipo]);

  const handleStatusChange = async (newStatus: string) => {
    if (!base) return;
    
    const { error } = await supabase
      .from('os_faturamento_base')
      .update({ status: newStatus as any })
      .eq('id', base.id);

    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success(`Status atualizado para ${newStatus}`);
      fetchBase();
    }
  };

  if (loading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card className="border-2 border-primary/10 overflow-hidden shadow-sm">
      <CardHeader className="bg-primary/5 py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          Base de Faturamento
        </CardTitle>
        {base ? (
          <BaseFaturamentoStatusBadge status={base.status} />
        ) : (
          <Badge variant="outline" className="text-muted-foreground border-dashed">Não configurada</Badge>
        )}
      </CardHeader>
      
      <CardContent className="p-4">
        {!base ? (
          <div className="text-center py-4 space-y-3">
            <div className="flex justify-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Esta OS ainda não possui uma base comercial definida.</p>
              <p className="text-xs text-muted-foreground/70">A base é necessária para o futuro faturamento financeiro.</p>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setDialogOpen(true)} className="mt-2 font-bold">
                <Plus className="h-4 w-4 mr-2" /> Criar Base Comercial
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Modelo</span>
                <span className="text-sm font-semibold">{base.modelo_precificacao === 'HA' ? 'Por Hectare' : 'Valor Fixo'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Área/Vol</span>
                <span className="text-sm font-semibold">
                  {base.area_hectares_snapshot} ha / {base.volume_total_ml_snapshot} mL
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Valor Ha</span>
                <span className="text-sm font-semibold font-mono-data">{brl(base.valor_ha_snapshot)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Faturável</span>
                <span className="text-sm font-bold text-primary font-mono-data">{brl(base.valor_total_faturavel)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {isAdmin && base.status === 'PENDENTE' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                    <Edit3 className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleStatusChange('LIBERADO_FATURAMENTO')}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Liberar p/ Faturamento
                  </Button>
                </>
              )}
              
              {isAdmin && base.status === 'LIBERADO_FATURAMENTO' && (
                <Button size="sm" variant="outline" onClick={() => handleStatusChange('PENDENTE')}>
                  <History className="h-4 w-4 mr-1" /> Reabrir para Ajuste
                </Button>
              )}

              {isAdmin && ['PENDENTE', 'LIBERADO_FATURAMENTO'].includes(base.status) && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => handleStatusChange('CANCELADO')}>
                  <XCircle className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              )}
            </div>
            
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-2 italic">
              <FileText className="h-3 w-3" />
              Condição sugerida: {base.condicao_pagamento_snapshot || 'Não informada'} • {base.numero_parcelas_sugerido} parcelas
            </div>
          </div>
        )}
      </CardContent>

      <BaseFaturamentoDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        osId={osId}
        osTipo={osTipo}
        initialData={base}
        onSuccess={fetchBase}
      />
    </Card>
  );
}
