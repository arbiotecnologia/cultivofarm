import { saveSchema, viewSchema } from "./_shared/contract.ts";

export interface ActorClient {
  auth: { getUser(): PromiseLike<{data: {user: {id: string} | null}; error: unknown}> };
  rpc(name: string, args?: Record<string,unknown>): PromiseLike<{data:unknown;error: {code?:string;message?:string} | null}>;
}
export interface HandlerDeps {
  canonicalUrl: string;
  reviewed: boolean;
  client(authorization: string): ActorClient;
  trustedOrigin(origin: string): boolean;
  cors(origin: string | null): Record<string,string>;
}
export function createTenantSmtpHandler(deps: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("Origin");
    const response = (status:number, body:unknown) => new Response(JSON.stringify(body), {status,headers:{...deps.cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
    if (origin && !deps.trustedOrigin(origin)) return response(403,{code:"SMTP_FORBIDDEN"});
    if (req.method === "OPTIONS") return new Response(null,{status:204,headers:deps.cors(origin)});
    if (!["GET","PUT"].includes(req.method)) return response(405,{code:"SMTP_INVALID"});
    if (deps.canonicalUrl !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || !deps.reviewed) return response(503,{code:"SMTP_UNAVAILABLE"});
    const auth = req.headers.get("Authorization") ?? "";
    if (!/^Bearer [^\s]+$/.test(auth)) return response(401,{code:"SMTP_UNAUTHORIZED"});
    try {
      const client = deps.client(auth);
      const user = await client.auth.getUser();
      if (user.error || !user.data.user) return response(401,{code:"SMTP_UNAUTHORIZED"});
      const scope = await client.rpc("tenant_email_settings_scope");
      if (scope.error) return response(500,{code:"SMTP_INTERNAL"});
      if (scope.data !== true) return response(403,{code:"SMTP_FORBIDDEN"});
      let args: Record<string,unknown> | undefined;
      if (req.method === "PUT") {
        // Bound stream rather than trusting Content-Length. Do not log body/validation issues.
        const reader = req.body?.getReader();
        if (!reader) return response(400,{code:"SMTP_INVALID"});
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 32768) { await reader.cancel(); return response(400,{code:"SMTP_INVALID"}); }
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size); let offset=0;
        for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
        let raw: unknown;
        try {raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));} catch {return response(400,{code:"SMTP_INVALID"});}
        const parsed=saveSchema.safeParse(raw);
        if (!parsed.success) return response(400,{code:"SMTP_INVALID"});
        args={p_expected_version:parsed.data.expected_version,p_config:parsed.data.config,p_password:parsed.data.password ?? null};
      }
      const result=await client.rpc(req.method === "GET" ? "tenant_email_settings_get" : "tenant_email_settings_save", args);
      if (result.error) {
        const code=result.error.code === "40001" ? "SMTP_CONFLICT" : result.error.code === "42501" ? "SMTP_FORBIDDEN" : result.error.code === "22023" ? "SMTP_INVALID" : "SMTP_INTERNAL";
        return response(code === "SMTP_CONFLICT" ? 409 : code === "SMTP_FORBIDDEN" ? 403 : code === "SMTP_INVALID" ? 400 : 500,{code});
      }
      const parsed=viewSchema.safeParse(result.data);
      return parsed.success ? response(200,parsed.data) : response(500,{code:"SMTP_INTERNAL"});
    } catch {return response(500,{code:"SMTP_INTERNAL"});}
  };
}
