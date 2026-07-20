const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_ROLES = ['administrador', 'gestor'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return j({ error: 'Não autenticado' }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userRes } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j({ error: 'Sessão inválida' }, 401);

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const userRoles = (roles ?? []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => ADMIN_ROLES.includes(r))) {
      return j({ error: 'Apenas administradores/gestores podem disparar' }, 403);
    }

    const body = await req.json();
    const { action } = body || {};

    if (action === 'start') {
      const { entidade_tipos, campos, ids } = body;
      if (!Array.isArray(entidade_tipos) || entidade_tipos.length === 0) return j({ error: 'entidade_tipos vazio' }, 400);
      if (!Array.isArray(campos) || campos.length === 0) return j({ error: 'campos vazio' }, 400);

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
      if (jobErr) return j({ error: jobErr.message }, 500);

      // Dispara processamento assíncrono (não aguarda)
      EdgeRuntime.waitUntil(processJob(supabase, job.id, items, authHeader));

      return j({ job_id: job.id, total: items.length });
    }

    if (action === 'status') {
      const { job_id } = body;
      const { data } = await supabase.from('ai_refresh_jobs').select('*').eq('id', job_id).maybeSingle();
      return j({ job: data });
    }

    return j({ error: 'action inválido' }, 400);
  } catch (e: any) {
    return j({ error: e.message || String(e) }, 500);
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

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
