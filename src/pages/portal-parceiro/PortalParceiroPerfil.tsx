import { useOutletContext } from "react-router-dom";
import { PortalBrandingSettings } from "@/components/portal/PortalBrandingSettings";
import { useBranding } from "@/hooks/useBranding";

interface PartnerContext { partner: { id: string; razao_social: string; nome_fantasia?: string | null; papel?: string }; isStaff?: boolean; }
export default function PortalParceiroPerfil() {
  const { partner, isStaff = false } = useOutletContext<PartnerContext>();
  const { branding, isLoading, isError, refetch } = useBranding("parceiro", partner.id, partner.nome_fantasia || partner.razao_social);
  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando identidade visual...</p>;
  if (isError) return <div className="space-y-3"><p className="text-destructive">Não foi possível carregar a identidade visual.</p><button className="text-sm underline" onClick={() => void refetch()}>Tentar novamente</button></div>;
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="text-2xl font-bold">Perfil e identidade</h1><p className="text-sm text-muted-foreground">Defina como sua empresa aparece no portal.</p></div><PortalBrandingSettings kind="parceiro" entityId={partner.id} branding={branding} disabled={isStaff || partner.papel === "tecnico"} /></div>;
}
