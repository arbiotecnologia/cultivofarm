import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useSellerPortfolio } from "@/hooks/useSellerPortfolio";

export default function MinhaCarteiraVendedor() {
  const { data, isLoading } = useSellerPortfolio();

  if (isLoading) {
    return <div className="container mx-auto py-10 text-sm"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Carregando sua carteira…</div>;
  }
  if (!data?.installed || !data.ready) {
    return (
      <div className="container mx-auto py-10">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {data?.installed
              ? "Seu acesso de vendedor não está ativo nesta empresa. Fale com o administrador."
              : "A carteira de vendedor ainda não está disponível nesta empresa."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Minha carteira</h1>
        <p className="text-sm text-muted-foreground">Parceiros atribuídos a você pelo administrador.</p>
      </div>
      {(!data.orderCreate || !data.quoteRespond) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Lançar pedidos e responder cotações ainda não estão liberados para o perfil Vendedor.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Parceiros</CardTitle>
          <CardDescription>{data.partners.length} parceiro(s) na sua carteira.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum parceiro atribuído a você.</p>
          ) : (
            <ul className="divide-y">
              {data.partners.map((p) => (
                <li key={p.partner_id} className="py-2 flex items-center justify-between">
                  <span>{p.razao_social}</span>
                  <Badge variant="outline">Carteira própria</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
