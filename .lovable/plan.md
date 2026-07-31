# Habilitar microrganismo no fluxo B2B (staging)

Objetivo: fazer o microrganismo ser comprável de ponta a ponta no portal do parceiro — catálogo, simulação, pedido, recebível e nota fiscal simulada — eliminando o SKIP `FISC-05` da homologação.

Ambiente: exclusivamente staging `ikaauvsflpmamgxmkhoq`. Produção não será tocada e nada será publicado.

## O que foi verificado agora

- A massa sintética já tem 3 preços de matriz e 3 regras de preço para o microrganismo `FUN-5` (Trichoderma asperellum), nos planos HML-B2B-A/B/C, todos com assignment publicado.
- Esse mesmo microrganismo está com o indicador de venda B2B desligado. A função de catálogo só lista microrganismos com esse indicador ligado, e a resolução do carrinho recusa o item com `product_unavailable`. Essa é a causa exata do SKIP.
- A tabela de perfil fiscal de microrganismo não existe no banco de staging (existe apenas o arquivo de migration no repositório, nunca aplicado).
- O adapter fiscal simulado só busca perfil fiscal quando o item tem produto vinculado; para item de microrganismo ele cai direto no erro `FISCAL_PROFILE_INCOMPLETE`. Ou seja, mesmo liberando o catálogo, a emissão simulada falharia.

## Etapas

### 1. Liberar o microrganismo para venda B2B
Ligar o indicador de venda B2B do `FUN-5` (e registrar a alteração no inventário de fixtures de homologação, para reversão futura). Confirmar em seguida que ele aparece no catálogo do parceiro sintético com preço resolvido.

### 2. Criar a estrutura de perfil fiscal de microrganismo
Aplicar em staging a criação da tabela de perfis fiscais de microrganismo já desenhada no repositório: um perfil ativo por microrganismo, campos de classificação (NCM, CEST, origem, CFOP interno/interestadual, CST/CSOSN, PIS/COFINS/IPI), status do perfil, permissões e regras de acesso restritas a administrador, gestor e financeiro.

### 3. Cadastrar o perfil fiscal sintético do FUN-5
Perfil de homologação com NCM de inoculante/agente biológico, origem nacional, CFOP interno e interestadual, CST/CSOSN coerentes com o regime da empresa, marcado como sintético para permitir limpeza posterior.

### 4. Evoluir o adapter fiscal simulado (v4)
Passar a resolver o snapshot fiscal pela origem correta do item: produto usa o perfil de produto; microrganismo usa o perfil de microrganismo. Sem fallback cruzado. Mantém tudo o que já existe: guarda de staging, exigência de administrador autenticado, falha fechada quando o perfil está ausente/incompleto, conferência soma dos itens = total da nota = total do recebível e marcação de documento simulado.

### 5. Transformar o SKIP em asserção real no harness
Trocar o SKIP `FISC-05` por um cenário completo com item de microrganismo: simulação, pedido, aprovação, recebível e emissão simulada, verificando que o item fiscal nasce com classificação `MICROORGANISM` e com NCM/CFOP/CST vindos do perfil próprio do microrganismo. Acrescentar um caso negativo provando falha fechada quando o perfil do microrganismo está inativo.

### 6. Reexecutar e documentar
Rodar o harness completo (esperado: zero SKIP), rodar typecheck, build e a suíte de testes, e atualizar o relatório de homologação removendo a ressalva do microrganismo. Atualizar também o script de limpeza final e o manifesto de promoção com os novos artefatos.

## Detalhes técnicos

- Dado: `public.microrganismos.b2b_enabled = true` para `FUN-5`, registrado em `public.hml_fixture_registry`.
- Schema: aplicar `microorganism_fiscal_profiles` (tabela, índice único de perfil ativo, GRANTs, RLS) conforme `supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql`, que ainda não existe no banco de staging.
- Adapter: nova versão em `supabase/tests/homologacao-b2b/01-staging-infra/023_fiscal_mock_adapter_v4_micro.sql`, substituindo `rpc_hml_fiscal_emit_mock`; `fiscal_profile_snapshot.source` passa a indicar `product_fiscal_profiles` ou `microorganism_fiscal_profiles`.
- Harness: `supabase/functions/hml-b2b-runtime-harness/index.ts` — FISC-05 vira PASS e entra FISC-06 (perfil de microrganismo inativo → `FISCAL_PROFILE_INCOMPLETE`, sem efeitos colaterais).
- Documentos: `docs/homologacao-b2b-nacional.md`, `supabase/tests/homologacao-b2b/MANIFESTO.md`, `supabase/tests/homologacao-b2b/99-cleanup-final.sql`.

## Fora de escopo

Emissão fiscal real com provedor homologado e validação contábil dos NCM/CFOP sintéticos permanecem pendências declaradas; o perfil criado é de homologação, com status de rascunho.
