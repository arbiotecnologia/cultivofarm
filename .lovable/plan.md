# Correção F4.2 — Harness alinhado ao schema real do staging

Escopo: somente os arquivos de `restoration/fase-f4-2/` e sua documentação. Nada de produção (`navfzbwgwzruipouyfnk`), nada de publicação, nenhuma migration, nenhuma transmissão SEFAZ, nenhum trigger desabilitado.

## O que muda

### 1. `10-setup.sql`
- **Singleton do emitente**: antes de inserir o emitente sintético, capturar o `id` do emitente ativo atual e registrá-lo em `_f42_harness_fixtures` com `entity = 'previous_active_company_fiscal_settings'`. Só depois desse registro, marcar o anterior como `is_active = false` e inserir o fixture ativo. Se não houver emitente ativo, registrar a ausência explicitamente para o cleanup não reativar nada.
- **Readiness**: remover as chamadas a `fn_fiscal_recompute_emitter_readiness` e `fn_fiscal_recompute_recipient_readiness` (não existem). O recálculo já é feito pelos gatilhos `tg_fiscal_emitter_refresh_readiness` e `tg_fiscal_recipient_refresh_readiness`; o setup passa a **validar** o resultado após o INSERT e abortar se não estiver no estado esperado.
- **Cliente**: trocar `public.clients` por `public.clientes`, com as colunas reais `(id, nome, tipo_pessoa, cpf_cnpj, email, codigo_cliente)`. Sem `ativo`. `codigo_cliente` sintético e único, derivado da tag.
- **Parceiro**: `partner_accounts` passa a usar `razao_social` e `nome_fantasia` (não existe `nome`), mais `client_id` e `ativo`.
- **Perfil fiscal**: `person_type = 'PJ'` (domínio real: PF, PJ, ESTRANGEIRO) e inclusão de `fiscal_email` para não cair em prontidão PARTIAL.
- Guarda fail-closed mantida: exige marcador STAGING com `project_ref = ikaauvsflpmamgxmkhoq` e recusa produção.

### 2. `90-cleanup.sql`
- Corrigir `public.clients` para `public.clientes`.
- Ordem nova: apagar primeiro o emitente fixture, **depois** restaurar exatamente o emitente anterior registrado (`is_active = true`), e só então remover os registros de controle da tag.
- A restauração roda também quando o cleanup é acionado após falha (o `trap EXIT` do `run.sh` já garante a chamada).
- Prova de limpeza atualizada: contagem por `public.clientes`, parceiro por `razao_social`/`nome_fantasia`, e verificação de que o emitente anterior voltou a ser o único ativo.

### 3. `30-verify.sql`
Novos gates, além dos atuais:
- emitente sintético é o **único** ativo durante o harness;
- emitente anterior está registrado na tag;
- perfil fiscal do destinatário em READY/VALIDATED conforme o contrato real;
- todas as fixtures pertencem à tag e nenhum objeto fora da tag foi criado;
- gatilhos `tg_fiscal_emitter_refresh_readiness` e `tg_fiscal_recipient_refresh_readiness` estão habilitados.

### 4. `RUNBOOK.md`
Documentar o isolamento reversível do emitente ativo, os nomes corretos de tabela/coluna e a obrigatoriedade de conferir a restauração do emitente anterior ao final.

## Validações
`tsgo` (typecheck), suíte Vitest e `bun run build` — locais, sem acesso a banco.

## Status de saída
Máximo **CANDIDATO À REVALIDAÇÃO**. Sem execução remota nesta sessão, nenhum PASS de runtime será alegado; o relatório final declara o bloqueio exato (ausência de DSN/CLI/secrets de staging).
