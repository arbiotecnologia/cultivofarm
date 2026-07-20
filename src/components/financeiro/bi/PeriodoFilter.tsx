import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PeriodoPreset = "hoje" | "7d" | "mes_atual" | "mes_anterior" | "trimestre" | "ano" | "personalizado";
export type Regime = "CAIXA" | "COMPETENCIA";

export interface PeriodoState {
  preset: PeriodoPreset;
  from: string;
  to: string;
  regime: Regime;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function rangeFromPreset(preset: PeriodoPreset, fallbackFrom?: string, fallbackTo?: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "hoje": return { from: fmt(today), to: fmt(today) };
    case "7d": { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: fmt(today) }; }
    case "mes_atual": return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
    case "mes_anterior": return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case "trimestre": { const q = Math.floor(m / 3) * 3; return { from: fmt(new Date(y, q, 1)), to: fmt(new Date(y, q + 3, 0)) }; }
    case "ano": return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) };
    case "personalizado": return { from: fallbackFrom || fmt(new Date(y, m, 1)), to: fallbackTo || fmt(today) };
  }
}

export function defaultPeriodo(): PeriodoState {
  const r = rangeFromPreset("mes_atual");
  return { preset: "mes_atual", from: r.from, to: r.to, regime: "COMPETENCIA" };
}

interface Props {
  value: PeriodoState;
  onChange: (v: PeriodoState) => void;
  showRegime?: boolean;
}

export function PeriodoFilter({ value, onChange, showRegime = true }: Props) {
  const presets: { v: PeriodoPreset; l: string }[] = useMemo(() => ([
    { v: "hoje", l: "Hoje" },
    { v: "7d", l: "7 dias" },
    { v: "mes_atual", l: "Mês atual" },
    { v: "mes_anterior", l: "Mês anterior" },
    { v: "trimestre", l: "Trimestre" },
    { v: "ano", l: "Ano" },
    { v: "personalizado", l: "Personalizado" },
  ]), []);

  const setPreset = (p: PeriodoPreset) => {
    const r = rangeFromPreset(p, value.from, value.to);
    onChange({ ...value, preset: p, from: r.from, to: r.to });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border bg-card">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button key={p.v} size="sm" variant={value.preset === p.v ? "default" : "outline"} onClick={() => setPreset(p.v)}>
            {p.l}
          </Button>
        ))}
      </div>
      {value.preset === "personalizado" && (
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-9" />
          </div>
        </div>
      )}
      {showRegime && (
        <div className="ml-auto">
          <Label className="text-xs">Regime</Label>
          <Select value={value.regime} onValueChange={(v: Regime) => onChange({ ...value, regime: v })}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPETENCIA">Competência</SelectItem>
              <SelectItem value="CAIXA">Caixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
