/**
 * Fase Fiscal 3.12 — Comparador local de snapshots de paridade.
 *
 * Recebe dois JSONs SANITIZADOS (produzidos por scripts/fiscal-policy-parity-snapshot.sql
 * e revisados manualmente para remover qualquer campo sensível). Não acessa banco,
 * não faz I/O, não resolve nomes de projeto. Produz diff determinístico por categoria.
 */

export interface ParitySnapshot {
  phase?: string;
  schema?: string;
  expected?: {
    tables?: string[];
    views?: string[];
    functions?: string[];
  };
  policies?: { count?: number; items?: unknown[] };
  rls?: unknown[];
  object_grants?: unknown[];
  views?: unknown[];
  functions?: unknown[];
  function_grants?: unknown[];
  constraints?: unknown[];
  missing?: {
    tables?: string[];
    views?: string[];
    functions?: string[];
  };
  fingerprints?: Record<string, string>;
}

export type ParityCategory =
  | "policies"
  | "rls"
  | "object_grants"
  | "views"
  | "functions"
  | "function_grants"
  | "constraints";

export interface CategoryDiff {
  category: ParityCategory;
  equal: boolean;
  fingerprintA: string | null;
  fingerprintB: string | null;
  onlyInA: unknown[];
  onlyInB: unknown[];
}

export interface ParityDiffReport {
  globalEqual: boolean;
  globalFingerprintA: string | null;
  globalFingerprintB: string | null;
  categories: CategoryDiff[];
  missingDiff: {
    tables: { onlyInA: string[]; onlyInB: string[] };
    views: { onlyInA: string[]; onlyInB: string[] };
    functions: { onlyInA: string[]; onlyInB: string[] };
  };
}

const CATEGORIES: ParityCategory[] = [
  "policies",
  "rls",
  "object_grants",
  "views",
  "functions",
  "function_grants",
  "constraints",
];

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}

function toItems(cat: ParityCategory, snap: ParitySnapshot): unknown[] {
  if (cat === "policies") return snap.policies?.items ?? [];
  const v = snap[cat] as unknown;
  return Array.isArray(v) ? v : [];
}

function setDiff(a: unknown[], b: unknown[]): { onlyInA: unknown[]; onlyInB: unknown[] } {
  const bKeys = new Set(b.map(canonicalize));
  const aKeys = new Set(a.map(canonicalize));
  return {
    onlyInA: a.filter((x) => !bKeys.has(canonicalize(x))),
    onlyInB: b.filter((x) => !aKeys.has(canonicalize(x))),
  };
}

function stringSetDiff(a: string[] = [], b: string[] = []) {
  const bs = new Set(b);
  const as = new Set(a);
  return {
    onlyInA: a.filter((x) => !bs.has(x)),
    onlyInB: b.filter((x) => !as.has(x)),
  };
}

export function diffParitySnapshots(
  a: ParitySnapshot,
  b: ParitySnapshot,
): ParityDiffReport {
  const categories: CategoryDiff[] = CATEGORIES.map((cat) => {
    const ai = toItems(cat, a);
    const bi = toItems(cat, b);
    const { onlyInA, onlyInB } = setDiff(ai, bi);
    const fpA = a.fingerprints?.[cat] ?? null;
    const fpB = b.fingerprints?.[cat] ?? null;
    return {
      category: cat,
      equal: onlyInA.length === 0 && onlyInB.length === 0,
      fingerprintA: fpA,
      fingerprintB: fpB,
      onlyInA,
      onlyInB,
    };
  });

  const missingDiff = {
    tables: stringSetDiff(a.missing?.tables, b.missing?.tables),
    views: stringSetDiff(a.missing?.views, b.missing?.views),
    functions: stringSetDiff(a.missing?.functions, b.missing?.functions),
  };

  const missingEqual =
    missingDiff.tables.onlyInA.length === 0 &&
    missingDiff.tables.onlyInB.length === 0 &&
    missingDiff.views.onlyInA.length === 0 &&
    missingDiff.views.onlyInB.length === 0 &&
    missingDiff.functions.onlyInA.length === 0 &&
    missingDiff.functions.onlyInB.length === 0;

  return {
    globalEqual: categories.every((c) => c.equal) && missingEqual,
    globalFingerprintA: a.fingerprints?.global ?? null,
    globalFingerprintB: b.fingerprints?.global ?? null,
    categories,
    missingDiff,
  };
}
