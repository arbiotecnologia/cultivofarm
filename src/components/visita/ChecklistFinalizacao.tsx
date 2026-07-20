import { CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  /** Aba a abrir ao clicar — opcional */
  tab?: string;
}

interface ChecklistFinalizacaoProps {
  items: ChecklistItem[];
  onItemClick?: (item: ChecklistItem) => void;
}

export function ChecklistFinalizacao({ items, onItemClick }: ChecklistFinalizacaoProps) {
  const okCount = items.filter((i) => i.ok).length;
  const total = items.length;
  const allOk = okCount === total;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        allOk
          ? "border-primary/40 bg-primary/5"
          : "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-xs font-semibold",
            allOk ? "text-primary" : "text-destructive"
          )}
        >
          {allOk ? "Pronto para finalizar" : "Pendências para finalizar"}
        </p>
        <span
          className={cn(
            "text-[11px] font-mono px-2 py-0.5 rounded",
            allOk
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive"
          )}
        >
          {okCount}/{total}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onItemClick?.(item)}
              className={cn(
                "w-full flex items-center gap-2 text-left text-xs rounded px-2 py-1.5 transition",
                item.ok
                  ? "text-foreground/80"
                  : "text-destructive hover:bg-destructive/10"
              )}
            >
              {item.ok ? (
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              <span className="flex-1">{item.label}</span>
              {!item.ok && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
