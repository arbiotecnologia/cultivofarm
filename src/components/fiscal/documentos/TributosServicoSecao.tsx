import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCalculateFiscalServiceInvoice,
  useFiscalServiceTaxPreview,
} from "@/hooks/useFiscalTaxPreview";
import { AlertTriangle, Calculator, Loader2, ShieldOff } from "lucide-react";

const BRL = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function TributosServicoSecao({
  invoiceId,
  disabled = false,
}: {
  invoiceId: string | null;
  disabled?: boolean;
}) {
  const preview = useFiscalServiceTaxPreview(invoiceId);
  const calculate = useCalculateFiscalServiceInvoice();
  const data = calculate.data ?? preview.data;

  if (!invoiceId) {
    return (
      <Alert>
        <AlertTitle>Salve o rascunho para calcular os tributos</AlertTitle>
        <AlertDescription>
          ISS, retenções federais e valor líquido são apurados no servidor após o primeiro salvamento.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3" data-testid="fiscal-nfse-tax-preview">
      {(preview.isError || calculate.isError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível apurar os tributos da NFS-e</AlertTitle>
          <AlertDescription>
            {((calculate.error ?? preview.error) as Error | null)?.message}
          </AlertDescription>
        </Alert>
      )}

      {preview.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando cálculo de serviços…
        </p>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Apuração de serviços</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Total label="Serviços" value={data.vServ} />
              <Total label="Descontos" value={data.vDesc} />
              <Total label="Base do ISS" value={data.vBC} />
              <Total label="ISS apurado" value={data.vISS} />
              <Total label="ISS retido" value={data.vISSRetido} />
              <Total label="Retenções federais" value={data.vRetFederais} />
              <Total label="Valor líquido" value={data.vLiq} strong />
            </CardContent>
          </Card>

          <Alert>
            <ShieldOff className="h-4 w-4" />
            <AlertTitle>IBS/CBS e transmissão nacional bloqueados</AlertTitle>
            <AlertDescription>
              O cálculo não aplica IBS/CBS sem política vigente e leiaute validado. Esta etapa não gera DPS nem transmite NFS-e.
            </AlertDescription>
          </Alert>
        </>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        disabled={disabled || calculate.isPending}
        onClick={() => calculate.mutate(invoiceId)}
      >
        {calculate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
        Calcular e salvar apuração
      </Button>
    </div>
  );
}

function Total({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "font-semibold" : "font-medium"}>{BRL(value)}</div>
    </div>
  );
}