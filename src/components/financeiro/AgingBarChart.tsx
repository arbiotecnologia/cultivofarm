import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { AgingRow } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";

export function AgingBarChart({ data }: { data: AgingRow[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="faixa" />
          <YAxis tickFormatter={(v) => brl(Number(v))} width={90} />
          <Tooltip formatter={(v: any) => brl(Number(v))} />
          <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
