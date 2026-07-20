import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { BIEmptyState } from "../BIEmptyState";

interface EstoqueChartItem {
  nome: string;
  volumeEstoque: number;
  volumeSolicitadoEntregue: number;
}

interface BIEstoqueChartProps {
  dados: EstoqueChartItem[];
  loading?: boolean;
}

export function BIEstoqueChart({ dados, loading }: BIEstoqueChartProps) {
  if (loading) {
    return (
      <div className="h-64 w-full bg-muted animate-pulse rounded-md" />
    );
  }

  if (dados.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <BIEmptyState mensagem="Nenhum dado de estoque para exibir." />
      </div>
    );
  }

  const data = dados.map((d) => ({
    nome: d.nome.length > 20 ? d.nome.slice(0, 20) + "..." : d.nome,
    estoque: Number(d.volumeEstoque.toFixed(2)),
    entregue: Number(d.volumeSolicitadoEntregue.toFixed(2)),
  }));

  return (
    <div className="bg-white rounded-md border p-4">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number, name: string) => [`${value} L`, name === "estoque" ? "Estoque" : "Entregue"]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="estoque" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Estoque" />
          <Bar dataKey="entregue" fill="#10b981" radius={[4, 4, 0, 0]} name="Entregue" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
