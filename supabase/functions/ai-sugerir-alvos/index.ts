const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TECH_ROLES = ['administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY ausente');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return j({ error: 'Não autenticado' }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userRes } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userRes?.user;
    if (!user) return j({ error: 'Sessão inválida' }, 401);

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const userRoles = (roles ?? []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => TECH_ROLES.includes(r))) {
      return j({ error: 'Sem permissão' }, 403);
    }

    const { entidade_tipo, entidade_id, max = 20 } = await req.json();
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

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: 'Responde estritamente em JSON válido.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (aiRes.status === 429) return j({ error: 'Limite de uso atingido. Tente novamente em instantes.' }, 429);
    if (aiRes.status === 402) return j({ error: 'Créditos de IA esgotados.' }, 402);
    if (!aiRes.ok) return j({ error: `IA falhou: ${(await aiRes.text()).slice(0, 200)}` }, 500);

    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const alvos = Array.isArray(parsed.alvos) ? parsed.alvos : [];
    return j({ alvos });
  } catch (e: any) {
    return j({ error: e.message || String(e) }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
