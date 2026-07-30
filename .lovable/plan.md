# Desbloqueio do Rehearsal de Promoção B2B em Staging

## Objetivo
Cadastrar o secret `STAGING_DSN` de conexão PostgreSQL direta com o staging `ikaauvsflpmamgxmkhoq` e executar, uma única vez, o rehearsal transacional do pacote de promoção do Motor B2B (`restoration/promocao-b2b/rehearsal-staging.sh`), sem tocar em produção (`navfzbwgwzruipouyfnk`).

## Escopo
- Ambiente exclusivo: staging `ikaauvsflpmamgxmkhoq`.
- Nenhuma alteração em produção.
- O secret será lido apenas em runtime pela edge function/executor temporário; não será gravado em código nem em logs.

## Passos

1. **Cadastrar secret de runtime**
   - Usar a ferramenta `add_secret` para criar o secret `STAGING_DSN`.
   - O usuário preencherá o valor em formulário seguro (nunca no chat).
   - Formato esperado: `postgresql://[user]:[pass]@[host]:[port]/postgres` ou pooler IPv4 do Supabase (ex.: `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` ou `aws-0-[region].pooler.supabase.com:5432/postgres`).
   - A referência do projeto deve ser exclusivamente `ikaauvsflpmamgxmkhoq`.

2. **Validar secret e destino antes da execução**
   - Confirmar via `fetch_secrets` que `STAGING_DSN` existe.
   - Verificar que o DSN não contém `navfzbwgwzruipouyfnk`.

3. **Executar o rehearsal transacional**
   - Rodar `restoration/promocao-b2b/run-rehearsal-from-secret.sh`.
   - O script valida hashes do manifest, monta a ordem canônica e executa `BEGIN → preflight → delta → postflight → 2ª passagem de idempotência → ROLLBACK`.
   - Não faz COMMIT; nunca desabilita triggers.

4. **Registrar evidência sanitizada**
   - Se `REHEARSAL_DONE`: registrar timestamp UTC, commit, hash do manifest, resultado das 12 asserções do postflight e prova de ausência de resíduo.
   - Se falha: registrar `BLOCKED` com o erro real, sem mascarar.

5. **Limpar via de uso único**
   - Remover `run-rehearsal-from-secret.sh` e `cleanup-rehearsal-executor.sh`.
   - Instruir/desativar o secret `STAGING_DSN` após o uso (Project Settings → Secrets).

6. **Atualizar gate de promoção**
   - Atualizar `docs/motor-b2b-promocao-gate.md` com veredito único:
     - `STAGING_REHEARSAL_PASS` (se OK) ou `BLOCKED` (se falha).
     - `PRODUCTION_NOT_EXECUTED` inalterado.
   - Re-hidratar `manifest.json` se houver mudança de arquivo.

7. **Validar repositório**
   - `typecheck`, `build` e, se pertinente, testes do pacote (sem tocar no banco).
   - Verificar que nenhum secret/UUID de fixture vazou para o diff.

## Resultado esperado
- Gate de staging desbloqueado (ou bloqueado com causa clara), mantendo a barreira de produção intacta até novo gate específico.
