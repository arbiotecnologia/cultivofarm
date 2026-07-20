import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { BIEmptyState } from "../BIEmptyState";
import { useMemo } from "react";

interface MovimentacaoItem {
  acao?: string;
  quantidade?: number;
  observacao?: string;
  created_at: string;
}

interface BIMovimentacoesChartProps {
  dados: MovimentacaoItem[];
  loading?: boolean;
}

export function BIMovimentacoesChart({ dados, loading }: BIMovimentacoesChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, { tipo: string; count: number; volume: number }>();
    dados.forEach((m) => {
      const tipo = m.acao || "desconhecido";
      if (!map.has(tipo)) {
        map.set(tipo, { tipo, count: 0, volume: 0 });
      }
      const entry = map.get(tipo)!;
      entry.count++;
      entry.volume += Number(m.quantidade || 0);
    });
    return Array.from(map.values()).map((d) => ({
      nome: d.tipo.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      quantidade: d.count,
      volume: Number((d.volume / 1000).toFixed(2)), // ml -> L
    }));
  }, [dados]);

  if (loading) {
    return (
      <div className="h-64 w-full bg-muted animate-pulse rounded-md" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <BIEmptyState mensagem="Nenhuma movimentação no período." />
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    Entrada: "#3b82f6",
    Saida: "#ef4444",
    Ajuste: "#f59e0b",
  };

  return (
    <div className="bg-white rounded-md border p-4">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number, name: string) => {
              if (name === "quantidade") return [value, "Quantidade"];
              return [`${value} L`, "Volume"];
            }}
          />
          <Bar dataKey="quantidade" radius={[4, 4, 0, 0]} name="Quantidade">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colorMap[entry.nome] || "#6b7280"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
