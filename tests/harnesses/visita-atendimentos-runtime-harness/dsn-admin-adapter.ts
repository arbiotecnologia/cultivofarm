// ============================================================================
// Adaptador administrativo baseado em DSN (staging ikaauvsflpmamgxmkhoq).
//
// Motivo: o ambiente de execução não expõe SUPABASE_SERVICE_ROLE_KEY, mas expõe
// STAGING_DSN. Este adaptador reimplementa APENAS a superfície administrativa
// usada pelo runner T1–T18 (setup/cleanup/verificação), preservando a regra de
// que nenhum cenário funcional usa identidade administrativa — os cenários
// continuam rodando com sessões JWT reais via supabase-js/anon.
//
// Nenhum valor de DSN, senha, token ou hash é impresso ou retornado.
// ============================================================================
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

type Row = Record<string, unknown>;
type Res<T> = { data: T; error: { message: string } | null; count?: number | null };

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";

function ident(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error("identificador inválido");
  return `"${name}"`;
}

function qualified(table: string): string {
  return table.includes(".")
    ? table.split(".").map(ident).join(".")
    : `public.${ident(table)}`;
}

export class DsnAdmin {
  #client: Client;
  #connected = false;

  private constructor(client: Client) {
    this.#client = client;
  }

  static async connect(dsn: string): Promise<DsnAdmin> {
    if (!dsn) throw new Error("GUARD_ABORT: STAGING_DSN ausente");
    if (dsn.includes(PROD_REF)) throw new Error("GUARD_ABORT: DSN de PRODUCAO — execucao proibida");
    if (!dsn.includes(STAGING_REF)) throw new Error("GUARD_ABORT: DSN nao pertence ao staging autorizado");
    // CA opcional (PG_CA_FILE) para ambientes cuja cadeia TLS nao esta nos
    // certificados do sistema. Nenhum segredo e impresso.
    const caFile = Deno.env.get("PG_CA_FILE");
    const ca = caFile ? [await Deno.readTextFile(caFile)] : [];
    const u = new URL(dsn);
    const c = new Client({
      hostname: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, "") || "postgres",
      tls: { enabled: true, enforce: true, caCertificates: ca },
    });
    await c.connect();
    const marker = await c.queryObject<{ n: bigint; ref: string | null }>(
      `select count(*)::bigint as n, min(project_ref) as ref
         from public._fiscal_staging_marker where marker = 'STAGING'`,
    );
    const m = marker.rows[0];
    if (Number(m?.n ?? 0) !== 1 || m?.ref !== STAGING_REF) {
      await c.end();
      throw new Error("GUARD_ABORT: marcador de staging ausente/divergente");
    }
    const inst = new DsnAdmin(c);
    inst.#connected = true;
    return inst;
  }

  async close() {
    if (this.#connected) {
      await this.#client.end();
      this.#connected = false;
    }
  }

  async query<T extends Row = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
    const r = await this.#client.queryObject<T>({ text: sql, args });
    return r.rows;
  }

  from(table: string) {
    return new Builder(this, table);
  }

  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Res<unknown>> {
    const keys = Object.keys(args);
    const params = keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ");
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    try {
      const rows = await this.query<{ r: unknown }>(
        `select public.${ident(fn)}(${params}) as r`,
        values,
      );
      return { data: rows[0]?.r ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: String((e as Error).message ?? e) } };
    }
  }

  get storage() {
    const self = this;
    return {
      from(bucket: string) {
        return {
          async list(prefix: string, opts?: { limit?: number }) {
            try {
              const rows = await self.query<{ name: string }>(
                `select regexp_replace(o.name, '^' || $2 || '/', '') as name
                   from storage.objects o
                  where o.bucket_id = $1 and o.name like $2 || '/%'
                  limit $3`,
                [bucket, prefix.replace(/\/+$/, ""), opts?.limit ?? 100],
              );
              return { data: rows, error: null };
            } catch (e) {
              return { data: null, error: { message: String((e as Error).message ?? e) } };
            }
          },
          async remove(paths: string[]) {
            try {
              await self.query(
                `delete from storage.objects where bucket_id = $1 and name = any($2::text[])`,
                [bucket, paths],
              );
              return { data: paths, error: null };
            } catch (e) {
              return { data: null, error: { message: String((e as Error).message ?? e) } };
            }
          },
        };
      },
    };
  }

  get auth() {
    const self = this;
    return {
      admin: {
        async createUser(input: {
          email: string;
          password: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        }) {
          try {
            const rows = await self.query<{ id: string }>(
              `with novo as (
                 insert into auth.users (
                   instance_id, id, aud, role, email, encrypted_password,
                   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                   created_at, updated_at
                 ) values (
                   '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                   'authenticated', 'authenticated', $1,
                   extensions.crypt($2, extensions.gen_salt('bf')),
                   case when $3 then now() else null end,
                   '{"provider":"email","providers":["email"]}'::jsonb,
                   $4::jsonb, now(), now()
                 ) returning id, email
               ), ident as (
                 insert into auth.identities (
                   provider_id, user_id, identity_data, provider, last_sign_in_at,
                   created_at, updated_at
                 )
                 select n.id::text, n.id,
                        jsonb_build_object('sub', n.id::text, 'email', n.email, 'email_verified', true),
                        'email', now(), now(), now()
                   from novo n
                 returning user_id
               )
               select id::text as id from novo`,
              [input.email, input.password, input.email_confirm ?? true, JSON.stringify(input.user_metadata ?? {})],
            );
            return { data: { user: { id: rows[0].id } }, error: null };
          } catch (e) {
            return { data: { user: null }, error: { message: String((e as Error).message ?? e) } };
          }
        },
        async deleteUser(id: string) {
          try {
            await self.query(`delete from auth.users where id = $1::uuid`, [id]);
            return { data: null, error: null };
          } catch (e) {
            return { data: null, error: { message: String((e as Error).message ?? e) } };
          }
        },
        async getUserById(id: string) {
          const rows = await self.query<{ id: string }>(
            `select id::text as id from auth.users where id = $1::uuid`,
            [id],
          );
          return { data: { user: rows[0] ? { id: rows[0].id } : null }, error: null };
        },
      },
    };
  }
}

type Filter = { op: "eq" | "in"; col: string; value: unknown };

class Builder implements PromiseLike<Res<unknown>> {
  #admin: DsnAdmin;
  #table: string;
  #mode: "select" | "insert" | "upsert" | "delete" = "select";
  #columns = "*";
  #payload: Row[] = [];
  #onConflict: string | null = null;
  #filters: Filter[] = [];
  #count = false;
  #head = false;
  #single: "single" | "maybe" | null = null;
  #returning = false;

  constructor(admin: DsnAdmin, table: string) {
    this.#admin = admin;
    this.#table = table;
  }

  insert(payload: Row | Row[]) {
    this.#mode = "insert";
    this.#payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.#mode = "upsert";
    this.#payload = Array.isArray(payload) ? payload : [payload];
    this.#onConflict = opts?.onConflict ?? null;
    return this;
  }

  delete() {
    this.#mode = "delete";
    return this;
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.#mode === "insert" || this.#mode === "upsert" || this.#mode === "delete") {
      this.#returning = true;
      this.#columns = columns;
      return this;
    }
    this.#columns = columns;
    this.#count = opts?.count === "exact";
    this.#head = opts?.head === true;
    return this;
  }

  eq(col: string, value: unknown) {
    this.#filters.push({ op: "eq", col, value });
    return this;
  }

  in(col: string, value: unknown[]) {
    this.#filters.push({ op: "in", col, value });
    return this;
  }

  single() {
    this.#single = "single";
    return this;
  }

  maybeSingle() {
    this.#single = "maybe";
    return this;
  }

  #where(args: unknown[]): string {
    if (this.#filters.length === 0) return "";
    const parts = this.#filters.map((f) => {
      if (f.op === "in") {
        const list = (f.value as unknown[]).map((v) => String(v));
        args.push(list);
        return `${ident(f.col)}::text = any($${args.length}::text[])`;
      }
      args.push(f.value);
      return `${ident(f.col)}::text = $${args.length}::text`;
    });
    return ` where ${parts.join(" and ")}`;
  }

  #cols(): string {
    if (this.#columns === "*" || this.#columns.trim() === "") return "*";
    return this.#columns
      .split(",")
      .map((c) => ident(c.trim()))
      .join(", ");
  }

  async #run(): Promise<Res<unknown>> {
    const args: unknown[] = [];
    const t = qualified(this.#table);
    try {
      if (this.#mode === "insert" || this.#mode === "upsert") {
        const keys = Object.keys(this.#payload[0]);
        const tuples = this.#payload
          .map((row) =>
            `(${keys
              .map((k) => {
                const v = row[k];
                args.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
                return `$${args.length}`;
              })
              .join(", ")})`
          )
          .join(", ");
        let sql = `insert into ${t} (${keys.map(ident).join(", ")}) values ${tuples}`;
        if (this.#mode === "upsert") {
          const conflict = (this.#onConflict ?? keys[0]).split(",").map((c) => ident(c.trim())).join(", ");
          const updates = keys.filter((k) => k !== this.#onConflict).map((k) => `${ident(k)} = excluded.${ident(k)}`);
          sql += ` on conflict (${conflict}) do update set ${updates.join(", ")}`;
        }
        sql += ` returning ${this.#returning ? this.#cols() : "*"}`;
        const rows = await this.#admin.query(sql, args);
        return this.#shape(rows);
      }

      if (this.#mode === "delete") {
        const sql = `delete from ${t}${this.#where(args)} returning *`;
        const rows = await this.#admin.query(sql, args);
        return this.#shape(rows);
      }

      if (this.#count) {
        const sql = `select count(*)::bigint as n from ${t}${this.#where(args)}`;
        const rows = await this.#admin.query<{ n: bigint }>(sql, args);
        const n = Number(rows[0]?.n ?? 0);
        return { data: this.#head ? null : [], error: null, count: n };
      }

      const sql = `select ${this.#cols()} from ${t}${this.#where(args)}`;
      const rows = await this.#admin.query(sql, args);
      return this.#shape(rows);
    } catch (e) {
      return { data: null, error: { message: String((e as Error).message ?? e) }, count: null };
    }
  }

  #shape(rows: Row[]): Res<unknown> {
    if (this.#single === "single") {
      if (rows.length !== 1) return { data: null, error: { message: "single: cardinalidade inesperada" } };
      return { data: rows[0], error: null };
    }
    if (this.#single === "maybe") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null, count: rows.length };
  }

  then<R1 = Res<unknown>, R2 = never>(
    onfulfilled?: ((value: Res<unknown>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.#run().then(onfulfilled, onrejected);
  }
}
