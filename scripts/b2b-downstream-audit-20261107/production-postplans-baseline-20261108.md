# Baseline canônica POSPLANOS — produção, 08/11/2026 21:45 UTC

## Fato de produção relatado pelo auditor

O auditor instalou **somente** o isolamento de planos no projeto canônico `swzpzcwiasxmjutrmvkm`, pela migration `commercial_plans_tenant_isolation_reviewed_20261108`. O artefato instalado foi `scripts/commercial-plans-tenant-20261108/02-install.sql.review`, SHA256 `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40`.

Foram relatados: ref comprovado por `SET LOCAL`, `PRE_OK` antes, POST dentro da transação antes do COMMIT, instalação com sucesso e POST separado READ ONLY com `POST_OK`. O Lovable não executou essa instalação nem qualquer leitura/escrita hospedada nesta atualização.

Preservados segundo o auditor: **6 planos** (cinco ARBio e um da organização `8eae2bc1-ad00-4402-9f57-564258e493ca`), **4 assignments**, **9 orders**, **10 receivables** e **5 fiscal invoices**. Usuário FSF real, na prévia conectada à produção e após reload, passou de seis planos para **zero**. O controle positivo ARBio ainda aguarda login; não presumir seu resultado.

Não houve publicação frontend nem instalação/ativação de B4, logística, ponte fiscal ou gates. Comunicação/envios, fiscal real, cobranças e pagamentos permanecem bloqueados.

## Regra obrigatória para todos os candidatos

1. **POSPLANOS é a baseline corrente.** Não reaplicar `commercial-plans-tenant-20261108/02-install.sql.review`, não executar novamente seu PRE de estado anterior e não criar hash alternativo por conveniência.
2. O instalador combinado `canonical-composition-feb815603/02-install.sql.review` ainda inclui a etapa de planos e, portanto, **não deve ser executado na produção atual**. Para uma revisão futura de B4/ponte, usar somente os estágios pós-planos revisáveis, começando por `stages/01-b4-pre-post-composition.sql.readonly`, após nova captura e autorização específica.
3. Toda nova instalação exige captura READ ONLY atual de corpos, owners, ACLs, policies, triggers, índices e constraints. O estado já instalado, qualquer drift ou contagem divergente aborta; não trocar pins para fazer o pacote passar.
4. Rollback permanece deny-only e preserva histórico. Nenhuma reversão logística/fiscal pode desfazer ou reabrir o isolamento de planos.
5. Testes autenticados futuros serão em **produção**, somente com gates/piloto, fixtures sintéticas expressamente aprovadas e execução pelo auditor. Homologação não é mais destino de preparação. Nenhum login ou ativação é solicitado enquanto callers/leitores/capabilities e dependências não estiverem revisados.

## Candidatos ativos sob essa baseline

| Recorte | Artefato/fonte | SHA256 | Estado |
|---|---|---|---|
| Planos | `commercial-plans-tenant-20261108/02-install.sql.review` | `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40` | **INSTALADO PELO AUDITOR; não reaplicar** |
| Logística de revenda | evidência fresh `review-postplans-2145/logistics/candidate.sql.review` | `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20` | INATIVO/NÃO APROVADO |
| Instalador logístico | evidência fresh `review-postplans-2145/logistics/install.sql.review` | `56631263e6ebfe51e9f02822f72c98f895a728f762d3c0ef62c575e44ee7ec09` | REVISÁVEL; gate OFF |
| Caller público de OS | evidência fresh `review-postplans-2145/os-endpoint/02-install.sql.review` | `21d40202d32e70dfbb44c7eb2a54a4135ebace840b301c15ab37b910cbfa0ee3` | INATIVO/NÃO APROVADO |
| UI de OS | `order-e2e-new-20261108/ui-candidate/` | fontes/testes pinados na evidência | FORA DO RUNTIME |
| B4 | `b4/b4-candidate.sql.review` | `7dde7f07bca49f6d89ca995f1b6eacfdbb84b0694565e2a4121b1a7bec4dc59f` | INATIVO/NÃO APROVADO |
| Ponte fiscal | `b4/fiscal-decision-20261108/service-bridge/02-install.sql.review` | `5db2c160fd3a99bb847fe20a1d9764cbfed82d5cd80915be0eceb94eadfb9964` | INATIVA/NÃO APROVADA; dependência real always-deny |

A composição `canonical-composition-feb815603/manifest.json` já reconcilia cinco dependências alteradas pelo isolamento. Esse registro técnico não comprova que os demais objetos LIVE continuam idênticos depois da instalação: nova captura continua obrigatória.

## Evidência local nova

A composição PostgreSQL descartável `review-postplans-2145` instalou o isolamento antes do B3/logística, reproduzindo a ordem POSPLANOS sem operar produção. Resultado: **41/41 checks**, **13/13 regressões de parciais**, **9/9 testes específicos do endpoint**, **13/13 testes da UI candidata**, **73/73 testes canônicos de OS** e typecheck exit 0. Os três hashes logísticos/endpoint acima permaneceram idênticos. Build automático da prévia: OK.

Esses testes usam Auth/schema/Storage sintéticos declarados. Não provam JWT, RLS, PostgREST, Storage ou browser de produção. O positivo fiscal integrado continua `NOT_RUN_BLOCKED_REAL_ALWAYS_DENY`; zero título/documento/alocação foi criado pelo fluxo físico.

## Advisors pós-instalação — somente revisão posterior

Relato do auditor: segurança `RLS no policy` **60→59**, contagens WARN DEFINER inalteradas; performance `auth_rls_initplan` **47→48** e `unused` **327→328**. O novo alerta `auth_rls_initplan` na policy `cpp_tenant_read` deve ter definição, seletividade e planos de consulta reais revisados antes de qualquer ajuste. Não há evidência suficiente para classificá-lo como regressão material nem para alterá-lo agora. Não ampliar grants, remover RLS ou enfraquecer predicados para eliminar alertas.
