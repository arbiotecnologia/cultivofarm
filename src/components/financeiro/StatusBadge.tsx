import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_VARIANT, type FinStatus } from "@/lib/financial/format";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const s = (status as FinStatus) || "OPEN";
  const isPaid = s === "PAID";
  const isCanceled = s === "CANCELED";
  return (
    <Badge
      variant={STATUS_VARIANT[s] ?? "secondary"}
      className={cn(
        isPaid && "bg-emerald-600 text-white hover:bg-emerald-700",
        isCanceled && "line-through text-muted-foreground"
      )}
    >
      {STATUS_LABEL[s] ?? status}
    </Badge>
  );
}
