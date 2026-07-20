import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Sprout, Handshake } from "lucide-react";
import ProdutoresTab from "@/pages/clientes/ProdutoresTab";
import ParceirosB2BTab from "@/pages/clientes/ParceirosB2BTab";
import { useAuth } from "@/hooks/useAuth";

type AbaCliente = "produtores" | "parceiros";

export default function Clientes() {
  const [params, setParams] = useSearchParams();
  const { role } = useAuth();

  const canSeeParceiros =
    role === "administrador" || role === "gestor" || role === "gestor_comercial" || role === "financeiro";
  const canSeeProdutores = role !== "gestor_comercial";

  const initial = (params.get("aba") as AbaCliente | null) || (canSeeProdutores ? "produtores" : "parceiros");
  const aba: AbaCliente = (initial === "parceiros" && canSeeParceiros) || !canSeeProdutores ? "parceiros" : "produtores";

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", v);
    setParams(next, { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Clientes"
        description="Gestão unificada de clientes produtores e parceiros B2B"
      />

      <Tabs value={aba} onValueChange={onChange} className="space-y-4">
        <TabsList>
          {canSeeProdutores && (
            <TabsTrigger value="produtores" className="gap-2">
              <Sprout className="h-4 w-4" /> Produtores
            </TabsTrigger>
          )}
          {canSeeParceiros && (
            <TabsTrigger value="parceiros" className="gap-2">
              <Handshake className="h-4 w-4" /> Parceiros B2B
            </TabsTrigger>
          )}
        </TabsList>

        {canSeeProdutores && (
          <TabsContent value="produtores" className="m-0">
            <ProdutoresTab />
          </TabsContent>
        )}
        {canSeeParceiros && (
          <TabsContent value="parceiros" className="m-0">
            <ParceirosB2BTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
