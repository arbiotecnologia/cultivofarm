import { requireActiveCatalogSuperadmin } from '../_shared/catalog-superadmin-guard.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  MAX_PAYLOAD_BYTES,
  blocoContextoMicrorganismo,
  construirPrompt,
  parseRespostaIA,
  sanitizarDado,
  validarRequisicao,
} from '../_shared/ficha-ia/contract.ts';
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from '../_shared/comunicacao/cors.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const AI_TIMEOUT_MS = 45_000;
const MODELO = 'gemini-3.8-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) return j(origin, { error: 'origin_not_allowed' }, 403);
  if (req.method !== 'POST') return j(origin, { error: 'Método não suportado' }, 405);
  try {
    if (!GEMINI_API_KEY) return j(origin, { error: 'Geração por IA indisponível (configuração ausente)' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return j(origin, { error: 'Não autenticado' }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j(origin, { error: 'Sessão inválida' }, 401);

    const guard = await requireActiveCatalogSuperadmin(userClient, user.id);
    if (!guard.ok) return j(origin, { error: guard.error }, guard.status);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const rawBody = await req.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) return j(origin, { error: 'Requisição maior que o permitido' }, 413);
    let parsedBody: unknown = null;
    try { parsedBody = JSON.parse(rawBody); } catch { return j(origin, { error: 'Requisição inválida' }, 400); }

    const validacao = validarRequisicao(parsedBody, rawBody.length);
    if (!validacao.ok) return j(origin, { error: validacao.error }, validacao.status);
    const { entidade_tipo, entidade_id, campo, origem, job_id } = validacao.value;

    let contexto = '';
    let conteudoAtual: string | null = null;
    let profileId: string | null = null;

    if (entidade_tipo === 'produto') {
      const { data: prod } = await supabase
        .from('produtos')
        .select('id, codigo, nome, tipo, descricao, modo_acao, funcao_completa')
        .eq('id', entidade_id).maybeSingle();
      if (!prod) return j(origin, { error: 'Produto não encontrado' }, 404);

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
      if (!m) return j(origin, { error: 'Microrganismo não encontrado' }, 404);

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
      aiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'Responda estritamente em JSON válido e siga as regras agronômicas fornecidas.' }],
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                texto: { type: 'STRING' },
                justificativa: { type: 'STRING' },
              },
              required: ['texto'],
            },
          },
        }),
      });
    } catch {
      return j(origin, { error: 'A geração demorou demais. Tente novamente.' }, 504);
    } finally {
      clearTimeout(timer);
    }

    if (aiRes.status === 429) return j(origin, { error: 'Limite de uso atingido. Tente novamente em instantes.' }, 429);
    if (aiRes.status === 401 || aiRes.status === 403) {
      return j(origin, { error: 'Geração por IA indisponível (credencial do provedor inválida).' }, 503);
    }
    if (!aiRes.ok) return j(origin, { error: 'Serviço de IA indisponível no momento.' }, 502);

    const aiData = await aiRes.json().catch(() => null);
    let resultado;
    try {
      const raw = (aiData?.candidates?.[0]?.content?.parts ?? [])
        .map((part: { text?: unknown }) => typeof part?.text === 'string' ? part.text : '')
        .join('');
      resultado = parseRespostaIA(raw);
    } catch {
      return j(origin, { error: 'A IA retornou uma resposta inválida. Tente novamente.' }, 502);
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
      if (insErr) return j(origin, { error: 'Não foi possível registrar a versão sugerida.' }, 500);
      versaoId = insRes.id;
    }

    return j(origin, {
      texto: resultado.texto,
      justificativa: resultado.justificativa,
      versao_id: versaoId,
      mudou,
      rascunho: true,
    });
  } catch {
    return j(origin, { error: 'Erro inesperado ao gerar com IA.' }, 500);
  }
});

function j(origin: string | null, b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  });
}

