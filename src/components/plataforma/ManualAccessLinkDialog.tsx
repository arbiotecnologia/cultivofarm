import { useEffect } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ManualAccessLinkDialogProps {
  link: string | null;
  onClose: () => void;
}

export function ManualAccessLinkDialog({ link, onClose }: ManualAccessLinkDialogProps) {
  useEffect(() => onClose, [onClose]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Envie por um canal seguro.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <Dialog open={Boolean(link)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de acesso gerado</DialogTitle>
          <DialogDescription>O link está disponível somente nesta sessão administrativa.</DialogDescription>
        </DialogHeader>
        <p className="rounded-md border border-destructive/40 p-3 text-sm">
          Este link dá acesso à definição de senha. Envie somente ao destinatário correto por um canal confiável. Não publique nem compartilhe em grupos.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => void copyLink()}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}