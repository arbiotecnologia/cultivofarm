import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Siren, Activity, Receipt, Package, FlaskConical, PieChart, Truck, ClipboardList, FileText, TrendingDown, TrendingUp, Wallet } from "lucide-react";

const ATALHOS = [
  { label: "Central de Alertas", route: "/alertas-operacionais", icon: Siren },
  { label: "BI Operacional", route: "/bi-operacional", icon: Activity },
  { label: "Contas a receber", route: "/financeiro/receber", icon: TrendingUp },
  { label: "Contas a pagar", route: "/financeiro/pagar", icon: TrendingDown },
  { label: "Entregas não faturadas", route: "/financeiro/entregas-nao-faturadas", icon: Receipt },
  { label: "Notas fiscais", route: "/financeiro/notas-fiscais", icon: FileText },
  { label: "Recibos", route: "/financeiro/recibos", icon: Receipt },
  { label: "Fluxo de caixa", route: "/financeiro/fluxo-caixa", icon: Wallet },
  { label: "Estoque por embalagem", route: "/estoque/embalagens", icon: Package },
  { label: "Envase", route: "/envase", icon: FlaskConical },
  { label: "Financeiro", route: "/financeiro", icon: PieChart },
  { label: "Entregas", route: "/entregas", icon: Truck },
  { label: "OS de Produção", route: "/ordens-servico", icon: ClipboardList },
];

export function ExecutivoAtalhos() {
  const navigate = useNavigate();
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3">Atalhos executivos</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ATALHOS.map(({ label, route, icon: Icon }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className="flex flex-col items-center gap-2 p-3 rounded-md border hover:bg-accent transition-colors text-xs"
          >
            <Icon className="h-4 w-4" />
            <span className="text-center">{label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
