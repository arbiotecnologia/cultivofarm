# P1 — Registro do backup local real e reconciliação de evidências

Data/hora do registro: 2026-09-10, 16:51 UTC (13:51 America/Sao_Paulo).
HEAD real no momento do registro: `1561e15f3a02ed1a99ab4f5f7ef93090fd277607`.
SQL executado: **ZERO**. Banco acessado: **NENHUM**. Publicação/deploy: **NENHUM**.
Binding local no fechamento: homologação `ikaauvsflpmamgxmkhoq` (o ambiente havia
derivado `.env` para o sandbox `yzszlzjpovmcteuxjznj`; foi restaurado a partir do
commit `4cf3e2ae`. Nenhum acesso ao sandbox ocorreu).

## 1. Prova de backup aceita (declaração do operador)

| Item | Valor declarado |
|---|---|
| Pasta | `C:/Users/renat/Downloads/AR-BIO_BACKUP_2026-09-10` |
| Projeto de origem | produção `navfzbwgwzruipouyfnk` |
| PostgreSQL | 17.6 |
| Tamanho do banco | 33 MB |
| Objetos | 169 tabelas `public`, 2 `auth.users`, 0 `storage.objects` |
| Arquivos | `schema.sql`, `data-public.sql`, `data-auth-storage.sql`, `roles.sql`, `migrations-schema.sql`, `migrations-data.sql`, `SHA256SUMS.txt`, `README-RESTORE.md` |
| Hashes | publicados em `SHA256SUMS.txt` (na máquina do operador) |
| Segredos | nenhum arquivo contém a senha do banco |
| Ferramenta | `pg_dump` local oficial; Supabase CLI indisponível (sem Docker/Podman) |
| Validação local do schema | única dependência pendente: `pg_cron`, extensão gerenciada pelo Supabase, que já existe no destino |
| Produção | não foi tocada |

### Grau de verificação

Esta é uma **declaração do operador**, não uma verificação feita neste ambiente:
a pasta está em máquina Windows local, fora do alcance deste ambiente de
execução. Nenhum arquivo foi lido, nenhum SHA-256 foi recalculado aqui. O
registro é aceito como prova humana de backup para efeito do gate do runbook, e
fica assim rotulado no dossiê.

## 2. Retificação de evidência anterior

O pacote `AR-BIO_PROD_20260910_1534_RESTAURAVEL.zip` citado no documento
`21-p1-bloqueio-acesso.md` **não possui arquivo local verificável** neste
ambiente e **não é reutilizado** como prova. A prova válida para o gate passa a
ser exclusivamente a da seção 1 acima, com a ressalva de verificação declarada.

## 3. Honestidade da evidência — estado das 3 views

O backup é o baseline **imediatamente anterior à P1**. Ele preserva
`public.vw_esteira_laboratorio`, `public.vw_fluxo_visita_tecnica` e
`public._src_vw_esteira_laboratorio` no estado **pré-P1**: `reloptions` NULL,
**sem** `security_invoker`.

É falso afirmar que o backup contém o hardening. Quem aplica `security_invoker =
true` nas 3 views é a própria onda P1, pelo artefato
`promotion-sql/20261102000000_p0d_security_invoker_views_v1.sql`, e é o
pós-check da onda que deve provar 3/3 e zero ERROR `security_definer_view` no
Security Advisor de produção.

## 4. Estado do pacote P1

Inalterado. Nenhuma migration histórica editada, nenhum artefato executado,
nenhum registro de ledger reparado, nenhuma linha inserida em
`promocao_execucao_registro` ou `promocao_rollback_baseline`. Integrações
externas desligadas, slots do Vault nulos.

## 5. O que ainda falta (lista exata)

| # | Item | Status |
|---|---|---|
| 1 | Prova humana de backup pré-P1 | **RESOLVIDO** (seção 1, com ressalva de verificação) |
| 2 | Canal SQL direto e autenticado para `navfzbwgwzruipouyfnk`, com transação e `ON_ERROR_STOP` | **AUSENTE** — bloqueio único |
| 3 | Permissão para `SET LOCAL promocao.target_ref` no alvo | pendente do item 2 |
| 4 | CLI `supabase` autenticado no projeto de produção, para `migration repair --status applied <version>` | **AUSENTE** (Docker/Podman não instalado na máquina do operador) |
| 5 | Leitura do Security Advisor de produção para o pós-check das views | pendente do item 2 |
| 6 | Restore point `pre_p1_h9` criado na janela, imediatamente antes da primeira escrita | não criado |

Enquanto o item 2 não existir, a P1 **permanece bloqueada** neste ambiente. Não
haverá simulação nem marcação de migrations como aplicadas.

## 6. Runbook seguro para executar a P1 na máquina do operador

Pré-condições: itens 2 a 6 da seção 5 satisfeitos; janela autorizada por
escrito; `psql` 17.x disponível; `DATABASE_URL` da produção exportada apenas na
sessão do terminal, **nunca** gravada em arquivo do repositório.

### 6.1 Confirmação de alvo (obrigatória, antes de qualquer escrita)

```bash
psql "$DATABASE_URL" -At -c "select current_database(), inet_server_addr(), version();"
```

Confirmar externamente que a instância corresponde a `navfzbwgwzruipouyfnk`.
Divergência, ambiguidade ou qualquer referência ao sandbox → **abortar**.

### 6.2 Prechecks somente leitura

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f restoration/promocao-producao-h9/03-prechecks.sql \
  | tee evidencias/p1-prechecks-$(date -u +%Y%m%dT%H%M%SZ).log
```

Esperado: ledger com **490** migrations, latest `20260723000000`; condições
destrutivas no-op; as 3 views sem `security_invoker`. Qualquer divergência →
não escrever nada e reportar.

### 6.3 Restore point

```bash
psql "$DATABASE_URL" -c "select pg_create_restore_point('pre_p1_h9');"
```

### 6.4 Conferência de hash de cada artefato

```bash
sha256sum restoration/promocao-producao-h9/promotion-sql/<arquivo>.sql
```

Comparar com `10-manifesto-artefatos-promocao.csv`. Hash divergente → abortar.

### 6.5 Aplicação, uma unidade transacional por vez

Na ordem exata do manifesto da onda P1, para cada version:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "set local lock_timeout='5s'; set local statement_timeout='120s';" \
  -f restoration/promocao-producao-h9/promotion-sql/<version>_<nome>.sql \
  | tee evidencias/p1-<version>.log
```

Falha antes do COMMIT → rollback automático, a onda para, acionar
`05-rollback-por-onda.md`. Nunca aplicar duas versions na mesma transação.

### 6.6 Pós-check imediato por unidade

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f restoration/promocao-producao-h9/04-postchecks.sql \
  | tee evidencias/p1-postcheck-<version>.log
```

Qualquer consulta com "esperado: 0 linhas" retornando linha → ABORT.

### 6.7 Ledger

**Não** escrever em `supabase_migrations.schema_migrations` por SQL. O registro
é feito somente pelo caminho suportado, após o pós-check verde:

```bash
supabase migration repair --status applied <version>
```

Sem CLI autenticado (item 4 da seção 5), a version **não pode** ser reportada
como aplicada — a onda para nesse ponto.

### 6.8 Encerramento da onda

1. `04-postchecks.sql` integral e arquivado.
2. Security Advisor de produção: exigir **zero** ERROR `security_definer_view`
   e 3/3 views com `security_invoker = true`.
3. Smoke somente leitura por perfil.
4. Registrar ledger antes/depois, hashes aplicados, advisors e riscos.
5. **Não** avançar para a P2.

## 7. Vereditos

- **Backup: GO** — prova registrada, rotulada como declaração do operador.
- **P1: BLOQUEADA** — falta canal direto autenticado à produção
  `navfzbwgwzruipouyfnk` e CLI Supabase para o reparo de ledger.
- **P2: NO-GO** — depende de P1 concluída e verificada.
