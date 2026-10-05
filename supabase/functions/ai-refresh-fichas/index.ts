import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from '../_shared/comunicacao/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) return j(origin, { error: 'origin_not_allowed' }, 403);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return j(origin, { error: 'Não autenticado' }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j(origin, { error: 'Sessão inválida' }, 401);

    const { data: isSuperadmin, error: roleError } = await userClient.rpc('is_platform_superadmin', { _user_id: user.id });
    if (roleError) return j(origin, { error: 'role_check_failed' }, 500);
    if (!isSuperadmin) return j(origin, { error: 'forbidden' }, 403);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const { action } = body || {};

    if (action === 'start') {
      const { entidade_tipos, campos, ids } = body;
      if (!Array.isArray(entidade_tipos) || entidade_tipos.length === 0) return j(origin, { error: 'entidade_tipos vazio' }, 400);
      if (!Array.isArray(campos) || campos.length === 0) return j(origin, { error: 'campos vazio' }, 400);

      let items: Array<{ entidade_tipo: string; entidade_id: string; campo: string }> = [];
      for (const tipo of entidade_tipos) {
        let q = supabase.from(tipo === 'produto' ? 'produtos' : 'microrganismos').select('id');
        if (Array.isArray(ids) && ids.length) q = q.in('id', ids);
        const { data: rows } = await q;
        for (const row of rows ?? []) {
          for (const campo of campos) items.push({ entidade_tipo: tipo, entidade_id: row.id, campo });
        }
      }

      const { data: job, error: jobErr } = await supabase.from('ai_refresh_jobs').insert({
        iniciado_por: user.id,
        escopo: { entidade_tipos, campos, ids: ids ?? null },
        status: 'processando',
        total_itens: items.length,
        modelo_ia: 'openai/gpt-5-mini',
      }).select('id').single();
      if (jobErr) return j(origin, { error: 'job_start_failed' }, 500);

      // Dispara processamento assíncrono (não aguarda)
      EdgeRuntime.waitUntil(processJob(supabase, job.id, items, authHeader));

      return j(origin, { job_id: job.id, total: items.length });
    }

    if (action === 'status') {
      const { job_id } = body;
      const { data } = await supabase.from('ai_refresh_jobs').select('*').eq('id', job_id).maybeSingle();
      return j(origin, { job: data });
    }

    return j(origin, { error: 'action_invalid' }, 400);
  } catch {
    return j(origin, { error: 'internal' }, 500);
  }
});

async function processJob(
  supabase: any,
  jobId: string,
  items: Array<{ entidade_tipo: string; entidade_id: string; campo: string }>,
  authHeader: string,
) {
  let processados = 0, sugestoes = 0, falhos = 0;
  const concurrency = 3;
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(async (item) => {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-generate-ficha-campo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({ ...item, origem: 'ia_global', job_id: jobId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }));
    for (const res of results) {
      processados++;
      if (res.status === 'fulfilled' && res.value?.mudou) sugestoes++;
      if (res.status === 'rejected') falhos++;
    }
    await supabase.from('ai_refresh_jobs').update({
      itens_processados: processados, itens_com_sugestao: sugestoes, itens_falhos: falhos,
    }).eq('id', jobId);
    await new Promise((r) => setTimeout(r, 500)); // pequeno respiro
  }
  await supabase.from('ai_refresh_jobs').update({
    status: 'concluido', concluido_em: new Date().toISOString(),
    itens_processados: processados, itens_com_sugestao: sugestoes, itens_falhos: falhos,
  }).eq('id', jobId);
}

function j(origin: string | null, b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  });
}
