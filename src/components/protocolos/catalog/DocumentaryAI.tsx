import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DOCUMENTARY_LABELS } from '@/lib/catalogo/documentaryLabels';
import { safeSourceUrl } from '@/lib/catalogo/safeSourceUrl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENTARY_FIELDS,
  documentarySchema,
  selectedDocumentaryValues,
  selectedDocumentaryEvidence,
  type DocumentaryEvidence,
  type DocumentaryIdentity,
  type DocumentaryResult,
} from "@/lib/catalogo/documentarySuggestions";

export function DocumentaryAI({
  identity,
  values,
  allowed,
  onApply,
  onEvidence,
  disabled = false,
}: {
  disabled?: boolean;
  identity: DocumentaryIdentity;
  values: Record<string, unknown>;
  allowed: readonly string[];
  onApply(fields: Record<string, string>): void;
  onEvidence?(evidence: DocumentaryEvidence[]): void;
}) {
  const editor = useTenantCatalogEditor();
  const [manufacturer, setManufacturer] = useState(identity.manufacturer);
  const [registration, setRegistration] = useState(identity.registration);
  const [result, setResult] = useState<DocumentaryResult>();
  const [candidate, setCandidate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const [requested, setRequested] = useState<string[]>([...allowed]);
  const [researchScope, setResearchScope] = useState<
    "species" | "product_strain"
  >("product_strain");
  const controller = useRef<AbortController>();
  const resultFence = useRef<() => boolean>(() => false);
  const fingerprint = JSON.stringify([
    editor.scope,
    identity,
    manufacturer,
    registration,
    researchScope,
  ]);
  const liveFingerprint = useRef(fingerprint);
  liveFingerprint.current = fingerprint;
  const stop = () => {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
  };
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setResult(undefined);
    setCandidate("");
    setSelected([]);
    setError(undefined);
    setBusy(false);
  }, [fingerprint]);
  useEffect(() => () => controller.current?.abort(), []);
  if (!editor.canEdit) return null;
  const generate = async () => {
    if (disabled || busy || !identity.name.trim()) return;
    const ticket = ++generation.current;
    const expected = fingerprint;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    setSelected([]);
    const c = new AbortController();
    controller.current = c;
    const scopeCurrent = editor.capture();
    const current = () =>
      scopeCurrent() &&
      generation.current === ticket &&
      liveFingerprint.current === expected;
    const timeout = setTimeout(() => {
      if (current()) {
        c.abort();
        setBusy(false);
        setError(
          "A pesquisa excedeu 90 segundos. O rascunho foi preservado; uma nova tentativa pode ter custo.",
        );
        generation.current++;
      }
    }, 90000);
    try {
      const fields = requested.filter((field) =>
        DOCUMENTARY_FIELDS.some((permitted) => permitted === field),
      );
      if (!fields.length)
        throw new Error("Nenhum campo documental disponível para pesquisa.");
      const { data, error: failure } = await supabase.functions.invoke(
        "catalog-documentary-suggestions",
        {
          body: {
            identity: {
              ...identity,
              manufacturer,
              registration,
              researchScope,
            },
            fields,
          },
          signal: c.signal,
        },
      );
      if (!current() || c.signal.aborted) return;
      if (failure) {
        const context = (failure as { context?: Response }).context;
        const status = context?.status;
        throw new Error(
          status === 401
            ? "Sessão expirada. Entre novamente; rascunho preservado."
            : status === 403
              ? "Sem permissão para pesquisar este catálogo."
              : status === 429
                ? "Limite de pesquisas atingido. Aguarde antes de tentar novamente."
                : status === 402
                  ? "Créditos de IA indisponíveis."
                  : "Pesquisa documental indisponível neste ambiente. O formulário foi preservado; verifique a implantação revisada ou o provedor.",
        );
      }
      const parsed = documentarySchema.safeParse(data);
      if (!parsed.success)
        throw new Error(
          "A resposta não possui fontes verificáveis. Nenhum campo foi alterado.",
        );
      resultFence.current = current;
      setResult(parsed.data);
      setCandidate(
        parsed.data.candidates.length === 1
          ? parsed.data.candidates[0].key
          : "",
      );
    } catch (e) {
      if (current() && !c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Pesquisa indisponível. Formulário preservado.",
        );
    } finally {
      clearTimeout(timeout);
      if (current()) setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 border-y py-3"
      aria-label="Pesquisa documental do produto"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="documentary-manufacturer">
            Fabricante para pesquisa
          </Label>
          <Input
            id="documentary-manufacturer"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="documentary-registration">
            Registro para pesquisa (opcional)
          </Label>
          <Input
            id="documentary-registration"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend>Campos para pesquisa</legend>
        {allowed
          .filter((f) =>
            DOCUMENTARY_FIELDS.includes(
              f as (typeof DOCUMENTARY_FIELDS)[number],
            ),
          )
          .map((field) => (
            <Label key={field} className="flex items-center gap-2">
              <Checkbox
                aria-label={`Pesquisar ${DOCUMENTARY_LABELS[field] ?? field}`}
                checked={requested.includes(field)}
                onCheckedChange={(v) =>
                  setRequested((old) =>
                    v === true
                      ? [...old, field]
                      : old.filter((f) => f !== field),
                  )
                }
              />
              {DOCUMENTARY_LABELS[field] ?? field}
            </Label>
          ))}
      </fieldset>
      {identity.entity === "microrganismo" && (
        <div>
          <Label>Escopo da pesquisa</Label>
          <Select
            value={researchScope}
            onValueChange={(v) =>
              setResearchScope(v as "species" | "product_strain")
            }
          >
            <SelectTrigger aria-label="Escopo da pesquisa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="species">
                Espécie — conhecimento geral, não valida a cepa
              </SelectItem>
              <SelectItem value="product_strain">
                Produto / cepa — exige evidência específica
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={
          disabled || !requested.length || busy || !identity.name.trim()
        }
        onClick={() => void generate()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Gerar com IA
      </Button>
      {busy && (
        <Button type="button" variant="ghost" onClick={stop}>
          Parar
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.candidates.length === 0 ? (
            <p role="status">
              Nenhuma identificação documental verificável encontrada.
            </p>
          ) : (
            <div>
              <Label>Produto identificado</Label>
              <Select
                value={candidate}
                onValueChange={(v) => {
                  setCandidate(v);
                  setSelected([]);
                }}
              >
                <SelectTrigger aria-label="Produto identificado">
                  <SelectValue placeholder="Escolha entre as identificações encontradas" />
                </SelectTrigger>
                <SelectContent>
                  {result.candidates.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name} · {c.manufacturer ?? "Fabricante não informado"}{" "}
                      · {c.registration ?? "Registro não informado"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {candidate &&
            result.suggestions
              .filter(
                (s) =>
                  s.candidate_key === candidate && allowed.includes(s.field),
              )
              .map((s) => (
                <div key={s.field} className="space-y-2 border-b py-3">
                  <Label className="flex items-center gap-2">
                    <Checkbox
                      checked={selected.includes(s.field)}
                      onCheckedChange={(v) =>
                        setSelected((old) =>
                          v === true
                            ? [...old, s.field]
                            : old.filter((f) => f !== s.field),
                        )
                      }
                    />
                    {DOCUMENTARY_LABELS[s.field] ?? s.field}
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Atual</p>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {String(values[s.field] ?? "") || "Não informado"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sugestão</p>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {s.value}
                      </p>
                    </div>
                  </div>
                  {s.sources.map((source) => (
                    <div key={source.url} className="break-words text-xs">
                      <a
                        className="text-primary underline"
                        href={safeSourceUrl(source.url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                      <p>{source.excerpt}</p>
                    </div>
                  ))}
                </div>
              ))}
          <Button
            type="button"
            disabled={disabled || !candidate || selected.length === 0}
            onClick={() => {
              if (!disabled && resultFence.current() && editor.capture()()) {
                onApply(
                  selectedDocumentaryValues(
                    result,
                    candidate,
                    selected,
                    allowed,
                  ),
                );
                onEvidence?.(
                  selectedDocumentaryEvidence(
                    result,
                    candidate,
                    selected,
                    allowed,
                    { ...identity, manufacturer, registration, researchScope },
                  ),
                );
                setSelected([]);
              }
            }}
          >
            Aplicar campos selecionados ao rascunho
          </Button>
        </>
      )}
    </section>
  );
}
