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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { stopRowClick } from "@/lib/rowClick";

interface Props {
  table: "microrganismos" | "produtos" | "culturas";
  id: string;
  label: string;
  itemLabel?: string;
  onDeleted?: () => void;
  variant?: "icon" | "dropdown";
}

export function DeleteProtocoloButton({
  table,
  id,
  label,
  itemLabel = "registro",
  onDeleted,
  variant = "icon",
}: Props) {
  const handleDelete = async () => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (error.code === "23503" || msg.includes("foreign key") || msg.includes("violates")) {
        toast.error(
          `Não é possível excluir "${label}": item vinculado a lotes, OS, recomendações ou formulações.`,
          { duration: 6000 }
        );
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Excluído com sucesso");
    onDeleted?.();
  };

  const trigger =
    variant === "dropdown" ? (
      <AlertDialogTrigger asChild>
        <button
          className="flex items-center gap-2 w-full text-left text-destructive focus:outline-none"
          onClick={stopRowClick}
          aria-label={`Excluir ${itemLabel}`}
        >
          <Trash2 className="h-4 w-4" />
          <span>Excluir</span>
        </button>
      </AlertDialogTrigger>
    ) : (
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={stopRowClick}
          aria-label={`Excluir ${itemLabel}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
    );

  return (
    <AlertDialog>
      {trigger}
      <AlertDialogContent onClick={stopRowClick}>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir <strong>{label}</strong>? Esta ação não pode ser desfeita.
            Se o item estiver vinculado a lotes, OS, recomendações ou formulações, a exclusão será bloqueada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
