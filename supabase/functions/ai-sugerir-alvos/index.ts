const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireActiveCatalogSuperadmin } from '../_shared/catalog-superadmin-guard.ts';

import { generateResponse, responseText, openAIModel, OpenAIError } from '../_shared/openai.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'Método não suportado' }, 405);
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return j({ error: 'Não autenticado' }, 401);

    if (!authHeader.startsWith('Bearer ')) return j({ error: 'Não autenticado' }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j({ error: 'Sessão inválida' }, 401);

    // Superadmin ativo/readiness antes de qualquer leitura privilegiada ou IA.
    const guard = await requireActiveCatalogSuperadmin(userClient, user.id);
    if (!guard.ok) return j({ error: guard.error }, guard.status);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { entidade_tipo, entidade_id, max: maxRaw = 20 } = await req.json();
    const max = Number.isInteger(maxRaw) && maxRaw >= 1 && maxRaw <= 30 ? maxRaw : 20;
    if (!['produto', 'microrganismo'].includes(entidade_tipo)) return j({ error: 'entidade_tipo inválido' }, 400);
    if (typeof entidade_id !== 'string') return j({ error: 'entidade_id ausente' }, 400);

    let contexto = '';
    if (entidade_tipo === 'produto') {
      const { data: prod } = await supabase
        .from('produtos')
        .select('nome, tipo, descricao, modo_acao, funcao_completa')
        .eq('id', entidade_id).maybeSingle();
      if (!prod) return j({ error: 'Produto não encontrado' }, 404);
      const { data: forms } = await supabase
        .from('formulacoes')
        .select('microrganismos(nome,nome_cientifico,funcao_agronomica)')
        .eq('produto_id', entidade_id);
      const comp = (forms ?? []).map((f: any) => {
        const m = f.microrganismos;
        return `- ${m?.nome ?? '?'}${m?.nome_cientifico ? ` (${m.nome_cientifico})` : ''}${m?.funcao_agronomica ? ` — ${m.funcao_agronomica}` : ''}`;
      }).join('\n') || '(sem composição)';
      contexto = `Produto: ${prod.nome}\nTipo: ${prod.tipo}\nFunção: ${prod.funcao_completa ?? '-'}\nModo de ação: ${prod.modo_acao ?? '-'}\nDescrição: ${prod.descricao ?? '-'}\nComposição:\n${comp}`;
    } else {
      const { data: m } = await supabase
        .from('microrganismos')
        .select('nome, nome_cientifico, tipo, funcao_agronomica, descricao')
        .eq('id', entidade_id).maybeSingle();
      if (!m) return j({ error: 'Microrganismo não encontrado' }, 404);
      contexto = `Microrganismo: ${m.nome}${m.nome_cientifico ? ` (${m.nome_cientifico})` : ''}\nTipo: ${m.tipo}\nFunção agronômica: ${m.funcao_agronomica ?? '-'}\nDescrição: ${m.descricao ?? '-'}`;
    }

    const prompt = `Você é um agrônomo sênior. Liste até ${max} alvos biológicos (pragas, doenças, nematoides ou outras categorias) reconhecidamente controlados/beneficiados pelo ${entidade_tipo} abaixo, baseando-se em literatura técnica consolidada.

Contexto:
${contexto}

Categorias válidas para "tipo": praga, doenca, nematoide, nutricao, solo, estresse, crescimento.

Regras:
- Use nome popular em PT-BR, com nome científico entre parênteses quando relevante.
- Não invente alvos sem respaldo técnico.
- Prioridade 1 (mais relevante) a 10 (menos relevante).
- Não substitui prescrição agronômica.

Responda APENAS com JSON: {"alvos":[{"nome":"...","tipo":"praga","prioridade":3,"justificativa":"..."}]}`;

    const aiData = await generateResponse({
      model: openAIModel(), reasoning: { effort: 'low' }, max_output_tokens: 6000,
      instructions: 'Responda estritamente em JSON válido.',
      input: prompt,
      text: { format: { type: 'json_schema', name: 'alvos', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['alvos'],
        properties: { alvos: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['nome', 'tipo', 'prioridade', 'justificativa'],
          properties: { nome: { type: 'string' }, tipo: { type: 'string', enum: ['praga','doenca','nematoide','nutricao','solo','estresse','crescimento'] },
            prioridade: { type: 'integer', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } },
        } } },
      } } },
    }, { signal: req.signal });
    const parsed = JSON.parse(responseText(aiData));
    if (!Array.isArray(parsed.alvos)) throw new OpenAIError(502, 'openai_invalid_response');
    const alvos = parsed.alvos.slice(0, max);
    return j({ alvos });
  } catch (e: any) {
    if (e instanceof OpenAIError) return j({ error: e.code }, e.httpStatus);
    console.error('ai-sugerir-alvos failed');
    return j({ error: 'Falha ao sugerir alvos' }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

