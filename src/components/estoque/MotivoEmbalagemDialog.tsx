import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function MotivoEmbalagemDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: (motivo: string) => void;
  loading?: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setMotivo(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <Label>Motivo (obrigatório, mín. 3 caracteres)</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(motivo.trim())}
            disabled={loading || motivo.trim().length < 3}
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
