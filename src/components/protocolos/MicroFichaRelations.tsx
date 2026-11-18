import { useState } from "react";
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
  microChildSchema,
  type MicroChild,
} from "@/lib/catalogo/microorganismFicha";

const tables = {
  crop: "microorganism_crop_recommendations",
  target: "microorganism_targets",
  source: "catalog_technical_sources",
} as const;
const names = { crop: "Cultura", target: "Alvo", source: "Fonte documental" };
const fields = {
  crop: ["cultura_id", "fase_recomendada", "objetivo_uso", "observacao"],
  target: [
    "catalogo_alvo_id",
    "alvo_nome",
    "alvo_tipo",
    "descricao",
    "prioridade",
  ],
  source: [
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
export function MicroFichaRelations({
  id,
  kind,
  editable,
  busy,
  staged,
  onStage,
}: {
  id: string | null;
  kind: MicroChild["kind"];
  editable: boolean;
  busy: boolean;
  staged: MicroChild[];
  onStage(child: MicroChild): void;
}) {
  const query = useScopedPortalQuery<Record<string, unknown>[]>({
    queryKey: ["micro-ficha-children", id, kind],
    enabled: !!id,
    queryFn: async (signal) => {
      const table = supabase.from(tables[kind] as never).select("*");
      const result =
        kind === "source"
          ? await table
              .eq("entidade_tipo", "microrganismo")
              .eq("entidade_id", id ?? "")
              .abortSignal(signal)
          : await table.eq("microrganismo_id", id ?? "").abortSignal(signal);
      if (result.error)
        throw new Error("Não foi possível consultar os vínculos canônicos.");
      return (result.data ?? []).map((row) => microChildSchema.parse(row));
    },
  });
  const options = useScopedPortalQuery<{ id: string; nome: string }[]>({
    queryKey: ["micro-ficha-options", kind],
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
  const [draft, setDraft] = useState<MicroChild | null>(null);
  const [error, setError] = useState("");
  const begin = (row?: Record<string, unknown>) => {
    setError("");
    setDraft({
      kind,
      id: typeof row?.id === "string" ? row.id : null,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
      fields: row
        ? Object.fromEntries(fields[kind].map((f) => [f, row[f] ?? null]))
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
    onStage(draft);
    setDraft(null);
  };
  return (
    <section
      className="space-y-3"
      aria-label={`${names[kind]} — vínculos canônicos`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3>{names[kind]}</h3>
        {editable && (
          <Button
            variant="outline"
            disabled={busy || (!!id && !query.isSuccess)}
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
              {editable && (
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => begin(row)}
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
                          : {}),
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
