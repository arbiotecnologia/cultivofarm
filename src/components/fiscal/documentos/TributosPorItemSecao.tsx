/**
 * Fase Fiscal 3.4 — Redução da base de cálculo por tributo, por item.
 *
 * Todos os números exibidos vêm do servidor (`rpc_fiscal_tax_preview_v1`),
 * que usa o MESMO motor canônico dos snapshots e do XML. O operador só
 * informa o percentual quando a regra fiscal publicada permite (modo
 * MANUAL). Em modo FIXO o campo fica bloqueado; sem redução, não há campo.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useFiscalTaxPreview,
  type FiscalTaxPreviewItemInput,
  type FiscalTaxPreviewTax,
} from "@/hooks/useFiscalTaxPreview";

export type TaxInputSnapshot = Record<string, { baseReductionPct: number }>;

export interface TributosPorItemSecaoProps {
  invoiceId: string | null;
  items: Array<{
    description: string;
    gross_value: number;
    discount_value: number;
    tax_input_snapshot?: TaxInputSnapshot;
  }>;
  freight: number;
  insurance: number;
  otherExpenses: number;
  disabled?: boolean;
  onChangeItemInput: (index: number, snapshot: TaxInputSnapshot) => void;
}

const BRL = (v: number | null | undefined) =>
  `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PCT = (v: number | null | undefined) =>
  `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;

function rateio(total: number, parte: number, todos: number[]): number {
  const soma = todos.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(soma) || soma <= 0) return 0;
  return Number(((total * parte) / soma).toFixed(2));
}

export default function TributosPorItemSecao({
  invoiceId,
  items,
  freight,
  insurance,
  otherExpenses,
  disabled = false,
  onChangeItemInput,
}: TributosPorItemSecaoProps) {
  const brutos = items.map((i) => Number(i.gross_value ?? 0));

  const payload: FiscalTaxPreviewItemInput[] = useMemo(
    () =>
      items.map((it, idx) => ({
        item_sequence: idx + 1,
        gross_value: Number(it.gross_value ?? 0),
        discount_value: Number(it.discount_value ?? 0),
        freight_value: rateio(Number(freight ?? 0), brutos[idx], brutos),
        insurance_value: rateio(Number(insurance ?? 0), brutos[idx], brutos),
        other_value: rateio(Number(otherExpenses ?? 0), brutos[idx], brutos),
        tax_input_snapshot: it.tax_input_snapshot ?? {},
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(items), freight, insurance, otherExpenses],
  );

  const payloadDebounced = useDebounce(payload, 600);
  const preview = useFiscalTaxPreview(invoiceId, payloadDebounced);

  if (!invoiceId) {
    return (
      <Alert>
        <AlertTitle>Salve o rascunho para calcular os tributos</AlertTitle>
        <AlertDescription>
          A apuração e a redução da base de cálculo são feitas no servidor a partir
          do rascunho salvo.
        </AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Adicione itens para visualizar os tributos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {preview.isFetching ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Recalculando tributos no servidor…
          </>
        ) : (
          <span>Valores apurados pelo servidor. O sistema não calcula tributos no navegador.</span>
        )}
      </div>

      {preview.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível apurar os tributos</AlertTitle>
          <AlertDescription>{(preview.error as Error)?.message}</AlertDescription>
        </Alert>
      ) : null}

      {preview.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando tributos…</p>
      ) : null}

      {(preview.data?.items ?? []).map((pv, idx) => {
        const kinds = Object.keys(pv.taxes ?? {});
        return (
          <Card key={pv.itemSequence}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Item {pv.itemSequence} — {pv.description || items[idx]?.description || "sem descrição"}
              </CardTitle>
              <CardDescription>
                {kinds.length === 0 ? "Nenhum tributo apurado para este item." : "Tributos aplicáveis"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Desktop: tabela compacta */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2">Tributo</th>
                      <th className="py-1 pr-2">Base original</th>
                      <th className="py-1 pr-2">Redução da base de cálculo (%)</th>
                      <th className="py-1 pr-2">Base tributável</th>
                      <th className="py-1 pr-2">Alíquota</th>
                      <th className="py-1 pr-2">Valor</th>
                      <th className="py-1 pr-2">CST/CSOSN</th>
                      <th className="py-1 pr-2">Regra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinds.map((k) => (
                      <tr key={k} className="border-t">
                        <td className="py-1 pr-2 font-medium">{k}</td>
                        <td className="py-1 pr-2">{BRL(pv.taxes[k].baseOriginal)}</td>
                        <td className="py-1 pr-2">
                          <CampoReducao
                            taxKind={k}
                            tax={pv.taxes[k]}
                            disabled={disabled}
                            valorAtual={items[idx]?.tax_input_snapshot?.[k]?.baseReductionPct}
                            onChange={(pct) => {
                              const atual = { ...(items[idx]?.tax_input_snapshot ?? {}) };
                              if (pct === null) delete atual[k];
                              else atual[k] = { baseReductionPct: pct };
                              onChangeItemInput(idx, atual);
                            }}
                          />
                        </td>
                        <td className="py-1 pr-2">{BRL(pv.taxes[k].base)}</td>
                        <td className="py-1 pr-2">{PCT(pv.taxes[k].rate)}</td>
                        <td className="py-1 pr-2 font-medium">{BRL(pv.taxes[k].value)}</td>
                        <td className="py-1 pr-2">{pv.taxes[k].cst || pv.taxes[k].csosn || "—"}</td>
                        <td className="py-1 pr-2">
                          <OrigemRegra tax={pv.taxes[k]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cartões por tributo */}
              <div className="md:hidden space-y-3">
                {kinds.map((k) => (
                  <div key={k} className="rounded border p-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{k}</span>
                      <OrigemRegra tax={pv.taxes[k]} />
                    </div>
                    <div>Base original: {BRL(pv.taxes[k].baseOriginal)}</div>
                    <CampoReducao
                      taxKind={k}
                      tax={pv.taxes[k]}
                      disabled={disabled}
                      comRotulo
                      valorAtual={items[idx]?.tax_input_snapshot?.[k]?.baseReductionPct}
                      onChange={(pct) => {
                        const atual = { ...(items[idx]?.tax_input_snapshot ?? {}) };
                        if (pct === null) delete atual[k];
                        else atual[k] = { baseReductionPct: pct };
                        onChangeItemInput(idx, atual);
                      }}
                    />
                    <div>Base tributável: {BRL(pv.taxes[k].base)}</div>
                    <div>Alíquota: {PCT(pv.taxes[k].rate)}</div>
                    <div className="font-medium">Valor: {BRL(pv.taxes[k].value)}</div>
                    <div>CST/CSOSN: {pv.taxes[k].cst || pv.taxes[k].csosn || "—"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OrigemRegra({ tax }: { tax: FiscalTaxPreviewTax }) {
  const modo = String(tax.baseReductionSource ?? tax.baseReductionMode ?? "NONE");
  const rotulo = modo === "FIXED" ? "Redução fixa da regra" : modo === "MANUAL" ? "Redução informada" : "Sem redução";
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={modo === "NONE" ? "outline" : "secondary"}>{rotulo}</Badge>
      <span className="text-xs text-muted-foreground">
        {tax.ruleKey ? `${tax.ruleKey} v${tax.ruleVersion ?? 1}` : ""}
      </span>
    </span>
  );
}

function CampoReducao({
  taxKind,
  tax,
  disabled,
  comRotulo = false,
  valorAtual,
  onChange,
}: {
  taxKind: string;
  tax: FiscalTaxPreviewTax;
  disabled: boolean;
  comRotulo?: boolean;
  valorAtual?: number;
  onChange: (pct: number | null) => void;
}) {
  const modo = String(tax.baseReductionMode ?? "NONE");
  const [texto, setTexto] = useState(
    valorAtual !== undefined ? String(valorAtual) : tax.baseReductionPct ? String(tax.baseReductionPct) : "",
  );
  useEffect(() => {
    if (valorAtual !== undefined) setTexto(String(valorAtual));
  }, [valorAtual]);

  if (modo === "NONE") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (modo === "FIXED") {
    return (
      <span title="Percentual definido pela regra fiscal publicada">
        {PCT(tax.baseReductionPct)}
      </span>
    );
  }

  const id = `reducao-${taxKind}-${tax.ruleKey ?? "regra"}`;
  const numero = Number(texto);
  const invalido = texto !== "" && (!Number.isFinite(numero) || numero < 0 || numero > 100);

  return (
    <div className="space-y-1">
      {comRotulo ? <Label htmlFor={id}>Redução da base de cálculo (%)</Label> : null}
      <Input
        id={id}
        type="number"
        min={0}
        max={100}
        step="0.01"
        className="h-8 w-28"
        aria-label="Redução da base de cálculo (%)"
        aria-invalid={invalido}
        disabled={disabled}
        value={texto}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          if (v === "") {
            onChange(null);
            return;
          }
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 100) onChange(n);
        }}
      />
      {invalido ? (
        <p className="text-xs text-destructive" role="alert">
          Informe um percentual entre 0 e 100.
        </p>
      ) : null}
    </div>
  );
}
