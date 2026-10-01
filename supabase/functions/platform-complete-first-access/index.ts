// Conclusão do primeiro acesso (troca obrigatória de senha temporária).
//
// Segurança:
// - Autenticado pelo JWT do próprio usuário (getClaims); nada de confiar em
//   user_metadata nem em estado do cliente.
// - O estado de primeiro acesso vive apenas no servidor
//   (profiles.senha_provisoria + platform_private.provisional_password_state,
//   verificados via RPC exclusiva de service_role).
// - A senha é atualizada pela Admin API; só depois — e se a atualização
//   falhar o estado permanece bloqueado — a marca de primeiro acesso é
//   limpa por função server-side transacional.
// - Nenhuma senha, hash, token ou link é registrado em logs ou auditoria.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    // (1) Identidade do chamador confirmada pelo JWT.
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Sessão inválida" }, 401);
    const callerId = claimsData.claims.sub as string;
    if (!callerId) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json().catch(() => null);
    const novaSenha = (body as Record<string, unknown> | null)?.nova_senha;

    // (3) Complexidade validada no servidor.
    if (!senhaValida(novaSenha)) {
      return json({ error: "A senha precisa ter de 8 a 128 caracteres, com letras e números." }, 400);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // (2) Estado server-only: o usuário está realmente no primeiro acesso?
    const { data: pendente, error: pendErr } = await adminClient.rpc(
      "platform_first_access_pending",
      { p_user_id: callerId },
    );
    if (pendErr) return json({ error: "Não foi possível validar seu acesso." }, 500);
    if (pendente !== true) {
      return json({ error: "Este acesso não está aguardando definição de senha." }, 409);
    }

    // (4) Atualização da senha pela Admin API.
    const { error: updError } = await adminClient.auth.admin.updateUserById(callerId, {
      password: novaSenha,
    });
    if (updError) {
      // Estado permanece bloqueado: nada é limpo em caso de falha.
      return json({ error: "Não foi possível salvar a nova senha. Tente novamente." }, 502);
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
      return json(
        { error: "Senha alterada, mas a liberação falhou. Tente entrar novamente com a nova senha." },
        500,
      );
    }

    return json({ success: true });
  } catch (_err) {
    return json({ error: "Falha inesperada ao concluir o primeiro acesso." }, 500);
  }
});
