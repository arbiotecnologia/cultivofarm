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

const CAMPOS_PRODUTO = new Set([
  'resumo_curto', 'explicacao_tecnica', 'beneficio_combinado',
  'indicacoes_uso', 'janela_aplicacao', 'explicacao_produtor',
  'explicacao_b2b', 'cuidados_aplicacao', 'compatibilidade',
  'observacoes_regulatorias',
]);
const CAMPOS_MICRO = new Set([
  'resumo_curto', 'mecanismo_acao', 'beneficios_agronomicos',
  'explicacao_tecnica', 'explicacao_produtor', 'explicacao_b2b',
  'indicacoes_uso', 'cuidados_aplicacao', 'compatibilidade',
  'armazenamento', 'observacoes_regulatorias',
]);

const LABELS: Record<string, string> = {
  resumo_curto: 'resumo curto e consultivo (3-5 linhas)',
  explicacao_tecnica: 'explicação técnica para agrônomos',
  beneficio_combinado: 'descrição do benefício combinado da formulação',
  indicacoes_uso: 'indicações de uso (culturas, alvos, época)',
  janela_aplicacao: 'janela ideal de aplicação (estádio, condições climáticas)',
  explicacao_produtor: 'linguagem simples e direta para o produtor rural',
  explicacao_b2b: 'pitch comercial B2B para revendas/parceiros',
  cuidados_aplicacao: 'cuidados na aplicação (EPI, mistura, equipamentos)',
  compatibilidade: 'compatibilidade com outros produtos/insumos',
  observacoes_regulatorias: 'observações regulatórias e legais (genéricas, sem números de registro)',
  mecanismo_acao: 'mecanismo de ação biológico detalhado',
  beneficios_agronomicos: 'benefícios agronômicos (produtividade, sanidade, solo)',
  armazenamento: 'condições de armazenamento e validade',
};

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

    const body = await req.json();
    const { entidade_tipo, entidade_id, campo, origem = 'ia_manual', job_id } = body || {};
    if (!['produto', 'microrganismo'].includes(entidade_tipo)) return j({ error: 'entidade_tipo inválido' }, 400);
    if (typeof entidade_id !== 'string') return j({ error: 'entidade_id ausente' }, 400);
    const validos = entidade_tipo === 'produto' ? CAMPOS_PRODUTO : CAMPOS_MICRO;
    if (!validos.has(campo)) return j({ error: `campo inválido para ${entidade_tipo}` }, 400);

    // Contexto
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
        return `- ${m?.nome ?? '?'}${m?.nome_cientifico ? ` (${m.nome_cientifico})` : ''}${f.concentracao ? ` — ${f.concentracao}` : ''}${m?.funcao_agronomica ? ` — ${m.funcao_agronomica}` : ''}`;
      }).join('\n') || '(sem composição cadastrada)';

      contexto = `Produto: ${prod.nome}${prod.codigo ? ` [${prod.codigo}]` : ''}\nTipo: ${prod.tipo}\nDescrição: ${prod.descricao ?? '-'}\nModo de ação cadastrado: ${prod.modo_acao ?? '-'}\nFunção completa: ${prod.funcao_completa ?? '-'}\nComposição microbiológica:\n${composicao}`;
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

      contexto = `Microrganismo: ${m.nome}${m.nome_cientifico ? ` (${m.nome_cientifico})` : ''}${m.codigo ? ` [${m.codigo}]` : ''}\nTipo: ${m.tipo}\nFunção agronômica: ${m.funcao_agronomica ?? '-'}\nDescrição: ${m.descricao ?? '-'}\nObservações: ${m.observacoes ?? '-'}`;
    }

    const prompt = `Você é um agrônomo sênior especialista em bioinsumos. Gere um texto técnico para o campo "${LABELS[campo] ?? campo}" da ficha técnica do ${entidade_tipo} abaixo.

Contexto:
${contexto}

${conteudoAtual ? `Texto atualmente aprovado (sugira melhoria/atualização, não repita literalmente):\n${conteudoAtual}\n` : ''}
Regras:
- Português do Brasil, tom técnico-consultivo.
- Não invente registros oficiais, doses específicas ou números regulatórios.
- Não substitui prescrição agronômica.
- Texto direto, sem cabeçalhos.
- Tamanho proporcional ao campo (4 a 12 linhas).

Responda APENAS com um JSON: {"texto":"...","justificativa":"..."}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': LOVABLE_API_KEY,
        'X-Lovable-AIG-SDK': 'direct-fetch',
      },
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
    if (aiRes.status === 402) return j({ error: 'Créditos de IA esgotados. Adicione créditos em Configurações → Planos e créditos.' }, 402);
    if (aiRes.status === 403) {
      const detalhe = (await aiRes.text().catch(() => '')).slice(0, 300);
      return j({
        error: 'Geração por IA indisponível no momento: o limite de créditos de IA do workspace foi atingido (limite diário ou saldo). Aguarde a renovação diária ou adicione créditos em Configurações → Planos e créditos.',
        detalhe: detalhe || null,
      }, 403);
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return j({ error: `IA falhou: ${txt.slice(0, 200)}` }, 500);
    }

    const aiData = await aiRes.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? '{}';
    let parsed: { texto?: string; justificativa?: string } = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const texto = (parsed.texto ?? '').trim();
    if (!texto) return j({ error: 'IA retornou resposta vazia' }, 500);

    const mudou = !conteudoAtual || conteudoAtual.trim() !== texto.trim();
    let versaoId: string | null = null;
    if (mudou) {
      const { data: insRes, error: insErr } = await supabase
        .from('ficha_tecnica_versoes')
        .insert({
          entidade_tipo, entidade_id, profile_id: profileId, campo,
          conteudo_anterior: conteudoAtual, conteudo_novo: texto,
          origem, status: 'pendente', modelo_ia: 'openai/gpt-5-mini',
          job_id: job_id ?? null, criado_por: user.id,
          observacao: parsed.justificativa ?? null,
        })
        .select('id').single();
      if (insErr) return j({ error: `Erro ao gravar versão: ${insErr.message}` }, 500);
      versaoId = insRes.id;
    }

    return j({ texto, justificativa: parsed.justificativa ?? null, versao_id: versaoId, mudou });
  } catch (e: any) {
    return j({ error: e.message || String(e) }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
