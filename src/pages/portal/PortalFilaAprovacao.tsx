import { Navigate } from "react-router-dom";

export default function PortalFilaAprovacao() {
  return <Navigate to="/portal/recomendacoes?aba=aguardando" replace />;
}
