# Como coletar o inventário no CultivoFarm e devolver o resultado

Alvo único: `swzpzcwiasxmjutrmvkm`. Não rode em nenhum outro projeto.

## Passo 1 — Confirmar o projeto

No dashboard Supabase, confirme no seletor de projeto que o ref exibido em
Settings → General é exatamente `swzpzcwiasxmjutrmvkm`. Se for outro, pare.

## Passo 2 — Rodar a coleta

Opção A — SQL Editor (recomendada):

1. Abra SQL Editor → New query.
2. Cole o conteúdo de `inventario/00-coleta-readonly.sql`.
3. Rode **um bloco por vez** (o editor mostra apenas o resultado da última
   instrução quando tudo é enviado junto). Os blocos estão numerados de 0 a 8.
4. Em cada resultado use **Download CSV** e salve como
   `bloco-<n>-<assunto>.csv`.

Opção B — psql na sua máquina:

```bash
psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 \
  -f restoration/hardening-cultivofarm/inventario/00-coleta-readonly.sql \
  > inventario-cultivofarm-$(date +%F).txt
sha256sum inventario-cultivofarm-$(date +%F).txt
```

A primeira instrução do arquivo é `SET default_transaction_read_only = on;` —
qualquer tentativa de escrita falharia. Não há DDL nem DML no arquivo.

## Passo 3 — Conferir antes de devolver

O material coletado é metadado de schema. Ainda assim, antes de enviar:

- **Não** inclua a connection string, senha do banco, `service_role`, JWT,
  tokens, conteúdo do Vault ou variáveis de ambiente.
- **Não** rode `SELECT` em tabelas de dados: a coleta lê apenas catálogo
  (`pg_class`, `pg_policies`, `pg_proc`, `storage.buckets`) e contagens.
- Se alguma expressão de policy contiver um literal sensível (um e-mail, um
  UUID de pessoa real), substitua por `<REDIGIDO>` e avise que houve redação.
- O bloco 8 devolve apenas **contagens** de contas e papéis, nunca e-mails.

## Passo 4 — Devolver

Envie no chat os CSVs (ou o `.txt` único) e informe:

- o ref confirmado (`swzpzcwiasxmjutrmvkm`);
- data/hora da coleta;
- o SHA-256 do arquivo, se usou psql;
- se houve algum bloco com erro e qual a mensagem.

Com esse inventário eu preencho `forward-sql/`, `rollback-sql/` e os
pós-checks com as correções exatas, objeto por objeto, e só então você aprova a
execução.
