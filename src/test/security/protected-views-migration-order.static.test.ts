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
 */

const ROOT = resolve(__dirname, "../../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

const PROTECTED_VIEWS = [
  "vw_os_integridade_esteira",
  "vw_esteira_laboratorio",
  "vw_fluxo_visita_tecnica",
  "vw_catalogo_ficha_produtos",
  "vw_catalogo_ficha_microrganismos",
] as const;

type ViewState = "absent" | "invoker" | "unsafe";

/** Eventos relevantes de um arquivo, na ordem em que aparecem no SQL. */
type Event = { index: number; kind: "create" | "invoker_true" | "invoker_false" | "drop" };

function eventsFor(sql: string, view: string): Event[] {
  const events: Event[] = [];
  const push = (re: RegExp, kind: Event["kind"]) => {
    for (const m of sql.matchAll(re)) events.push({ index: m.index ?? 0, kind });
  };

  const name = `(?:public\\.)?${view}`;
  push(
    new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${name}\\b`, "gi"),
    "create",
  );
  push(new RegExp(`\\bdrop\\s+view\\s+(?:if\\s+exists\\s+)?${name}\\b`, "gi"), "drop");
  // ALTER VIEW ... SET (security_invoker = true|false) e CREATE ... WITH (security_invoker = ...)
  push(
    new RegExp(`\\b(?:alter\\s+view|create\\s+(?:or\\s+replace\\s+)?view)\\s+(?:if\\s+exists\\s+)?${name}\\b[\\s\\S]{0,400}?security_invoker\\s*=\\s*true`, "gi"),
    "invoker_true",
  );
  push(
    new RegExp(`\\b(?:alter\\s+view|create\\s+(?:or\\s+replace\\s+)?view)\\s+(?:if\\s+exists\\s+)?${name}\\b[\\s\\S]{0,400}?security_invoker\\s*=\\s*false`, "gi"),
    "invoker_false",
  );

  return events.sort((a, b) => a.index - b.index);
}

function finalStates(): Record<string, { state: ViewState; lastFile: string }> {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const result: Record<string, { state: ViewState; lastFile: string }> = {};
  for (const view of PROTECTED_VIEWS) result[view] = { state: "absent", lastFile: "<nenhuma>" };

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS, file), "utf8");
    for (const view of PROTECTED_VIEWS) {
      if (!sql.includes(view)) continue;
      const events = eventsFor(sql, view);
      // Reafirmação dinâmica (bloco DO com EXECUTE format('ALTER VIEW ... security_invoker = true')
      // sobre uma lista que inclui esta view — padrão usado por H7N P0 e H7O P4).
      const dynamicReaffirm =
        !/security_invoker\s*=\s*false/i.test(sql) &&
        /security_invoker\s*=\s*true/i.test(sql);
      if (events.length === 0) {
        if (dynamicReaffirm) result[view] = { state: "invoker", lastFile: file };
        continue;
      }

      let state = result[view].state;
      for (const ev of events) {
        if (ev.kind === "create") state = state === "invoker" ? "invoker" : "unsafe";
        else if (ev.kind === "invoker_true") state = "invoker";
        else if (ev.kind === "invoker_false") state = "unsafe";
        else if (ev.kind === "drop") state = "absent";
      }
      // CREATE OR REPLACE nunca altera opções já existentes; DROP+CREATE zera.
      const dropped = events.some((e) => e.kind === "drop");
      const created = events.some((e) => e.kind === "create");
      let reaffirmed = events.some((e) => e.kind === "invoker_true");
      // Reafirmação dinâmica: bloco DO/EXECUTE format('ALTER VIEW ... security_invoker = true')
      // sobre uma lista que inclui esta view (padrão usado por H7N P0 e H7O P4).
      if (
        !reaffirmed &&
        /security_invoker\s*=\s*true/i.test(sql) &&
        !/security_invoker\s*=\s*false/i.test(sql)
      ) {
        reaffirmed = true;
        state = "invoker";
      }
      if (dropped && created && !reaffirmed) state = "unsafe";
      result[view] = { state, lastFile: file };
    }
  }
  return result;
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
