import { useCallback, useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ManualAccessLinkDialog } from "@/components/plataforma/ManualAccessLinkDialog";
import { useConvidarAdminEmpresa } from "@/hooks/usePlataformaSaaS";

export interface ManualAccessLinkTarget {
  organizationId: string;
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  responsavelPrincipal: boolean;
}

interface ManualAccessLinkActionProps {
  target: ManualAccessLinkTarget;
  ambiguous?: boolean;
  label?: string;
  onSuccess?: () => void;
}

export function ManualAccessLinkAction({ target, ambiguous = false, label = "Gerar link", onSuccess }: ManualAccessLinkActionProps) {
  const gerar = useConvidarAdminEmpresa();
  const [confirming, setConfirming] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const running = useRef(false);
  const resetRef = useRef(gerar.reset);
  resetRef.current = gerar.reset;

  const clearLink = useCallback(() => {
    setManualLink(null);
    resetRef.current();
  }, []);

  useEffect(() => () => {
    setManualLink(null);
    resetRef.current();
  }, []);

  const generate = () => {
    if (running.current) return;
    running.current = true;
    gerar.mutate({
      ...target,
      modo: "link",
      deliveryMode: "manual_link",
      confirmAmbiguousEmailRetry: false,
    }, {
      onSuccess: (result) => {
        if (!result.manual_link) {
          toast.error("O servidor não retornou um link de acesso.");
          return;
        }
        setConfirming(false);
        setManualLink(result.manual_link);
        onSuccess?.();
      },
      onError: () => toast.error("Não foi possível gerar o link de acesso."),
      onSettled: () => { running.current = false; },
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => setConfirming(true)}>
        <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
        {gerar.isPending ? "Gerando…" : label}
      </Button>
      <AlertDialog open={confirming} onOpenChange={(open) => { if (!running.current) setConfirming(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar link de acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              Será criado um novo link de definição de senha sem envio por e-mail. O link será exibido somente nesta sessão administrativa.
              {ambiguous && " Pode existir um link anterior ainda válido; use somente o novo link."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={gerar.isPending} onClick={generate}>Gerar link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ManualAccessLinkDialog link={manualLink} onClose={clearLink} />
    </>
  );
}