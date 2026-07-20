import { vi } from "vitest";

type Row = Record<string, any>;
type TableData = Row[];

interface MockState {
  tables: Map<string, TableData>;
  callCount: Map<string, number>;
  inserts: Map<string, Row[]>;
}

const state: MockState = {
  tables: new Map(),
  callCount: new Map(),
  inserts: new Map(),
};

export function resetSupabaseMock() {
  state.tables.clear();
  state.callCount.clear();
  state.inserts.clear();
}

export function setTableData(table: string, rows: TableData) {
  state.tables.set(table, rows);
}

export function getCallCount(table: string): number {
  return state.callCount.get(table) ?? 0;
}

export function getInserts(table: string): Row[] {
  return state.inserts.get(table) ?? [];
}

/**
 * Chainable builder that resolves to { data, error }.
 * Accepts every PostgREST-ish modifier the app uses and returns itself,
 * so any chain length works. `await`-ing it (thenable) returns the data.
 */
function makeBuilder(table: string, op: "select" | "insert" | "update" | "delete" = "select", payload?: any) {
  const rows = state.tables.get(table) ?? [];
  state.callCount.set(table, (state.callCount.get(table) ?? 0) + 1);

  let resolveValue: any;
  if (op === "insert") {
    const list = Array.isArray(payload) ? payload : [payload];
    state.inserts.set(table, [...(state.inserts.get(table) ?? []), ...list]);
    resolveValue = { data: list, error: null };
  } else {
    resolveValue = { data: rows, error: null, count: rows.length };
  }

  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn((p: any) => makeBuilder(table, "insert", p)),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    like: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    or: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    overlaps: vi.fn(() => builder),
    match: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
    then: (onF: any, onR: any) => Promise.resolve(resolveValue).then(onF, onR),
  };
  return builder;
}

export const supabaseMock = {
  from: vi.fn((table: string) => makeBuilder(table)),
  auth: {
    getUser: vi.fn(() =>
      Promise.resolve({ data: { user: { id: "test-user", email: "t@t.com" } }, error: null }),
    ),
    getSession: vi.fn(() =>
      Promise.resolve({ data: { session: null }, error: null }),
    ),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
  functions: {
    invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
};
