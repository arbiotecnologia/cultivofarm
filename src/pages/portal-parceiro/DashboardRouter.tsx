import { useAuth } from "@/hooks/useAuth";
import DashboardPremium from "./DashboardPremium";
import DashboardTecnico from "./DashboardTecnico";

export default function DashboardRouter() {
  const { role } = useAuth();
  if (role === "parceiro_b2b_tecnico") return <DashboardTecnico />;
  return <DashboardPremium />;
}
