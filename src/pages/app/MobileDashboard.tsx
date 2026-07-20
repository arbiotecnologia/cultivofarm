import { useAuth } from "@/hooks/useAuth";
import MobileDashboardConsultor from "./MobileDashboardConsultor";
import MobileDashboardProdutor from "./MobileDashboardProdutor";

export default function MobileDashboard() {
  const { role } = useAuth();
  
  if (role === "cliente_produtor") {
    return <MobileDashboardProdutor />;
  }
  
  return <MobileDashboardConsultor />;
}
