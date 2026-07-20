import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}

const TONE: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-destructive",
};

export function KpiCard({ label, value, icon: Icon, tone = "default" }: Props) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("rounded-md bg-muted p-2", TONE[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("text-lg font-semibold truncate", TONE[tone])}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
