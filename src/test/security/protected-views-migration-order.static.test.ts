import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H7O P4 — Guarda estática das cinco views protegidas.
 *
 * Contexto: o achado ERROR `security_definer_view` do Security Advisor foi
 * fechado em H7N/H7O convertendo cinco views para `security_invoker = true`.
 * Migrations posteriores que recriem (CREATE OR REPLACE / DROP+CREATE) uma
 * dessas views SEM reafirmar `security_invoker` reabrem o achado silenciosamente.
 *
 * Este teste percorre supabase/migrations em ordem cronológica (ordem lexical
 * do nome, que é o timestamp) e simula o estado final de cada view. Reafirmações
 * posteriores — no mesmo arquivo ou em um arquivo seguinte — são consideradas.
 *
 * Correção de revisão independente (falso positivo): a reafirmação DINÂMICA
 * (bloco `DO $tag$ … EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v) … $tag$`)
 * passa a ser associada **por view**: só vale para as views cujo nome aparece
 * como literal dentro do MESMO bloco dollar-quoted que executa o ALTER dinâmico.
 * "O arquivo cita a view" + "o arquivo contém security_invoker = true" NÃO basta.
 */

const ROOT = resolve(__dirname, "../../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

export const PROTECTED_VIEWS = [
  "vw_os_integridade_esteira",
  "vw_esteira_laboratorio",
  "vw_fluxo_visita_tecnica",
  "vw_catalogo_ficha_produtos",
  "vw_catalogo_ficha_microrganismos",
] as const;

export type ViewState = "absent" | "invoker" | "unsafe";

/** Eventos relevantes de um arquivo, na ordem em que aparecem no SQL. */
type Event = { index: number; kind: "create" | "invoker_true" | "invoker_false" | "drop" };

/** Blocos dollar-quoted ($tag$ … $tag$) do SQL, com posição inicial. */
function dollarBlocks(sql: string): Array<{ index: number; body: string }> {
  const blocks: Array<{ index: number; body: string }> = [];
  const delim = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let open: { tag: string; end: number; start: number } | null = null;
  for (const m of sql.matchAll(delim)) {
    const tag = m[1] ?? "";
    const start = m.index ?? 0;
    if (open === null) {
      open = { tag, end: start + m[0].length, start };
    } else if (open.tag === tag) {
      blocks.push({ index: open.start, body: sql.slice(open.end, start) });
      open = null;
    }
  }
  return blocks;
}

/**
 * Reafirmações dinâmicas associadas a UMA view específica.
 *
 * Regra: o bloco precisa (a) executar dinamicamente um `ALTER VIEW … SET
 * (security_invoker = <valor>)` e (b) conter o nome desta view como literal
 * (item de array/lista ou nome qualificado) no mesmo bloco.
 */
function dynamicEventsFor(sql: string, view: string): Event[] {
  const events: Event[] = [];
  const dynAlter = /alter\s+view[\s\S]{0,200}?security_invoker\s*=\s*(true|false)/gi;
  const literal = new RegExp(`(?:'(?:public\\.)?${view}'|(?:public\\.)?\\b${view}\\b)`, "i");

  for (const block of dollarBlocks(sql)) {
    // Só interessa ALTER dinâmico (dentro de EXECUTE/format), não literal:
    // o ALTER literal já é capturado por eventsFor().
    if (!/\bexecute\b/i.test(block.body)) continue;
    if (!literal.test(block.body)) continue;
    for (const m of block.body.matchAll(dynAlter)) {
      events.push({
        index: block.index + (m.index ?? 0),
        kind: m[1].toLowerCase() === "true" ? "invoker_true" : "invoker_false",
      });
    }
  }
  return events;
}

export function eventsFor(sql: string, view: string): Event[] {
  const events: Event[] = [];
  const push = (re: RegExp, kind: Event["kind"]) => {
    for (const m of sql.matchAll(re)) events.push({ index: m.index ?? 0, kind });
  };

  const name = `(?:public\\.)?${view}`;
  push(
    new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${name}\\b`,
      "gi",
    ),
    "create",
  );
  push(new RegExp(`\\bdrop\\s+view\\s+(?:if\\s+exists\\s+)?${name}\\b`, "gi"), "drop");
  // ALTER VIEW ... SET (security_invoker = true|false) e CREATE ... WITH (security_invoker = ...)
  push(
    new RegExp(
      `\\b(?:alter\\s+view|create\\s+(?:or\\s+replace\\s+)?view)\\s+(?:if\\s+exists\\s+)?${name}\\b[^;]{0,400}?security_invoker\\s*=\\s*true`,
      "gi",
    ),
    "invoker_true",
  );
  push(
    new RegExp(
      `\\b(?:alter\\s+view|create\\s+(?:or\\s+replace\\s+)?view)\\s+(?:if\\s+exists\\s+)?${name}\\b[^;]{0,400}?security_invoker\\s*=\\s*false`,
      "gi",
    ),
    "invoker_false",
  );

  events.push(...dynamicEventsFor(sql, view));

  return events.sort((a, b) => a.index - b.index);
}

/** Aplica os eventos de um arquivo sobre o estado corrente da view. */
export function applyEvents(previous: ViewState, events: Event[]): ViewState {
  let state = previous;
  let recreatedSemReafirmacao = false;
  for (const ev of events) {
    if (ev.kind === "drop") {
      state = "absent";
      recreatedSemReafirmacao = false;
    } else if (ev.kind === "create") {
      // DROP+CREATE zera as opções; CREATE OR REPLACE preserva as existentes.
      state = state === "invoker" ? "invoker" : "unsafe";
      if (state !== "invoker") recreatedSemReafirmacao = true;
    } else if (ev.kind === "invoker_true") {
      state = "invoker";
      recreatedSemReafirmacao = false;
    } else if (ev.kind === "invoker_false") {
      state = "unsafe";
      recreatedSemReafirmacao = true;
    }
  }
  if (recreatedSemReafirmacao && state !== "invoker") state = "unsafe";
  return state;
}

/** Estado final de cada view protegida sobre uma sequência de arquivos SQL. */
export function finalStatesFor(
  files: Array<{ file: string; sql: string }>,
): Record<string, { state: ViewState; lastFile: string }> {
  const result: Record<string, { state: ViewState; lastFile: string }> = {};
  for (const view of PROTECTED_VIEWS) result[view] = { state: "absent", lastFile: "<nenhuma>" };

  for (const { file, sql } of files) {
    for (const view of PROTECTED_VIEWS) {
      if (!sql.includes(view)) continue;
      const events = eventsFor(sql, view);
      if (events.length === 0) continue;
      result[view] = { state: applyEvents(result[view].state, events), lastFile: file };
    }
  }
  return result;
}

function finalStates() {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(resolve(MIGRATIONS, file), "utf8") }));
  return finalStatesFor(files);
}

describe("H7O — views protegidas mantêm security_invoker no histórico de migrations", () => {
  const states = finalStates();

  it.each(PROTECTED_VIEWS)(
    "%s termina o histórico de migrations com security_invoker = true",
    (view) => {
      const { state, lastFile } = states[view];
      expect(
        state,
        `A view public.${view} termina como "${state}" após ${lastFile}. ` +
          "Toda migration que recrie a view deve reafirmar " +
          `ALTER VIEW public.${view} SET (security_invoker = true) na mesma migration ou em uma posterior.`,
      ).toBe("invoker");
    },
  );

  it("a migration H7O P4 cobre exatamente as cinco views protegidas", () => {
    const p4 = readFileSync(
      resolve(MIGRATIONS, "20260930030000_h7o_p4_reafirmar_security_invoker_views_v1.sql"),
      "utf8",
    );
    for (const view of PROTECTED_VIEWS) {
      expect(p4, `P4 não reafirma ${view}`).toContain(view);
    }
  });
});

describe("H7O — o gate estático reprova recriações inseguras (testes negativos)", () => {
  const baseline = `DO $seed$
BEGIN
  EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', 'vw_esteira_laboratorio');
  EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', 'vw_catalogo_ficha_produtos');
END
$seed$;
-- views: vw_esteira_laboratorio vw_catalogo_ficha_produtos`;

  it("negativo simples: DROP+CREATE sem reafirmação reprova a view", () => {
    const states = finalStatesFor([
      { file: "000_base.sql", sql: baseline },
      {
        file: "999_negativo.sql",
        sql: `DROP VIEW public.vw_esteira_laboratorio;
CREATE VIEW public.vw_esteira_laboratorio AS SELECT 1 AS x;`,
      },
    ]);
    expect(states["vw_esteira_laboratorio"].state).toBe("unsafe");
    expect(states["vw_catalogo_ficha_produtos"].state).toBe("invoker");
  });

  it("caso misto: reafirmação dinâmica de uma view não protege a outra recriada de modo inseguro", () => {
    const misto = `-- Cita as duas views protegidas no mesmo arquivo.
DROP VIEW public.vw_catalogo_ficha_produtos;
CREATE VIEW public.vw_catalogo_ficha_produtos AS SELECT 1 AS x;
DO $fix$
DECLARE
  v_views text[] := ARRAY['vw_esteira_laboratorio'];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_views LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_name);
  END LOOP;
END
$fix$;`;
    const states = finalStatesFor([
      { file: "000_base.sql", sql: baseline },
      { file: "999_misto.sql", sql: misto },
    ]);

    // A view corretamente reafirmada continua segura...
    expect(states["vw_esteira_laboratorio"].state).toBe("invoker");
    // ...e a recriada sem reafirmação é reprovada especificamente.
    expect(states["vw_catalogo_ficha_produtos"].state).toBe("unsafe");
    expect(states["vw_catalogo_ficha_produtos"].lastFile).toBe("999_misto.sql");
  });

  it("reafirmação dinâmica só vale quando a view está na lista do bloco que executa o ALTER", () => {
    const sql = `DO $x$
DECLARE v_views text[] := ARRAY['vw_esteira_laboratorio'];
BEGIN
  FOREACH v_name IN ARRAY v_views LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_name);
  END LOOP;
END
$x$;
-- comentário citando vw_fluxo_visita_tecnica sem reafirmá-la`;
    expect(eventsFor(sql, "vw_esteira_laboratorio").some((e) => e.kind === "invoker_true")).toBe(true);
    expect(eventsFor(sql, "vw_fluxo_visita_tecnica").length).toBe(0);
  });

  it("a P4 real reafirma dinamicamente as cinco views (não é falso positivo de arquivo)", () => {
    const p4 = readFileSync(
      resolve(MIGRATIONS, "20260930030000_h7o_p4_reafirmar_security_invoker_views_v1.sql"),
      "utf8",
    );
    for (const view of PROTECTED_VIEWS) {
      expect(
        eventsFor(p4, view).some((e) => e.kind === "invoker_true"),
        `P4 não reafirma dinamicamente ${view}`,
      ).toBe(true);
    }
  });
});
