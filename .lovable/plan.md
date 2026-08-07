# Remediação dos 3 bloqueios da auditoria final — Matriz Fiscal Mestre v1

Somente staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` proibida. Sem publicação e sem transmissão SEFAZ.

## B1 — Configuração de conexão divergente (`.env`)

O `.env` no HEAD voltou a apontar `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` para o backend Cloud acidental, enquanto `client.ts` e `config.toml` apontam para o staging. A higienização anterior foi sobrescrita.

Ação: realinhar as três variáveis públicas ao staging (URL, project id e a chave anon já existente em `client.ts`), preservando todas as demais variáveis. Como o arquivo é regenerado pelo binding do Cloud, adicionar um teste estático de guarda (`src/test/config/connection-binding.static.test.ts`) que falha se `.env`, `client.ts` e `config.toml` divergirem ou se qualquer referência ao backend acidental reaparecer.

## B2 — `types.ts` reduzido a stub (11 testes falhando)

`src/integrations/supabase/types.ts` está com 155 linhas (stub gerado contra o backend acidental), quebrando 4 arquivos de teste / 11 casos que verificam contrato de schema.

Ação: restaurar o contrato completo do staging (versão de 21.808 linhas já validada) e cobrir a regressão com o mesmo teste de guarda de B1 (limite mínimo de contrato + presença das relações exigidas), para que uma nova sobrescrita seja detectada pela suíte e não pela auditoria.

## B3 — Aprovação de candidato NCM não bloqueada por confiança CONDITIONAL

`rpc_regulatory_ncm_candidate_decide` exige fonte oficial, descrição, versão e data da tabela, mas não impede aprovar um candidato com `confidence = 'CONDITIONAL'`. Os 8 candidatos condicionais hoje têm fonte cadastrada, então a aprovação passaria.

Ação: migration incremental (novo timestamp, com a mesma trava de ambiente fail-closed já usada em `20260824000000`) que recria a função adicionando, no ramo de aprovação, a recusa `REGULATORY_NCM_CONDITIONAL_BLOCKED` enquanto a confiança for `CONDITIONAL`, exigindo reclassificação explícita para `HIGH`/`MEDIUM` antes da decisão. Sem alterar dados existentes.

## Risco residual (não bloqueante, decisão do usuário)

`public.fiscal_matrix_load_ledger` mantém GRANT amplo para `anon`; a RLS já nega leitura (0 linhas) e escrita. Opcionalmente revogar os privilégios de `anon` na mesma migration de B3.

## Validação final

`tsgo --noEmit`, `build` e suíte completa com zero falhas; reconferência somente-leitura dos contadores 27/27/27/324/28 e das ACLs. Nenhum acesso a produção, nenhuma publicação, nenhuma transmissão SEFAZ.
