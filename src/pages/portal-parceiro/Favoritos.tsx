import { useOutletContext, useNavigate } from "react-router-dom";
import { usePartnerOrderTemplates, useDeleteOrderTemplate, useSaveOrderTemplate } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Trash, Copy } from "lucide-react";

export default function Favoritos() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data: templates = [], isLoading } = usePartnerOrderTemplates(partner?.id);
  const del = useDeleteOrderTemplate(partner?.id);
  const save = useSaveOrderTemplate();
  const navigate = useNavigate();

  const usar = (t: any) => {
    sessionStorage.setItem("partner-order-template", JSON.stringify(t));
    navigate("/portal-parceiro/catalogo");
  };

  const toggleFav = (t: any) => {
    save.mutate({
      id: t.id,
      partner_id: t.partner_id,
      nome: t.nome,
      descricao: t.descricao ?? undefined,
      itens: t.itens ?? [],
      favorito: !t.favorito,
    });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Favoritos & Modelos</h1>
        <p className="text-sm text-muted-foreground">
          Modelos de pedido salvos para acelerar novas compras. Ao usar um modelo, os preços são recalculados
          com base no seu catálogo atual e você pode ajustar quantidades antes de confirmar.
        </p>
      </div>

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando...</div>
      : templates.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum modelo salvo ainda. No <span className="font-medium">Catálogo</span>, monte um carrinho e clique em
          <span className="font-medium"> "Salvar como favorito"</span> para reutilizá-lo aqui.
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFav(t)}
                    aria-label={t.favorito ? "Desmarcar favorito" : "Marcar como favorito"}
                    className="hover:opacity-80"
                  >
                    <Star className={`h-4 w-4 ${t.favorito ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                  </button>
                  {t.nome}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {t.descricao && <div className="text-xs text-muted-foreground">{t.descricao}</div>}
                <Badge variant="outline">{(t.itens ?? []).length} item(ns)</Badge>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => usar(t)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Usar e personalizar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)} aria-label="Remover modelo">
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
