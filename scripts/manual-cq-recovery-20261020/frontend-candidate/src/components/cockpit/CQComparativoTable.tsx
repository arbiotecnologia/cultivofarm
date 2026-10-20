import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { formatConcentracaoValue } from "@/lib/cqFormat";
import type { CQReferencia } from "@/hooks/useCQReferencia";

type Status = "ok" | "warn" | "fail" | "empty";

interface MedidoInput {
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
  (s ?? "").trim().toLowerCase();

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
  if (medidoNum === null || Number.isNaN(medidoNum)) return "empty";
  if (min !== null && medidoNum < min) return "fail";
  if (max !== null && medidoNum > max) return "fail";
  return "ok";
}

function evalText(medido: string, esperado: string | null): Status {
  if (!esperado) return "empty";
  if (!medido.trim()) return "empty";
  return norm(medido) === norm(esperado) ? "ok" : "warn";
}

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Dentro" />;
  if (s === "warn")
    return <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Atenção" />;
  if (s === "fail")
    return <XCircle className="h-4 w-4 text-red-600" aria-label="Fora da faixa" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" aria-label="Não avaliado" />;
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
          Sem referência técnica cadastrada para este microrganismo/produto — registre normalmente.
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

  const phNum = medido.ph ? Number(medido.ph.replace(",", ".")) : null;
  const concNum = formatConcentracaoValue(medido.concentracao_mantissa, medido.concentracao_expoente);


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
      status: evalNumeric(phNum, referencia.ph_min, referencia.ph_max),
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
      status: evalNumeric(concNum, referencia.concentracao_min_ufc_ml, null),
    },
    {
      label: "Aparência",
      esperado: referencia.aparencia_esperada || "—",
      medido: medido.aparencia || "—",
      status: evalText(medido.aparencia, referencia.aparencia_esperada),
    },
    {
      label: "Odor",
      esperado: referencia.odor_esperado || "—",
      medido: medido.odor || "—",
      status: evalText(medido.odor, referencia.odor_esperado),
    },
    {
      label: "Contaminação",
      esperado: referencia.contaminacao_esperada || "—",
      medido: medido.contaminacao || "—",
      status: evalText(medido.contaminacao, referencia.contaminacao_esperada),
    },
  ];

  const fails = rows.filter((r) => r.status === "fail").length;
  const sugestao = fails === 0 ? "APROVADO" : `REPROVADO — ${fails} parâmetro(s) fora da faixa`;

  return (
    <div className="rounded-md border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Referência técnica
        </div>
        <Badge
          variant={fails === 0 ? "default" : "destructive"}
          className={fails === 0 ? "bg-emerald-600 hover:bg-emerald-600" : ""}
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
