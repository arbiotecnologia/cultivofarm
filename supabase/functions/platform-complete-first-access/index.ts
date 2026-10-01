// Conclusão do primeiro acesso (troca obrigatória de senha temporária).
//
// Segurança:
// - Autenticado pelo JWT do próprio usuário (getClaims); nada do cliente é
//   usado como fonte de autorização (nem metadados da sessão).
// - O estado de primeiro acesso vive apenas no servidor
//   (profiles.senha_provisoria + platform_private.provisional_password_state,
//   verificados via RPC exclusiva de service_role).
// - A senha é atualizada pela Admin API; só depois — e se a atualização
//   falhar o estado permanece bloqueado — a marca de primeiro acesso é
//   limpa por função server-side transacional.
// - Nenhuma senha, hash, token ou link é registrado em logs ou auditoria.
//   Diagnóstico: apenas etapa + código/status técnico do erro (sem mensagens
//   de entrada do usuário e sem cabeçalhos).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Etapa =
  | "auth_header"
  | "auth_claims"
  | "config"
  | "payload"
  | "senha_fraca"
  | "pendencia_consulta"
  | "nao_pendente"
  | "senha_atualizacao"
  | "liberacao"
  | "inesperado";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const falha = (status: number, etapa: Etapa, error: string, codigo?: string | number | null) =>
  json({ error, etapa, codigo: codigo == null ? null : String(codigo).slice(0, 40) }, status);

// Log sem segredos: só etapa e código/status técnico.
function diag(etapa: Etapa, e: unknown) {
  const o = (e ?? {}) as Record<string, unknown>;
  const codigo = o.code ?? o.status ?? o.name ?? null;
  const msg = typeof o.message === "string" ? o.message.slice(0, 160) : null;
  console.error(JSON.stringify({ fn: "platform-complete-first-access", etapa, codigo, msg }));
  return codigo as string | number | null;
}

// Política de complexidade: 8–128 caracteres, com letra e dígito.
function senhaValida(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (s.length < 8 || s.length > 128) return false;
  return /[A-Za-z]/.test(s) && /\d/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return falha(401, "auth_header", "Sessão ausente. Entre novamente.");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      diag("config", { code: "env_missing" });
      return falha(500, "config", "Serviço indisponível no momento.", "env_missing");
    }

    // (1) Identidade do chamador confirmada pelo JWT.
    const anonClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.slice("Bearer ".length).trim();
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !callerId) {
      const c = claimsError ? diag("auth_claims", claimsError) : null;
      return falha(401, "auth_claims", "Sessão inválida ou expirada. Entre novamente.", c);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return falha(400, "payload", "Dados inválidos.");
    }
    const novaSenha = (body as Record<string, unknown>).nova_senha;

    // (3) Complexidade validada no servidor.
    if (!senhaValida(novaSenha)) {
      return falha(400, "senha_fraca", "A senha precisa ter de 8 a 128 caracteres, com letras e números.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // (2) Estado server-only: o usuário está realmente no primeiro acesso?
    const { data: pendente, error: pendErr } = await adminClient.rpc(
      "platform_first_access_pending",
      { p_user_id: callerId },
    );
    if (pendErr) {
      const c = diag("pendencia_consulta", pendErr);
      return falha(500, "pendencia_consulta", "Não foi possível validar seu acesso. Tente novamente.", c);
    }
    if (pendente !== true) {
      return falha(409, "nao_pendente", "Este acesso não está aguardando definição de senha.");
    }

    // (4) Atualização da senha pela Admin API.
    const { error: updError } = await adminClient.auth.admin.updateUserById(callerId, {
      password: novaSenha,
    });
    if (updError) {
      // Estado permanece bloqueado: nada é limpo em caso de falha.
      const c = diag("senha_atualizacao", updError);
      const codigo = String((updError as { code?: string }).code ?? "");
      const amigavel =
        codigo === "weak_password"
          ? "Senha recusada pela política de segurança (muito comum ou já exposta). Escolha outra."
          : codigo === "same_password"
            ? "A nova senha precisa ser diferente da senha temporária."
            : "Não foi possível salvar a nova senha. Tente novamente.";
      return falha(codigo === "weak_password" || codigo === "same_password" ? 422 : 502,
        "senha_atualizacao", amigavel, c);
    }

    // (5) Só depois da senha atualizada: limpa o estado de primeiro acesso em
    // uma única operação server-side transacional.
    const { error: concError } = await adminClient.rpc(
      "platform_conclude_provisional_password_server",
      { p_user_id: callerId },
    );
    if (concError) {
      // A senha foi alterada, mas a liberação falhou: o usuário permanece na
      // barreira e pode repetir a operação usando a nova senha.
      const c = diag("liberacao", concError);
      return falha(500, "liberacao",
        "Senha alterada, mas a liberação falhou. Tente entrar novamente com a nova senha.", c);
    }

    return json({ success: true });
  } catch (err) {
    const c = diag("inesperado", err);
    return falha(500, "inesperado", "Falha inesperada ao concluir o primeiro acesso.", c);
  }
});
