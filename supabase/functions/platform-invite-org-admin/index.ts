// Provisionamento de Administrador de Empresa pelo Superadmin de Plataforma.
//
// Segurança:
// - JWT obrigatório e validado em código (config.toml: verify_jwt = true).
// - Somente `superadmin` (verificado no servidor via is_platform_superadmin).
// - A intenção é persistida antes do Auth e retomada com lease/fencing.
// - O papel `superadmin` NUNCA é concedido aqui; o usuário criado recebe
//   exclusivamente `administrador` da empresa indicada.
// - Nenhum segredo é devolvido além da senha temporária solicitada pelo
//   próprio superadmin no momento da criação.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function senhaTemporaria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  // Garante complexidade mínima (letra, número e símbolo).
  return `${base}#7`;
}

function soDigitos(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Sessão inválida" }, 401);
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: isSuper, error: superErr } = await adminClient.rpc("is_platform_superadmin", {
      _user_id: callerId,
    });
    if (superErr) return json({ error: "Não foi possível validar sua permissão." }, 500);
    if (isSuper !== true) {
      return json({ error: "Apenas o superadmin de plataforma pode convidar administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Dados inválidos." }, 400);

    const organizationId = String((body as Record<string, unknown>).organization_id ?? "");
    const nome = String((body as Record<string, unknown>).nome ?? "").trim();
    const email = String((body as Record<string, unknown>).email ?? "").trim().toLowerCase();
    const cpf = soDigitos((body as Record<string, unknown>).cpf);
    const telefone = soDigitos((body as Record<string, unknown>).telefone);
    const modo = String((body as Record<string, unknown>).modo_acesso ?? "link");
    const responsavelPrincipal =
      (body as Record<string, unknown>).responsavel_principal !== false;

    if (!UUID_RE.test(organizationId)) return json({ error: "Selecione a empresa." }, 400);
    if (nome.length < 3 || nome.length > 200) return json({ error: "Informe o nome completo." }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (cpf && cpf.length !== 11) return json({ error: "CPF deve ter 11 dígitos." }, 400);
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
      return json({ error: "Telefone deve ter 10 ou 11 dígitos." }, 400);
    }
    if (modo !== "link" && modo !== "senha_temporaria") {
      return json({ error: "Modo de acesso inválido." }, 400);
    }

    // Redirect somente para origens conhecidas (evita open redirect).
    const origin = req.headers.get("origin") ?? "";
    const origemPermitida = /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/.test(origin) ||
      /^https:\/\/([a-z0-9-]+\.)*cultivofarm\.com\.br$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin);
    const redirectTo = origemPermitida ? `${origin}/auth` : undefined;

    const { data: claimed, error: claimError } = await anonClient.rpc(
      "platform_claim_org_admin_provisioning",
      {
        p_organization_id: organizationId,
        p_email: email,
        p_nome: nome,
        p_cpf_cnpj: cpf,
        p_telefone: telefone,
        p_modo_acesso: modo,
        p_responsavel_principal: responsavelPrincipal,
      },
    );
    if (claimError || !claimed) {
      const code = claimError?.code === "55P03" ? "provisioning_busy" : "claim_failed";
      return json({ error: code === "provisioning_busy" ? "Provisionamento já está em andamento." : "Não foi possível reservar o provisionamento.", code }, code === "provisioning_busy" ? 409 : 400);
    }
    const job = claimed as Record<string, unknown>;
    if (job.completed === true) {
      return json({ success: true, user_id: String(job.user_id ?? ""), action_link: null, senha_temporaria: null, status: "ativo", idempotent: true });
    }
    const jobId = String(job.job_id ?? "");
    const requestId = String(job.request_id ?? "");
    const leaseToken = String(job.lease_token ?? "");

    let userId: string | null = null;
    let actionLink: string | null = null;
    let senha: string | null = null;
    let criamosUsuario = false;

    // Retomada Auth↔DB: busca server-only exige o marcador imutável da intenção
    // em app_metadata. E-mail isolado e user_metadata nunca autorizam adoção.
    const { data: resumableId, error: resumeError } = await adminClient.rpc(
      "platform_find_org_admin_provisioning_auth_user",
      { p_job_id: jobId, p_lease_token: leaseToken },
    );
    if (resumeError) {
      await adminClient.rpc("platform_fail_org_admin_provisioning", {
        p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "resume_lookup_failed",
      });
      return json({ error: "Não foi possível retomar o provisionamento.", code: "resume_lookup_failed" }, 500);
    }
    if (typeof resumableId === "string" && UUID_RE.test(resumableId)) userId = resumableId;

    if (!userId && modo === "link") {
      // Cria primeiro com app_metadata server-only; generateLink(recovery) apenas
      // produz o link e não duplica a conta nem envia e-mail.
      const bootstrapPassword = senhaTemporaria();
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: bootstrapPassword,
        email_confirm: true,
        user_metadata: { nome, convidado_por_plataforma: true },
        app_metadata: { provisioning_request_id: requestId },
      });
      if (createError || !created?.user) {
        const jaExiste = (createError?.message ?? "").toLowerCase().includes("already");
        return json(
          {
            error: jaExiste
              ? "Já existe um acesso com este e-mail."
              : "Não foi possível gerar o convite.",
          },
          400,
        );
      }
      userId = created.user.id;
      criamosUsuario = true;
      const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery", email, options: redirectTo ? { redirectTo } : undefined,
      });
      if (linkError || !link?.properties?.action_link) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
        await adminClient.rpc("platform_fail_org_admin_provisioning", {
          p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "link_failed",
        });
        return json({ error: "Não foi possível gerar o convite.", code: "link_failed" }, 500);
      }
      actionLink = link.properties.action_link;
    } else if (!userId) {
      senha = senhaTemporaria();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome, convidado_por_plataforma: true },
        app_metadata: { provisioning_request_id: requestId },
      });
      if (error || !data?.user) {
        const jaExiste = (error?.message ?? "").toLowerCase().includes("already");
        return json(
          {
            error: jaExiste
              ? "Já existe um acesso com este e-mail."
              : "Não foi possível criar o acesso.",
          },
          400,
        );
      }
      userId = data.user.id;
      criamosUsuario = true;
    }

    if (!userId) return json({ error: "Não foi possível identificar o acesso.", code: "auth_missing" }, 500);

    const { error: rpcError } = await adminClient.rpc("platform_finalize_org_admin_provisioning", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_user_id: userId,
    });

    if (rpcError) {
      // Não deixar conta órfã: desfaz o acesso recém-criado.
      if (criamosUsuario && userId) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
      }
      await adminClient.rpc("platform_fail_org_admin_provisioning", {
        p_job_id: jobId, p_lease_token: leaseToken, p_error_code: "finalize_failed",
      });
      const m = rpcError.message ?? "";
      const amigavel = m.includes("platform_forbidden")
        ? "Permissão insuficiente para concluir o convite."
        : m.includes("platform_invalid")
          ? "Dados do administrador inválidos."
          : "Não foi possível concluir o cadastro do administrador.";
      return json({ error: amigavel, code: "finalize_failed" }, 400);
    }

    return json({
      success: true,
      user_id: userId,
      action_link: actionLink,
      senha_temporaria: senha,
      status: "pendente",
      idempotent: !criamosUsuario,
    });
  } catch (_err) {
    return json({ error: "Falha inesperada ao criar o acesso." }, 500);
  }
});

