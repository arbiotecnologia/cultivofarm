# Runbook — deploy da função de geração de ficha com IA (não executado)

Escopo: apenas o fluxo "Gerar com IA" das fichas do Catálogo.
Destino único permitido: projeto Supabase CultivoFarm `swzpzcwiasxmjutrmvkm`.

## Função

- Nome exato: `ai-generate-ficha-campo`
- Caminho: `supabase/functions/ai-generate-ficha-campo/index.ts`
- Módulo compartilhado: `supabase/functions/_shared/ficha-ia/contract.ts`
- Verificação de JWT: obrigatória (a função exige `Authorization: Bearer` e valida a sessão).
- Papéis autorizados: `administrador`, `gestor`, `consultor_tecnico`, `tecnico_agronomo`.

## Secrets necessários (somente nomes, sem valores)

- `LOVABLE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Nenhum desses valores existe no frontend, no bundle, nos logs ou nas respostas da função.

## Passos de deploy (executar fora deste ambiente, com autorização)

1. `supabase login`
2. `supabase link --project-ref swzpzcwiasxmjutrmvkm`
3. Confirmar que os três secrets acima existem no projeto (`supabase secrets list`).
4. `supabase functions deploy ai-generate-ficha-campo`
5. Smoke autenticado na prévia: abrir a ficha de um microrganismo, gerar em uma finalidade,
   conferir preenchimento do rascunho, aviso de revisão humana e ausência de salvamento automático.

## Enquanto não houver deploy

A interface trata `404` como "geração com IA ainda não disponível neste ambiente",
com mensagem acessível e sem spinner infinito.
