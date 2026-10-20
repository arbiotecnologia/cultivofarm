import { CheckCircle2, XCircle, MinusCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import type { CQReferencia } from "@/hooks/useCQReferencia";

type Status = "ok" | "fail" | "empty";

export interface MedidoInput {
  ph: string;
  aparencia: string;
  odor: string;
  contaminacao: string;
  concentracao_mantissa: string;
  concentracao_expoente: string;
}

interface Props {
  referencia: CQReferencia | null | undefined;
  loading?: boolean;
  medido: MedidoInput;
  canEdit?: boolean;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").replace(/^ +| +$/g, "");

const fmtSci = (n: number | null): string => {
  if (n === null || Number.isNaN(n)) return "—";
  if (n === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mant = n / Math.pow(10, exp);
  const mantStr = (Math.round(mant * 10) / 10).toString().replace(".", ",");
  return `${mantStr} × 10^${exp}`;
};

function evalNumeric(
  medidoNum: number | null,
  min: number | null,
  max: number | null,
): Status {
  if (min === null && max === null) return "empty";
  if (medidoNum === null || !Number.isFinite(medidoNum)) return "empty";
  if (min !== null && medidoNum < min) return "fail";
  if (max !== null && medidoNum > max) return "fail";
  return "ok";
}

function evalText(medido: string, esperado: string | null): Status {
  if (!esperado) return "empty";
  if (!norm(medido)) return "empty";
  return norm(medido) === norm(esperado) ? "ok" : "fail";
}

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Dentro" />;
  if (s === "fail")
    return <XCircle className="h-4 w-4 text-red-600" aria-label="Divergente" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" aria-label="Não avaliado" />;
}

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
export function referenceComplete(r: CQReferencia): boolean {
  return r.ativo === true && finite(r.ph_min) && finite(r.ph_max)
    && r.ph_min >= 0 && r.ph_max <= 14 && r.ph_min <= r.ph_max
    && finite(r.concentracao_min_ufc_ml) && r.concentracao_min_ufc_ml >= 0
    && !!norm(r.aparencia_esperada) && !!norm(r.odor_esperado) && !!norm(r.contaminacao_esperada);
}
const numericInput = (s: string) => s.trim() ? Number(s.replace(",", ".")) : null;
export function evaluateCQ(r: CQReferencia, m: MedidoInput) {
  const ph = numericInput(m.ph);
  const mantissa = numericInput(m.concentracao_mantissa);
  const exponent = numericInput(m.concentracao_expoente);
  const concentration = finite(mantissa) && finite(exponent) && Number.isInteger(exponent)
    ? mantissa * Math.pow(10, exponent) : null;
  const measuredComplete = finite(ph) && ph >= 0 && ph <= 14
    && finite(concentration) && concentration >= 0 && concentration <= 1e30
    && [m.aparencia, m.odor, m.contaminacao].every(t => norm(t).length >= 1 && norm(t).length <= 200);
  const statuses: Status[] = [evalNumeric(ph, r.ph_min, r.ph_max),
    evalNumeric(concentration, r.concentracao_min_ufc_ml, null),
    evalText(m.aparencia, r.aparencia_esperada), evalText(m.odor, r.odor_esperado),
    evalText(m.contaminacao, r.contaminacao_esperada)];
  const failures = statuses.filter(s => s === "fail").length;
  const complete = referenceComplete(r);
  return { statuses, failures, approved: complete && measuredComplete && failures === 0,
    suggestion: !complete ? "REFERÊNCIA INCOMPLETA OU INVÁLIDA" : !measuredComplete
      ? "ANÁLISE INCOMPLETA OU INVÁLIDA" : failures > 0
      ? `REPROVADO — ${failures} parâmetro(s) divergente(s)` : "APROVADO" };
}

export function CQComparativoTable({ referencia, loading, medido, canEdit }: Props) {

  if (loading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Carregando referência técnica…
      </div>
    );
  }

  if (!referencia) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Sem referência técnica válida para este item — aprovação indisponível.
          {canEdit && (
            <>
              {" "}
              <Link
                to="/configuracoes/parametros-cq"
                className="underline font-medium hover:text-foreground"
              >
                Cadastrar referência
              </Link>
              .
            </>
          )}
        </div>
      </div>
    );
  }

  const assessment = evaluateCQ(referencia, medido);


  const rows: Array<{
    label: string;
    esperado: string;
    medido: string;
    status: Status;
  }> = [
    {
      label: "pH",
      esperado:
        referencia.ph_min !== null && referencia.ph_max !== null
          ? `${referencia.ph_min} – ${referencia.ph_max}`
          : referencia.ph_min !== null
          ? `≥ ${referencia.ph_min}`
          : referencia.ph_max !== null
          ? `≤ ${referencia.ph_max}`
          : "—",
      medido: medido.ph ? medido.ph : "—",
      status: assessment.statuses[0],
    },
    {
      label: "Concentração (UFC/mL)",
      esperado:
        referencia.concentracao_min_ufc_ml !== null
          ? `≥ ${fmtSci(referencia.concentracao_min_ufc_ml)}`
          : "—",
      medido:
        medido.concentracao_mantissa && medido.concentracao_expoente
          ? `${medido.concentracao_mantissa} × 10^${medido.concentracao_expoente}`
          : "—",
      status: assessment.statuses[1],
    },
    {
      label: "Aparência",
      esperado: referencia.aparencia_esperada || "—",
      medido: medido.aparencia || "—",
      status: assessment.statuses[2],
    },
    {
      label: "Odor",
      esperado: referencia.odor_esperado || "—",
      medido: medido.odor || "—",
      status: assessment.statuses[3],
    },
    {
      label: "Contaminação",
      esperado: referencia.contaminacao_esperada || "—",
      medido: medido.contaminacao || "—",
      status: assessment.statuses[4],
    },
  ];

  const sugestao = assessment.suggestion;

  return (
    <div className="rounded-md border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Referência técnica
        </div>
        <Badge
          variant={assessment.approved ? "default" : "destructive"}
        >
          Sugestão: {sugestao}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="text-left font-medium px-3 py-1.5">Parâmetro</th>
              <th className="text-left font-medium px-3 py-1.5">Faixa esperada</th>
              <th className="text-left font-medium px-3 py-1.5">Medido</th>
              <th className="text-center font-medium px-3 py-1.5 w-10">OK?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b last:border-0">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 font-mono">{r.esperado}</td>
                <td className="px-3 py-1.5 font-mono">{r.medido}</td>
                <td className="px-3 py-1.5 text-center">
                  <div className="inline-flex"><StatusIcon s={r.status} /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {referencia.observacoes && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t italic">
          {referencia.observacoes}
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
        Sugestão informativa — a decisão final é do analista.
      </div>
    </div>
  );
}
