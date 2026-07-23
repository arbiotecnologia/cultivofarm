/**
 * Fase Fiscal H3-A — Botão de consulta cadastral CNPJ (BrasilAPI) com
 * confirmação. Apenas UI; sem persistência, sem alteração de regras fiscais.
 * O CNPJ digitado NUNCA é substituído pelo retorno da consulta.
 */
import { useEffect, useRef, useState } from "react";
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
import { unmaskCnpjAlpha, validateCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";
import type { CompanyFiscalFormValues } from "@/lib/fiscal/companyFiscalValidation";

interface Props {
  cnpj: string | null | undefined;
  currentValues: CompanyFiscalFormValues;
  disabled?: boolean;
  onApply: (patch: Partial<CompanyFiscalFormValues>) => void;
}

// Cooldown curto após qualquer resposta, para evitar hammering sem loop de retry.
const COOLDOWN_MS = 3000;

function errorMessage(err: unknown): string {
  if (err instanceof CnpjLookupError) {
    switch (err.code) {
      case "invalid_cnpj":
        return "CNPJ inválido — verifique o número e o dígito verificador.";
      case "alpha_unsupported":
        return "Consulta automática via BrasilAPI ainda indisponível para este formato. Preencha manualmente.";
      case "not_found":
        return "CNPJ não encontrado na base pública consultada.";
      case "rate_limited":
        return "Muitas consultas recentes. Aguarde alguns segundos e tente novamente.";
      case "timeout":
        return "A consulta demorou demais e foi cancelada. Tente novamente.";
      case "upstream_error":
        return "Falha ao interpretar a resposta da fonte pública. Tente novamente mais tarde.";
      case "unauthorized":
        return "Sessão expirada. Entre novamente para consultar.";
      case "forbidden":
        return "Seu perfil não tem permissão para executar essa consulta.";
      case "network_error":
      default:
        return "Falha de rede ao consultar a base pública. Tente novamente.";
    }
  }
  return "Falha inesperada ao consultar a base pública.";
}

export function CnpjLookupButton({ cnpj, currentValues, disabled, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [result, setResult] = useState<CnpjLookupResult | null>(null);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const clean = unmaskCnpjAlpha(cnpj ?? "");
  const isValid = validateCnpjAlpha(clean);
  const isNumericFull = /^\d{14}$/.test(clean);
  const now = Date.now();
  const inCooldown = now < cooldownUntil;
  const canLookup = isValid && isNumericFull && !disabled && !loading && !inCooldown;

  const title = !isValid
    ? "Digite um CNPJ válido (com dígito verificador correto) para consultar."
    : !isNumericFull
      ? "Consulta automática via BrasilAPI ainda indisponível para CNPJ alfanumérico. Preencha manualmente."
      : inCooldown
        ? "Aguarde alguns segundos antes de nova consulta."
        : "Consulta cadastral via BrasilAPI (dados públicos originados do CNPJ/RFB). Revise antes de salvar.";

  const handleClick = async () => {
    if (!canLookup) return;
    // Trava contra duplo clique: aborta requisição anterior (se houver).
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const r = await lookupCnpj(clean, ctrl.signal);
      if (!mountedRef.current || ctrl.signal.aborted) return;
      const fieldsToApply = Object.keys(r.values) as LookupTargetField[];
      if (fieldsToApply.length === 0) {
        toast({
          title: "Nenhum dado retornado",
          description:
            "A consulta pública não retornou campos preenchíveis para este CNPJ.",
        });
        return;
      }
      setResult(r);
      setOpen(true);
    } catch (err) {
      if (!mountedRef.current || ctrl.signal.aborted) return;
      toast({
        title: "Consulta CNPJ",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setCooldownUntil(Date.now() + COOLDOWN_MS);
      }
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    onApply(result.values);
    const count = Object.keys(result.values).length;
    toast({
      title: "Dados preenchidos",
      description:
        `${count} campo(s) preenchido(s) a partir da consulta pública (BrasilAPI). ` +
        `Revise antes de salvar.` +
        (result.ibgeUnresolved
          ? " O código IBGE do município não foi resolvido — preencha manualmente."
          : "") +
        (result.taxRegimeHint === "MEI"
          ? " Empresa consta como MEI na fonte pública — revise o regime tributário."
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
        title={title}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Search className="mr-2 h-4 w-4" />
        )}
        Buscar dados (BrasilAPI)
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar preenchimento a partir da consulta pública</AlertDialogTitle>
            <AlertDialogDescription>
              Os campos abaixo serão preenchidos no formulário a partir da{" "}
              <strong>BrasilAPI</strong> (dados públicos originados do CNPJ/RFB — não
              é canal oficial da RFB em tempo real). Nada é salvo automaticamente —
              revise e clique em <strong>Salvar configuração</strong> ao final.
              O CNPJ digitado, e-mail fiscal, regime tributário, inscrições estadual
              e municipal, provider, flags e campos NF-e/NFS-e <strong>não</strong>{" "}
              são alterados.
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
              <p className="mt-3 text-xs text-muted-foreground">
                Fonte: BrasilAPI · dados públicos originados do CNPJ/RFB.
              </p>
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
