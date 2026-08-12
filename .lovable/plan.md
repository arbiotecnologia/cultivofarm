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

Há ainda outras rotinas antigas com o mesmo `digest` não qualificado (rastreio de lote/etiqueta,
comprovante documento v1, envase, fiscal F2). Elas caem no mesmo modo de falha e entram na mesma
correção, para não repetir o incidente em outro botão.

## Correção proposta

Migration incremental nova (ex.: `20260905000000_hardening_digest_schema_v1.sql`), somente no
staging, sem alterar regras de negócio, numeração, snapshots ou RLS:

1. **Inventário primeiro**: listar no catálogo do banco todas as funções de `public` cujo corpo usa
   `digest(` sem o prefixo `extensions.`. Só as definições realmente vigentes serão recriadas
   (várias já foram sobrescritas por versões corretas em migrations posteriores).
2. **Recriar cada função vigente afetada** com o corpo idêntico, trocando apenas
   `digest(x, 'sha256')` por `extensions.digest(x, 'sha256')`, mantendo assinatura, `SECURITY
   DEFINER`, `search_path`, grants e revogações atuais.
3. **Prioridade 1 (desbloqueia o usuário)**: as quatro rotinas de comprovação de entrega acima.
   **Prioridade 2 (mesma migration)**: rastreio de lote/etiqueta, `fn_comprovante_entrega_montar_v1`
   legado, envase e fiscal F2.
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
