/**
 * Fase Fiscal — Botão de consulta CNPJ (RFB) com confirmação.
 * Apenas UI; sem persistência, sem alteração de regras fiscais.
 */
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  CnpjLookupError,
  LOOKUP_FIELD_LABELS,
  LOOKUP_TARGET_FIELDS,
  lookupCnpj,
  type CnpjLookupResult,
  type LookupTargetField,
} from "@/lib/fiscal/cnpjLookup";
import { unmaskCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";
import type { CompanyFiscalFormValues } from "@/lib/fiscal/companyFiscalValidation";

interface Props {
  cnpj: string | null | undefined;
  currentValues: CompanyFiscalFormValues;
  disabled?: boolean;
  onApply: (patch: Partial<CompanyFiscalFormValues>) => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof CnpjLookupError) {
    switch (err.code) {
      case "invalid_cnpj":
        return "CNPJ inválido — verifique o número.";
      case "alpha_unsupported":
        return "Consulta à RFB indisponível para CNPJ alfanumérico.";
      case "not_found":
        return "CNPJ não encontrado na base pública da RFB.";
      case "rate_limited":
        return "Muitas consultas recentes. Aguarde alguns segundos e tente novamente.";
      case "network_error":
      default:
        return "Falha de rede ao consultar a RFB. Tente novamente.";
    }
  }
  return "Falha inesperada ao consultar a RFB.";
}

export function CnpjLookupButton({ cnpj, currentValues, disabled, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CnpjLookupResult | null>(null);
  const [open, setOpen] = useState(false);

  const clean = unmaskCnpjAlpha(cnpj ?? "");
  const isNumericFull = /^\d{14}$/.test(clean);
  const canLookup = isNumericFull && !disabled && !loading;

  const handleClick = async () => {
    if (!canLookup) return;
    setLoading(true);
    try {
      const r = await lookupCnpj(clean);
      const fieldsToApply = Object.keys(r.values) as LookupTargetField[];
      if (fieldsToApply.length === 0) {
        toast({
          title: "Nenhum dado retornado",
          description: "A RFB não retornou campos preenchíveis para este CNPJ.",
        });
        return;
      }
      setResult(r);
      setOpen(true);
    } catch (err) {
      toast({
        title: "Consulta CNPJ",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    onApply(result.values);
    const count = Object.keys(result.values).length;
    toast({
      title: "Dados preenchidos",
      description:
        `${count} campo(s) preenchidos a partir da RFB.` +
        (result.ibgeUnresolved
          ? " O código IBGE do município não foi resolvido — preencha manualmente."
          : "") +
        (result.taxRegimeHint === "MEI"
          ? " Empresa consta como MEI na RFB — revise o regime tributário."
          : result.taxRegimeHint === "SIMPLES"
            ? " Empresa consta como optante do Simples Nacional — revise o regime tributário."
            : ""),
    });
    setOpen(false);
    setResult(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={!canLookup}
        title={
          !isNumericFull
            ? "Digite um CNPJ numérico com 14 dígitos para consultar a RFB."
            : "Buscar dados públicos da empresa na Receita Federal."
        }
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Search className="mr-2 h-4 w-4" />
        )}
        Buscar dados na RFB
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar preenchimento a partir da RFB</AlertDialogTitle>
            <AlertDialogDescription>
              Os campos abaixo serão preenchidos no formulário. Nada é salvo
              automaticamente — revise e clique em <strong>Salvar configuração</strong> ao
              final. Campos como e-mail fiscal, regime tributário, inscrições estadual e
              municipal <strong>não</strong> são alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {result ? (
            <div className="max-h-72 overflow-auto rounded-md border p-3 text-sm">
              <ul className="space-y-1.5">
                {LOOKUP_TARGET_FIELDS.filter((f) => f in result.values).map((f) => {
                  const nextRaw = (result.values as Record<string, unknown>)[f];
                  const next = nextRaw == null ? "" : String(nextRaw);
                  const prevRaw = (currentValues as Record<string, unknown>)[f];
                  const prev = prevRaw == null ? "" : String(prevRaw);
                  const willReplace = prev.length > 0 && prev !== next;
                  return (
                    <li key={f} className="grid grid-cols-[10rem_1fr] gap-2">
                      <span className="text-muted-foreground">{LOOKUP_FIELD_LABELS[f]}</span>
                      <span className="break-words">
                        <span className="font-medium">{next || "—"}</span>
                        {willReplace ? (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                            (substitui: {prev})
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {result.ibgeUnresolved ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  Código IBGE não encontrado automaticamente para o município retornado.
                  Preencha manualmente na aba NFS-e.
                </p>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Aplicar ao formulário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CnpjLookupButton;
