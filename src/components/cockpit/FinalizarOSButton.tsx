import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Props {
  osId: string;
  origem: string;
  podeFinalizar: boolean;
  bloqueios?: string[];
  onSuccess?: () => void;
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  showLabel?: boolean;
}

export function FinalizarOSButton({ 
  osId, 
  origem, 
  podeFinalizar, 
  bloqueios = [], 
  onSuccess,
  variant = "default",
  className = "",
  showLabel = true
}: Props) {
  const { finalizarOS } = useEsteiraLaboratorio();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleFinalizar = async () => {
    // A finalização agora depende de pode_finalizar (entrega_confirmada)
    // aplicação_bloqueante explicitamente false na view, então não impede.
    if (!podeFinalizar) {
      const msgBloqueios = bloqueios.length > 0 
        ? "Bloqueios: " + bloqueios.join(", ") 
        : "A entrega precisa ser confirmada e todas as etapas concluídas.";
        
      toast.error("Esta OS ainda não pode ser finalizada.", {
        description: msgBloqueios
      });
      return;
    }

    setLoading(true);
    try {
      const success = await finalizarOS("", osId, origem);
      if (success) {
        onSuccess?.();
        setConfirmOpen(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!podeFinalizar) {
    return (
      <div className="flex flex-col gap-2">
        <Button 
          variant={variant}
          className={`opacity-60 cursor-not-allowed ${className}`}
          onClick={() => {
            toast.info("Ações pendentes para finalização", {
              description: (
                <ul className="list-disc pl-4 mt-2 space-y-1">
                  {bloqueios.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )
            });
          }}
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          {showLabel && "Finalizar OS (Pendente)"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button 
        variant={variant === "default" ? "default" : variant}
        className={`bg-primary hover:bg-primary/90 text-white font-bold ${className}`}
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
        {showLabel && "Finalizar OS"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Finalização da OS</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Você está prestes a finalizar esta Ordem de Serviço laboratorial. 
                A entrega já foi confirmada e todas as etapas internas foram concluídas.
              </p>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-sm flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  A aplicação em campo ficará disponível como acompanhamento pós-entrega e não bloqueia a finalização do laboratório.
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Esta ação registrará o encerramento oficial no histórico de auditoria.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalizar} className="bg-primary">
              Sim, Finalizar OS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
