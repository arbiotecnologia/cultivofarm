# H1 / R-1 — Evidência comportamental das policies RLS

**Escopo:** exclusivamente o desbloqueio de **R-1** (prova comportamental das policies
criadas pela migration `20260906000000_h1_rls_hardening_v1`). H2 não iniciada.

**Ambiente:** staging `ikaauvsflpmamgxmkhoq`, acessado pelo runner fail-closed
`restoration/os-e2e/staging-psql.sh` (recusa produção `navfzbwgwzruipouyfnk`; DSN nunca impresso).
Guarda adicional dentro do próprio harness: verifica `public._fiscal_staging_marker` e aborta se
o `project_ref` não for o staging autorizado.

**Artefato:** `restoration/homologacao-h1/30-rls-behavioral-harness.sql`

---

## 1. Metodologia

- Execução em **uma única transação**, encerrada com `ROLLBACK`. Nenhum dado permanece.
- Identidade real por asserção: `SET LOCAL ROLE authenticated|anon` +
  `set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated'), true)`,
  de modo que `auth.uid()` resolve o usuário do caso. `RESET ROLE` entre blocos.
- Como as tabelas alvo estavam vazias no staging, um simples `SELECT` não provaria isolamento;
  por isso o harness cria **fixtures efêmeras** (marcador `H1-RLS-HARNESS`) para dois escopos
  distintos de cliente, tanto no lado A quanto no lado B.

### Sujeitos

| Sujeito | user_id | Papel | Escopo |
| --- | --- | --- | --- |
| A | `85998744-…f8089` | `cliente_produtor` | cliente real `b05e3c22-…5aa5b` |
| B | `7d894a7d-…f16422` | `parceiro_b2b` | cliente fixture `11111111-…1111` + partner `6f22d1dc-…6bb1` |
| ADM | `b5c2ebd4-…b583a` | `administrador` | staff |
| anon | — | sem sessão | — |

### Fixtures efêmeras criadas e revertidas

`clientes` (B), `user_clientes` (B), `ordens_servico` (cópia da OS real, cliente B),
`aplicacoes` (A e B), `aplicacao_emails` (A e B), `aplicacao_evidencias` + `…_vinculos` (A e B),
`registros_consultor` (cópia, cliente B), `registros_consultor_status_log` (A e B),
`portal_solicitacoes` (A e B), `solicitacoes_timeline` (A e B), `arquivos`
(entidade própria de A, entidade de B, e um `entidade_tipo` desconhecido), `organizations`
(uma organização sem vínculo, além da organização real do partner de B).

---

## 2. Resultado — 47 casos, **47 PASS / 0 FAIL**

| Status | Caso | Esperado | Obtido |
| --- | --- | --- | --- |
| PASS | AE-1 A lê e-mail da própria aplicação | 1 | 1 |
| PASS | AE-2 A NÃO lê e-mail da aplicação de B | 0 | 0 |
| PASS | AE-3 B lê e-mail da própria aplicação | 1 | 1 |
| PASS | AE-4 B NÃO lê e-mail da aplicação de A | 0 | 0 |
| PASS | AE-5 admin (staff) lê ambos | 2 | 2 |
| PASS | AE-6 anon não lê `aplicacao_emails` | 0 | permission denied |
| PASS | AEV-1 A lê vínculo próprio | 1 | 1 |
| PASS | AEV-2 A NÃO lê vínculo de B | 0 | 0 |
| PASS | AEV-3 B NÃO insere vínculo na aplicação de A | denied | 42501 |
| PASS | AEV-4 B NÃO apaga vínculo de A | 0 linhas | 0 |
| PASS | AEV-5 B (sem papel de gestão) não apaga nem o próprio vínculo | 0 linhas | 0 |
| PASS | AEV-6 admin insere vínculo legítimo | permitido | inserido |
| PASS | AEV-7 anon não lê vínculos | 0 | 0 |
| PASS | AEV-8 anon não insere vínculo | denied | 42501 |
| PASS | ARQ-1 A lê arquivo da entidade pai própria | 1 | 1 |
| PASS | ARQ-2 A NÃO lê arquivo de entidade de outro cliente | 0 | 0 |
| PASS | ARQ-3 `entidade_tipo` desconhecido negado (default deny) | 0 | 0 |
| PASS | ARQ-4 A insere arquivo na entidade própria | permitido | inserido |
| PASS | ARQ-5 A NÃO insere arquivo em entidade de B | denied | 42501 |
| PASS | ARQ-6 A NÃO insere com `entidade_tipo` desconhecido | denied | 42501 |
| PASS | ARQ-7 anon não lê `arquivos` | 0 | 0 |
| PASS | FN-1 anon não executa `rpc_portal_partner_financial` | denied | 42501 |
| PASS | FN-2 anon não executa `rpc_notificar_gestor` | denied | 42501 |
| PASS | FN-3 `rpc_validar_comprovante_entrega` com token inválido retorna inválido | 1 | 1 |
| PASS | FN-4 `rpc_validar_rastreio_produto` com token inválido retorna inválido | 1 | 1 |
| PASS | ORG-1 produtor sem vínculo não vê organização | 0 | 0 |
| PASS | ORG-2 parceiro vê apenas a organização do seu `partner_account` | 1 | 1 |
| PASS | ORG-3 parceiro NÃO vê organização sem vínculo | 0 | 0 |
| PASS | ORG-4 admin vê todas as organizações | >=2 | 2 |
| PASS | ORG-5 anon não lê `organizations` | 0 | 0 |
| PASS | RCSL-1 A lê log do registro próprio | 1 | 1 |
| PASS | RCSL-2 A NÃO lê log do registro de B | 0 | 0 |
| PASS | RCSL-3 A insere log próprio com `changed_by=self` | permitido | inserido |
| PASS | RCSL-4 A NÃO forja `changed_by` de outro usuário | denied | 42501 |
| PASS | RCSL-5 A NÃO insere log no registro de B | denied | 42501 |
| PASS | RCSL-6 anon não lê trilha | 0 | 0 |
| PASS | ST-1 A lê timeline da própria solicitação | 1 | 1 |
| PASS | ST-2 A NÃO lê timeline da solicitação de B | 0 | 0 |
| PASS | ST-3 A insere evento próprio com `usuario_id=self` | permitido | inserido |
| PASS | ST-4 A NÃO forja `usuario_id` de outro usuário | denied | 42501 |
| PASS | ST-5 A NÃO insere evento na solicitação de B | denied | 42501 |
| PASS | ST-6 B lê timeline da própria solicitação | 1 | 1 |
| PASS | ST-7 B NÃO lê timeline da solicitação de A | 0 | 0 |
| PASS | ST-8 anon não lê timeline | 0 | 0 |
| PASS | STAFF-1 admin lê todos os arquivos do fixture | >=3 | 4 |
| PASS | STAFF-2 admin lê trilha de ambos os registros | >=2 | 3 |
| PASS | STAFF-3 admin lê timeline de ambas as solicitações | >=2 | 3 |

Saída final do harness: `NOTICE: H1_RLS_HARNESS_PASS: todos os casos passaram.` seguido de `ROLLBACK`.

---

## 3. Cobertura x exigências do escopo

| Exigência | Casos |
| --- | --- |
| a) `aplicacao_emails` — próprio permitido / cross negado / staff preservado / anon negado | AE-1..AE-6 |
| b) `aplicacao_evidencias_vinculos` — SELECT próprio, cross SELECT/INSERT/DELETE negados | AEV-1..AEV-8 |
| c) `arquivos` — entidade whitelisted própria, entidade de outro cliente, tipo desconhecido, anon | ARQ-1..ARQ-7 |
| d) `registros_consultor_status_log` — próprio, cross, forja de `changed_by` | RCSL-1..RCSL-6 |
| e) `solicitacoes_timeline` — próprio, cross, forja de `usuario_id` | ST-1..ST-8 |
| f) `organizations` — vínculo legítimo apenas | ORG-1..ORG-5 |
| Extra: `anon EXECUTE` revogado e RPCs públicas token-scoped | FN-1..FN-4 |
| Extra: perfil legítimo (staff) preservado | AE-5, AEV-6, STAFF-1..3 |

Observação de desenho (não é achado): `aev_delete_scoped` usa `can_user_manage_aplicacao`, que
exige papel de gestão (`administrador`, `gestor`, `administrativo`, `consultor_tecnico`,
`aplicador`). Portanto `parceiro_b2b`/`cliente_produtor` não apagam vínculos nem no próprio
escopo — comportamento intencional de trilha de evidências (AEV-5).

---

## 4. Evidência de rollback

Conferência pós-execução no staging (fora da transação):

```
cli=0  os=0  apl=0  ae=0  aev=0  arq=0  rcsl=0  ps=0  st=0
rc=5 (pré-existentes)   org=1 (pré-existente)
```

Nenhum registro `H1-RLS-HARNESS`, `CLI-H1-HARNESS` ou `OS-H1-RLS-HARNESS-B` permanece.

---

## 5. Conclusão

**R-1 — RESOLVIDO.** A prova deixou de ser estrutural e passou a ser comportamental, com
identidade JWT real, isolamento cross-cliente (ID tampering) negado em SELECT/INSERT/DELETE,
`anon` sem leitura de dado operacional e perfis legítimos preservados. Nenhum novo achado
P0/P1 foi identificado.
