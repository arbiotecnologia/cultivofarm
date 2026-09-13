import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RastreabilidadeProducaoTab } from "./RastreabilidadeProducaoTab";
import { formatOS } from "@/lib/osLabel";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, History } from "lucide-react";

interface Props {
  os: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OSDetalhesDialog({ os, open, onOpenChange }: Props) {
  if (!os) return null;

  const partner = (os as any)?.partner_orders?.partner_accounts;
  const partnerNome = partner?.nome_fantasia || partner?.razao_social;
  const partnerNumero = (os as any)?.partner_orders?.numero;
  const clienteNome = (os.clientes as any)?.nome;
  const fazenda = (os.fazendas as any)?.nome;
  const talhao = (os.talhoes as any)?.nome;
  const isB2B = !clienteNome && !!partnerNome;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 sm:p-0">
        <DialogHeader className="p-4 sm:p-6 pb-2 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold flex flex-wrap items-center gap-2">
                Ordem de Serviço: <span className="font-mono text-primary">{formatOS(os)}</span>
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {isB2B
                  ? `Parceiro B2B: ${partnerNome}${partnerNumero ? ` · Pedido ${partnerNumero}` : ""}`
                  : `${clienteNome || "—"} · ${fazenda || "—"} / ${talhao || "—"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6">
                {os.origem === 'onfarm' ? 'Visita Técnica' : 'Manual'}
              </Badge>
              <Badge className="h-6 bg-primary/10 text-primary border-primary/20">
                {(os.status || "Não informado").replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="rastreabilidade" className="h-full flex flex-col">
            <div className="px-4 sm:px-6 border-b bg-muted/20">
              <TabsList className="h-12 w-full justify-start bg-transparent gap-6 p-0">
                <TabsTrigger 
                  value="rastreabilidade" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 flex items-center gap-2 text-sm font-bold"
                >
                  <History className="h-4 w-4" />
                  Rastreabilidade da Produção
                </TabsTrigger>
                {/* 
                Reservado para futuras abas de detalhes da OS como:
                - Detalhes Técnicos
                - Financeiro
                - Fotos / Arquivos
                */}
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden px-4 sm:px-6 py-4">
              <TabsContent value="rastreabilidade" className="mt-0 h-full">
                <RastreabilidadeProducaoTab osId={os.id} osTipo={os.origem} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
