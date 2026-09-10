# Revisão humana obrigatória — pacote estrutural CultivoFarm

Este documento registra as decisões que o classificador **não** pode tomar
sozinho. Enquanto uma pendência estiver aberta, a migration correspondente fica
fora do pacote e a promoção permanece **NO-GO**.

Fonte da verdade: `21-manifesto-migrations.csv` (uma linha por migration, com
decisão, motivo, SHA-256 e contagem de linhas).

## Resultado da classificação — 721 migrations

| Decisão | Total | Tratamento |
| --- | --- | --- |
| `INCLUIDA` | 314 | Entram no pacote automaticamente |
| `REVISAO_DML` | 260 | Bloqueadas até revisão caso a caso |
| `REVISAO_REF_GUARD` | 126 | Bloqueadas: guarda de ref de outro projeto |
| `EXCLUIDA_SANDBOX` | 20 | Excluídas em definitivo |
| `EXCLUIDA_MARKER` | 1 | Excluída: marcador de ambiente |

## 1. `EXCLUIDA_SANDBOX` — decidido, sem revisão

As 20 migrations do intervalo `20260812134101`…`20260812135640` são do projeto
sandbox e já estavam classificadas como `BLOQUEADA_PERMANENTE`. Nunca entram.

## 2. `REVISAO_REF_GUARD` — 126 arquivos

Contêm o identificador de outro projeto embutido no próprio SQL (guarda do tipo
`REF GUARD: expected ...`). Aplicadas no CultivoFarm, essas guardas **abortam a
transação inteira**. Decisão necessária para cada uma:

- **Adaptar**: reescrever a guarda para o ref do CultivoFarm, gerando uma
  variante versionada — nunca editando a migration histórica; ou
- **Descartar**: se a guarda protegia um efeito exclusivo de homologação.

Não há adaptação automática segura: reescrever a guarda muda o corpo da
migration e invalida o hash histórico.

## 3. `REVISAO_DML` — 260 arquivos

Contêm `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` fora das tabelas de controle
toleradas (`supabase_migrations.schema_migrations`, `cron.job`,
`storage.buckets`). Cada arquivo precisa ser lido para separar:

- **Configuração legítima** — catálogos, templates, matriz fiscal, parâmetros
  sem os quais o sistema não funciona: podem ser aprovados; ou
- **Dado de teste / backfill de ambiente** — devem ficar de fora.

Aprovações vão para um arquivo texto (uma migration por linha) consumido por:

```bash
INCLUIR_REVISADAS=aprovadas.txt restoration/promocao-cultivofarm/22-montar-pacote-estrutural.sh gerado/
```

```powershell
pwsh restoration\promocao-cultivofarm\22-montar-pacote-estrutural.ps1 -OutDir gerado -IncluirRevisadas .\aprovadas.txt
```

Registrar aqui, para cada aprovação: arquivo, motivo e responsável.

## 4. Ambiguidade estrutural de fundo

O replay das migrations históricas não é equivalente a um baseline
`pg_dump --schema-only` da homologação: há migrations one-shot, correções
aplicadas fora de banda e objetos criados por ferramentas gerenciadas. Se, após
a revisão, o pacote concatenado divergir do inventário esperado
(`00-inventario-esperado/`), o caminho recomendado continua sendo o baseline
estrutural descrito em `06-runbook-execucao-local.md`.

## 5. Registro de aprovações

| Data | Migration | Decisão | Motivo | Responsável |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
