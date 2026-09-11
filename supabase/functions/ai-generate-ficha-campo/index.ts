import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  MAX_PAYLOAD_BYTES,
  blocoContextoMicrorganismo,
  construirPrompt,
  parseRespostaIA,
  sanitizarDado,
  validarRequisicao,
} from '../_shared/ficha-ia/contract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TECH_ROLES = ['administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo'];
const AI_TIMEOUT_MS = 45_000;
const MODELO = 'openai/gpt-5-mini';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'Método não suportado' }, 405);
  try {
    if (!LOVABLE_API_KEY) return j({ error: 'Geração por IA indisponível (configuração ausente)' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Não autenticado' }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userRes } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j({ error: 'Sessão inválida' }, 401);

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const userRoles = (roles ?? []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => TECH_ROLES.includes(r))) {
      return j({ error: 'Sem permissão' }, 403);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) return j({ error: 'Requisição maior que o permitido' }, 413);
    let parsedBody: unknown = null;
    try { parsedBody = JSON.parse(rawBody); } catch { return j({ error: 'Requisição inválida' }, 400); }

    const validacao = validarRequisicao(parsedBody, rawBody.length);
    if (!validacao.ok) return j({ error: validacao.error }, validacao.status);
    const { entidade_tipo, entidade_id, campo, origem, job_id } = validacao.value;

    let contexto = '';
    let conteudoAtual: string | null = null;
    let profileId: string | null = null;

    if (entidade_tipo === 'produto') {
      const { data: prod } = await supabase
        .from('produtos')
        .select('id, codigo, nome, tipo, descricao, modo_acao, funcao_completa')
        .eq('id', entidade_id).maybeSingle();
      if (!prod) return j({ error: 'Produto não encontrado' }, 404);

      const { data: prof } = await supabase
        .from('product_technical_profiles')
        .select('*').eq('produto_id', entidade_id).maybeSingle();
      profileId = prof?.id ?? null;
      conteudoAtual = (prof as any)?.[campo] ?? null;

      const { data: forms } = await supabase
        .from('formulacoes')
        .select('microrganismo_id, concentracao, microrganismos(nome,nome_cientifico,funcao_agronomica)')
        .eq('produto_id', entidade_id);
      const composicao = (forms ?? []).map((f: any) => {
        const m = f.microrganismos;
        return `- ${sanitizarDado(m?.nome, 120)} (${sanitizarDado(m?.nome_cientifico, 120)})${f.concentracao ? ` — ${sanitizarDado(f.concentracao, 60)}` : ''}`;
      }).join('\n') || '(sem composição cadastrada)';

      contexto = [
        `Produto: ${sanitizarDado(prod.nome, 160)} [${sanitizarDado(prod.codigo, 60)}]`,
        `Tipo: ${sanitizarDado(prod.tipo, 80)}`,
        `Descrição: ${sanitizarDado(prod.descricao)}`,
        `Modo de ação cadastrado: ${sanitizarDado(prod.modo_acao)}`,
        `Função completa: ${sanitizarDado(prod.funcao_completa)}`,
        `Composição microbiológica:\n${composicao}`,
      ].join('\n');
    } else {
      const { data: m } = await supabase
        .from('microrganismos')
        .select('id, codigo, nome, nome_cientifico, tipo, funcao_agronomica, descricao, observacoes')
        .eq('id', entidade_id).maybeSingle();
      if (!m) return j({ error: 'Microrganismo não encontrado' }, 404);

      const { data: prof } = await supabase
        .from('microorganism_technical_profiles')
        .select('*').eq('microrganismo_id', entidade_id).maybeSingle();
      profileId = prof?.id ?? null;
      conteudoAtual = (prof as any)?.[campo] ?? null;

      contexto = blocoContextoMicrorganismo(m as any);
    }

    const prompt = construirPrompt({ entidadeTipo: entidade_tipo, campo, contexto, conteudoAtual });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    let aiRes: Response;
    try {
      aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'Lovable-API-Key': LOVABLE_API_KEY,
          'X-Lovable-AIG-SDK': 'direct-fetch',
        },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: 'system', content: 'Responde estritamente em JSON válido.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
    } catch {
      return j({ error: 'A geração demorou demais. Tente novamente.' }, 504);
    } finally {
      clearTimeout(timer);
    }

    if (aiRes.status === 429) return j({ error: 'Limite de uso atingido. Tente novamente em instantes.' }, 429);
    if (aiRes.status === 402) return j({ error: 'Créditos de IA esgotados.' }, 402);
    if (aiRes.status === 403) return j({ error: 'Geração por IA indisponível: limite de créditos do workspace atingido.' }, 403);
    if (!aiRes.ok) return j({ error: 'Serviço de IA indisponível no momento.' }, 502);

    const aiData = await aiRes.json().catch(() => null);
    let resultado;
    try {
      resultado = parseRespostaIA(aiData?.choices?.[0]?.message?.content ?? '');
    } catch {
      return j({ error: 'A IA retornou uma resposta inválida. Tente novamente.' }, 502);
    }

    const mudou = !conteudoAtual || conteudoAtual.trim() !== resultado.texto;
    let versaoId: string | null = null;
    if (mudou) {
      const { data: insRes, error: insErr } = await supabase
        .from('ficha_tecnica_versoes')
        .insert({
          entidade_tipo, entidade_id, profile_id: profileId, campo,
          conteudo_anterior: conteudoAtual, conteudo_novo: resultado.texto,
          origem, status: 'pendente', modelo_ia: MODELO,
          job_id: job_id ?? null, criado_por: user.id,
          observacao: resultado.justificativa,
        })
        .select('id').single();
      if (insErr) return j({ error: 'Não foi possível registrar a versão sugerida.' }, 500);
      versaoId = insRes.id;
    }

    return j({
      texto: resultado.texto,
      justificativa: resultado.justificativa,
      versao_id: versaoId,
      mudou,
      rascunho: true,
    });
  } catch {
    return j({ error: 'Erro inesperado ao gerar com IA.' }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
