import { TenantTargetTools } from "./catalog/TenantTargetTools";
import { useEffect, useState } from "react";
import { SOURCE_TYPE_LABEL, CONFIDENCE_LABEL } from "@/hooks/useCatalogSources";
import { TARGET_TYPE_LABELS } from "@/lib/catalogo/documentaryLabels";
import {
  validateOptionalSourceUrl,
  safeSourceUrl,
} from "@/lib/catalogo/safeSourceUrl";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateProductRelation,
  parseProductRelationRow,
  type ProductRelation,
} from "@/lib/catalogo/productRelations";

const tables = {
  crop: "product_crop_recommendations",
  target: "product_target_recommendations",
  source: "catalog_technical_sources",
} as const;
const names = { crop: "Cultura", target: "Alvo", source: "Fonte documental" };
const fields = {
  crop: [
    "cultura_id",
    "fase_recomendada",
    "objetivo_uso",
    "dose_recomendada",
    "observacao",
  ],
  target: [
    "catalogo_alvo_id",
    "alvo_nome",
    "alvo_tipo",
    "descricao",
    "prioridade",
  ],
  source: [
    "idioma_original",
    "pais_origem",
    "fonte_titulo",
    "fonte_url",
    "fonte_tipo",
    "resumo_evidencia",
    "nivel_confianca",
    "data_consulta",
    "observacoes",
  ],
};
const labels: Record<string, string> = {
  idioma_original: "Idioma original",
  pais_origem: "País de origem",
  dose_recomendada: "Dose declarada na fonte",
  cultura_id: "Cultura cadastrada",
  catalogo_alvo_id: "Alvo cadastrado",
  alvo_nome: "Nome do alvo",
  alvo_tipo: "Tipo do alvo",
  prioridade: "Prioridade",
  fonte_titulo: "Título",
  fonte_url: "URL HTTPS do documento",
  fonte_tipo: "Tipo da fonte",
  nivel_confianca: "Confiança declarada",
  data_consulta: "Data de consulta",
  resumo_evidencia: "Evidência",
  fase_recomendada: "Fase recomendada",
  objetivo_uso: "Objetivo de uso",
  observacao: "Observação",
  descricao: "Descrição",
  observacoes: "Observações",
};

/** Canonical children only. Changes are staged, not dispatched until Salvar ficha. */
export function ProductFichaRelations({
  id,
  kind,
  editable,
  busy,
  staged,
  onStage,
  onPending,
}: {
  id: string | null;
  kind: ProductRelation["kind"];
  editable: boolean;
  busy: boolean;
  staged: ProductRelation[];
  onStage(child: ProductRelation): void;
  onPending(kind: ProductRelation["kind"], pending: boolean): void;
}) {
  const query = useScopedPortalQuery<Record<string, unknown>[]>({
    queryKey: ["product-ficha-children", id, kind],
    enabled: !!id,
    queryFn: async (signal) => {
      const table = supabase.from(tables[kind] as never).select("*");
      const result =
        kind === "source"
          ? await table
              .eq("entidade_tipo", "produto")
              .eq("entidade_id", id ?? "")
              .abortSignal(signal)
          : await table.eq("produto_id", id ?? "").abortSignal(signal);
      if (result.error)
        throw new Error("Não foi possível consultar os vínculos canônicos.");
      if (!Array.isArray(result.data))
        throw new Error("Estrutura dos vínculos inválida.");
      return result.data.map((row) =>
        parseProductRelationRow(row, kind, id ?? ""),
      );
    },
  });
  const options = useScopedPortalQuery<{ id: string; nome: string }[]>({
    queryKey: ["product-ficha-options", kind],
    enabled: kind !== "source",
    queryFn: async (signal) => {
      const result = await supabase
        .from(kind === "crop" ? "culturas" : "catalogo_alvos")
        .select("id,nome")
        .eq("ativo", true)
        .abortSignal(signal);
      if (result.error) throw new Error("Referências indisponíveis.");
      return result.data ?? [];
    },
  });
  const [toolsPending, setToolsPending] = useState(false);
  const [draft, setDraft] = useState<ProductRelation | null>(null);
  useEffect(() => {
    onPending(kind, !!draft || toolsPending);
  }, [kind, draft, toolsPending, onPending]);
  const [error, setError] = useState("");
  const begin = (row?: Record<string, unknown>) => {
    setError("");
    setDraft({
      kind,
      id: typeof row?.id === "string" ? row.id : null,
      expected: row ?? null,
      fields: row
        ? Object.fromEntries(
            [
              ...fields[kind],
              ...(kind === "crop"
                ? ["cultura_nome", "ativo"]
                : kind === "target"
                  ? ["ativo"]
                  : []),
            ].map((f) => [f, row[f] ?? null]),
          )
        : kind === "source"
          ? { fonte_tipo: "outro", nivel_confianca: "baixo" }
          : kind === "target"
            ? { alvo_tipo: "praga", prioridade: 1, ativo: true }
            : { ativo: true },
    });
  };
  const stage = () => {
    if (!draft || busy) return;
    if (kind === "crop" && !draft.fields.cultura_id) {
      setError("Selecione uma cultura cadastrada.");
      return;
    }
    if (
      kind === "target" &&
      (!draft.fields.catalogo_alvo_id || !draft.fields.alvo_nome)
    ) {
      setError("Selecione o alvo cadastrado e seu nome.");
      return;
    }
    if (kind === "source" && !draft.fields.fonte_titulo) {
      setError("Informe o título da fonte.");
      return;
    }
    if (kind === "source") {
      try {
        validateOptionalSourceUrl(draft.fields.fonte_url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "URL inválida.");
        return;
      }
    }
    try {
      validateProductRelation(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vínculo inválido.");
      return;
    }
    onStage(draft);
    setDraft(null);
  };
  return (
    <section
      className="space-y-3"
      aria-label={`${names[kind]} — vínculos canônicos`}
    >
      {kind === "target" && editable && <TenantTargetTools entity="produto" parentId={id} disabled={busy || !!draft} onPending={setToolsPending} onChoose={(row) => setDraft({kind:"target",id:null,expected:null,fields:{catalogo_alvo_id:row.id,alvo_nome:row.nome,alvo_tipo:row.tipo,descricao:row.descricao,prioridade:5,ativo:true}})} />}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3>{names[kind]}</h3>
        {editable && (
          <Button
            variant="outline"
            disabled={busy || !!draft || (!!id && !query.isSuccess)}
            onClick={() => begin()}
          >
            Adicionar {names[kind].toLowerCase()}
          </Button>
        )}
      </header>
      {query.isError || options.isError ? (
        <p role="alert">
          Não foi possível consultar {names[kind].toLowerCase()}.{" "}
          <Button
            variant="outline"
            onClick={() => {
              void query.refetch();
              void options.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </p>
      ) : query.isLoading ? (
        <p role="status">Carregando…</p>
      ) : (
        <ul className="divide-y">
          {query.data?.map((row) => (
            <li
              key={String(row.id)}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="break-words">
                {String(
                  row.fonte_titulo ??
                    row.alvo_nome ??
                    options.data?.find((o) => o.id === row.cultura_id)?.nome ??
                    row.cultura_nome ??
                    "Não informado",
                )}
              </span>
              {kind === "source" && row.fonte_url ? (
                safeSourceUrl(row.fonte_url) ? (
                  <a
                    href={safeSourceUrl(row.fonte_url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Consultar fonte
                  </a>
                ) : (
                  <span className="text-sm text-destructive">
                    Link legado não seguro
                  </span>
                )
              ) : null}
              {editable && (
                <Button
                  disabled={busy || !!draft}
                  variant="ghost"
                  onClick={() => {
                    const stagedRow = staged.find(
                      (c) => c.kind === kind && c.id === row.id,
                    );
                    if (stagedRow) {
                      setDraft(stagedRow);
                      setError("");
                    } else begin(row);
                  }}
                >
                  Editar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {staged
        .filter((c) => c.kind === kind)
        .map((c, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            Alteração no rascunho:{" "}
            {String(
              c.fields.fonte_titulo ??
                c.fields.alvo_nome ??
                options.data?.find((o) => o.id === c.fields.cultura_id)?.nome ??
                names[kind],
            )}
          </p>
        ))}
      {staged
        .filter((c) => c.kind === kind)
        .map((child, i) => (
          <Button
            key={`edit-${i}`}
            variant="outline"
            disabled={busy || !!draft}
            onClick={() => {
              setDraft(child);
              setError("");
            }}
          >
            Revisar alteração {i + 1}
          </Button>
        ))}
      {draft?.id && (
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={async () => {
            const fresh = await query.refetch();
            const currentRow = fresh.data?.find((row) => row.id === draft.id);
            if (fresh.isError || !currentRow) {
              setError("Vínculo atual indisponível. Rascunho preservado.");
              return;
            }
            setDraft({ ...draft, expected: currentRow });
            setError(
              "Versão atual relida. Confira os campos antes de aplicar o rascunho novamente.",
            );
          }}
        >
          Reconciliar versão deste vínculo
        </Button>
      )}
      {draft && (
        <fieldset disabled={busy} className="space-y-3 border-y py-3">
          {fields[kind].map((field) => (
            <div key={field} className="space-y-1">
              <Label htmlFor={`child-${field}`}>{labels[field]}</Label>
              {field === "cultura_id" || field === "catalogo_alvo_id" ? (
                <Select
                  value={String(draft.fields[field] ?? "")}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      fields: {
                        ...draft.fields,
                        [field]: value,
                        ...(kind === "target"
                          ? {
                              alvo_nome:
                                options.data?.find((o) => o.id === value)
                                  ?.nome ?? "",
                            }
                          : {
                              cultura_nome:
                                options.data?.find((o) => o.id === value)
                                  ?.nome ?? "",
                            }),
                      },
                    })
                  }
                >
                  <SelectTrigger id={`child-${field}`}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.data?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : ["fonte_tipo", "nivel_confianca", "alvo_tipo"].includes(
                  field,
                ) ? (
                <Select
                  value={String(draft.fields[field] ?? "")}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      fields: { ...draft.fields, [field]: value },
                    })
                  }
                >
                  <SelectTrigger id={`child-${field}`}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(
                      field === "fonte_tipo"
                        ? SOURCE_TYPE_LABEL
                        : field === "nivel_confianca"
                          ? CONFIDENCE_LABEL
                          : TARGET_TYPE_LABELS,
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`child-${field}`}
                  type={
                    field === "prioridade"
                      ? "number"
                      : field === "data_consulta"
                        ? "date"
                        : "text"
                  }
                  value={String(draft.fields[field] ?? "")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      fields: {
                        ...draft.fields,
                        [field]:
                          field === "prioridade"
                            ? Number(e.target.value)
                            : e.target.value || null,
                      },
                    })
                  }
                />
              )}
            </div>
          ))}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar alteração
            </Button>
            <Button onClick={stage}>Aplicar ao rascunho</Button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
