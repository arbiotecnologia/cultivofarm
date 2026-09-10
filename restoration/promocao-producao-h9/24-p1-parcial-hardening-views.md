# 24 — P1 PARCIAL: HARDENING DE VIEWS EXECUTADO EM PRODUÇÃO

**Data do relato:** 2026-09-10 (UTC-3)
**Alvo:** produção Supabase `navfzbwgwzruipouyfnk`
**Executor:** operador, na própria máquina, por conexão autenticada direta
(pooler de sessão IPv4). **Não** pelo canal Lovable.
**Veredito:** P1 **PARCIAL** — hardening de views concluído; convergência/ledger
**pendente**. **P2 permanece NO-GO.**

---

## 1. Origem e natureza da evidência

Esta seção registra o resultado informado pelo operador após execução direta em
produção. O ambiente Lovable **não** executou SQL, não conectou à produção e não
observou o banco: os números abaixo são **evidência declarada pelo operador**,
não verificação independente feita aqui. Qualquer reconciliação independente
exige reexecução dos blocos somente-leitura de `03-prechecks.sql` (bloco A/C5) e
`04-postchecks.sql` (itens 4f–4h) com saída arquivada em `evidencias/`.

## 2. Precheck observado em produção

| Item | Valor confirmado |
|---|---|
| `current_database()` | `postgres` |
| `current_user` | `postgres` |
| Versão | PostgreSQL 17.6 |
| Views alvo encontradas | exatamente 3 |
| Ledger — total | 490 migrações |
| Ledger — última version | `20260723000000` |
| Alvo apontou para sandbox? | **não** |

## 3. Aplicação transacional

Executada com target guard, preservação de ACL e pós-check na mesma transação:

```sql
ALTER VIEW public.vw_esteira_laboratorio      SET (security_invoker = true);
ALTER VIEW public.vw_fluxo_visita_tecnica     SET (security_invoker = true);
ALTER VIEW public._src_vw_esteira_laboratorio SET (security_invoker = true);
```

Script local do operador: **`p1-security-invoker-production.sql`** (executado
fora deste repositório, na máquina do operador). O arquivo em si **não foi
recebido nem verificado** por este ambiente; portanto não é reproduzido aqui
como se fosse artefato do repositório. O artefato canônico equivalente do
dossiê continua sendo
`restoration/promocao-producao-h9/promotion-sql/20261102000000_p0d_security_invoker_views_v1.sql`
(SHA-256 `de9c450fff121a0ae78b62049c4703ae400a58a43c3f4e64c39a416542518f8b`).

**Pendência de rastreabilidade:** anexar o `p1-security-invoker-production.sql`
real em `restoration/promocao-producao-h9/evidencias/` com seu SHA-256, para que
o executado e o artefato canônico possam ser diferenciados linha a linha.

## 4. Resultado

| Verificação | Resultado |
|---|---|
| Views com `security_invoker=true` | **3/3** |
| ACLs pré vs. pós | idênticas (nenhum GRANT novo) |
| Transação | `COMMIT` confirmado |
| Integrações externas / frontend / Edge Functions | inalterados |
| Ledger pós-execução | 490 linhas, latest `20260723000000` |
| Migration marcada como aplicada | **nenhuma** — correto nesta etapa |
| Security Advisor de produção | **0 errors**, 304 warnings, 21 suggestions |

O objetivo de segurança da P0d foi atingido: **zero ERROR
`security_definer_view`** em produção, incluindo a view interna
`public._src_vw_esteira_laboratorio`, que nenhuma migration histórica cobria.

Retificação de documentos anteriores: `21-p1-bloqueio-acesso.md` e
`23-p1-autorizacao-e-parada-tecnica.md` afirmavam que as três views permaneciam
pré-P1 sem `security_invoker`. **Isso deixou de valer** a partir desta execução.
Continua válida a afirmação de que o canal Lovable não alcança a produção.

## 5. Por que a onda P1 NÃO está completa

A P1 tem quatro unidades no manifesto. Estado real:

| # | version | conteúdo | estado |
|---|---|---|---|
| 1 | `20261006000000` | `fn_run_recurring_generation` — authz | **não executada** |
| 2 | `20261015000000` | `rpc_converter_visita_em_os` — authz sem oráculo | **não executada** |
| 3 | `20261101000000` | convergência/ledger de promoção | **não executada** |
| 4 | `20261102000000` | hardening `security_invoker` das 3 views | **efeito aplicado** por script local equivalente; version **não registrada** no ledger |

Consequências:

- O ledger de produção continua em 490/`20260723000000`. Nenhuma version foi
  reparada, e isso está correto: `supabase migration repair --status applied`
  só pode ocorrer depois da convergência e dos pós-checks.
- Sem `public.promocao_execucao_registro` e `public.promocao_rollback_baseline`
  (criadas por `20261101000000`), **não existe baseline de `reloptions`
  capturado em transação**. Logo, o rollback
  `rollback-sql/20261102000000_p0d_security_invoker_views_v1_rollback.sql`
  falha por desenho (`ROLLBACK_RECUSADO: baseline ... nao foi capturado`).
  Reversão hoje dependeria de `ALTER VIEW ... RESET (security_invoker)` manual
  — operação que reintroduz a vulnerabilidade e exige autorização humana
  explícita — ou de PITR/backup local pré-P1.
- A trilha de auditoria origem → artefato → SHA-256 → status → onda ainda não
  existe em banco.

## 6. O que falta para fechar a P1

1. Recuperar o artefato exato `20261101000000_promocao_convergencia_ledger_v1.sql`
   na máquina do operador. O conteúdo íntegro foi publicado no chat desta
   sessão; conferir o SHA-256 do arquivo salvo contra
   `65de029be6e90ea2bd76008df22273d8323cbd3272f3589a601025f5d50d7137`
   antes de executar. Divergência de hash → abortar.
2. Executar a convergência em produção com `SET LOCAL promocao.target_ref =
   'navfzbwgwzruipouyfnk'`, `lock_timeout='5s'`, `statement_timeout='60s'`.
3. Executar também a convergência em homologação `ikaauvsflpmamgxmkhoq`, para
   que os dois ledgers avancem juntos.
4. Rodar `04-postchecks.sql` integral, com atenção aos itens 4f, 4g, 4h e 4i.
5. `supabase migration repair --status applied 20261101000000` e, em seguida,
   inserir pelo runner a linha de auditoria com o SHA-256 real do manifesto.
6. Registrar `20261102000000` no mesmo fluxo, com observação explícita de que o
   efeito foi aplicado antes por script local equivalente e de que o baseline de
   `reloptions` foi capturado **após** o efeito (portanto já reflete
   `security_invoker=true`, não o estado pré-P1). Esse é um desvio real de
   ordem, e o registro precisa dizê-lo — não pode ser apresentado como captura
   pré-alteração.
7. Executar `20261006000000` e `20261015000000` com seus pós-checks e reparo de
   ledger.
8. Arquivar todas as saídas em `restoration/promocao-producao-h9/evidencias/`.

## 7. Gate

- **Hardening de views:** GO — concluído, 0 errors no Security Advisor.
- **Onda P1:** NO-GO para encerramento — 3 das 4 unidades pendentes e ledger não
  convergido.
- **Onda P2:** **BLOQUEADA** até a convergência ser revisada, executada,
  pós-checada e refletida no ledger real.
- Nenhum SQL foi executado por este ambiente nesta etapa.
