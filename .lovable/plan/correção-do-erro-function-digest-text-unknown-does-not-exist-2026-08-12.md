# Correção do erro "function digest(text, unknown) does not exist"

## Causa

O botão **Gerar formulário** (painel "Evidências e termos da entrega") chama a rotina
`rpc_gerar_formulario_entrega`. Essa rotina — e as demais do mesmo bloco de comprovação de
entrega — calcula o hash de validação com `digest(..., 'sha256')` **sem qualificar o schema**,
enquanto foram criadas com `SET search_path = public`.

No banco gerenciado, a extensão pgcrypto (dona da função `digest`) fica no schema `extensions`,
que não está no `search_path` dessas rotinas. Resultado: a chamada não encontra `digest` e o
Postgres devolve exatamente `function digest(text, unknown) does not exist`.

Não é falta da extensão nem erro de permissão: é qualificação de schema. Outras partes do sistema
já usam o padrão correto `extensions.digest(...)` (motor XML NF-e, comunicação, ledger), o que
confirma o diagnóstico.

Rotinas do módulo de entrega afetadas (arquivo `20260613154311_...sql`):

- `rpc_gerar_formulario_entrega` — falha imediata ao gerar o formulário
- `rpc_coletar_assinatura_digital_entrega`
- `rpc_confirmar_recebimento_entrega`
- `rpc_dispensar_assinatura_entrega`

O mesmo defeito existe em rotinas antigas que ainda estão vigentes e vão quebrar do mesmo jeito
quando forem acionadas. Todas entram nesta correção — nada fica de fora:

**Lote / etiquetas / rastreio (foco principal)**
- `rpc_gerar_etiqueta_produto` (versão vigente)
- `rpc_gerar_etiquetas_embalagens_lote`
- `rpc_marcar_etiqueta_impressa`
- `rpc_cancelar_etiqueta_produto`
- `rpc_substituir_etiqueta_produto`
- `rpc_validar_rastreio_produto`
- `rpc_rastreio_produto_interno`

**Entrega / conferência / termos**
- `fn_entrega_build_snapshot_v1`, `rpc_entrega_gerar_termo_v1`, `rpc_entrega_assinar_termo_v1`
- `rpc_entrega_reconciliar_v1`, `rpc_entrega_reentrega_saldo_v1`
- `fn_comprovante_entrega_montar_v1` (versão vigente)

**Financeiro, estoque, envase, comunicação e fiscal**
- `fn_assign_receipt_metadata` (recibo financeiro)
- `log_estoque_movimentacao` (ledger)
- `rpc_cockpit_registrar_envase_v1` (versão vigente)
- rotinas de comunicação que montam snapshot/idempotência com `digest`
- rotinas do dossiê regulatório/fiscal F2 que montam snapshot com `digest`

## Correção proposta

Migration incremental nova (ex.: `20260905000000_hardening_digest_schema_v1.sql`), somente no
staging, sem alterar regras de negócio, numeração, snapshots ou RLS:

1. **Inventário primeiro**: listar no catálogo do banco **todas** as funções de `public` cujo corpo
   usa `digest(` sem o prefixo `extensions.`. Essa lista do catálogo é a fonte da verdade —
   ela captura inclusive rotinas antigas não citadas acima e descarta as que já foram
   sobrescritas por versões corretas em migrations posteriores.
2. **Recriar cada função vigente afetada** com o corpo idêntico, trocando apenas
   `digest(x, 'sha256')` por `extensions.digest(x, 'sha256')`, mantendo assinatura, `SECURITY
   DEFINER`, `search_path`, grants e revogações atuais.
3. **Ordem de aplicação**: primeiro as quatro rotinas de comprovação de entrega (desbloqueiam o
   erro que o usuário está vendo), depois lote/etiquetas/rastreio, e na sequência todo o restante
   do inventário, na mesma migration atômica.
4. **Nenhuma mudança de valor de hash**: mesmo algoritmo e mesma entrada; hashes já gravados
   continuam válidos e nada é recalculado.

4. **Nenhuma mudança de valor de hash**: mesmo algoritmo e mesma entrada; hashes já gravados
   continuam válidos e nada é recalculado.
5. **Rollback incremental** correspondente, na pasta de restauração já usada nas fases anteriores.

## Validação

- Verificar que o inventário do passo 1 volta vazio depois da migration.
- Smoke em staging (transação com ROLLBACK): gerar formulário de uma entrega pendente, coletar
  assinatura, confirmar recebimento e dispensar — os quatro caminhos que hoje quebram.
- Reexecutar as harnesses 33 e 34 do comprovante e a suíte de testes do repositório.
- Nenhuma alteração de frontend é necessária.

## Bloqueio conhecido a resolver antes de aplicar

As ferramentas de banco do ambiente continuam apontando para o projeto sandbox do Lovable Cloud e
não para o staging `ikaauvsflpmamgxmkhoq` — o mesmo bloqueio registrado na Fase 3.1.A. A migration
só deve ser aplicada depois que o alvo do conector for comprovadamente o staging; caso contrário,
o arquivo fica versionado no repositório aguardando o binding, sem execução.
