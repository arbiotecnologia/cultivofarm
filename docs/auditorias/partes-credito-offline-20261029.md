# Partes e limite explícito — rodada 15:36, somente offline

## Decisões recebidas, não reabrir

AR Bio vende, emite a nota e recebe/é credora; FSF Agro compra/é devedora. Cadastro primeiro, configuração posterior continua válido. Limite numérico explícito, finito e não negativo é obrigatório; sem valor, financeiro bloqueado; zero não é ilimitado. **Não foi fornecido valor de limite real.** Essas decisões não comprovam fiscal, contabilidade, UUIDs produtivos ou implantação.

Base solicitada `a91023617543e80143739b8bf87f26beadcae18f`, checkout inicial limpo. Fonte: relatório diferido15:03 e catálogo capturado SHA256 `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`. Nenhuma consulta hosted nova, DML produtivo, migration, deploy, GRANT produtivo, sessão real, runtime ou SQL implantável.

## Código executado e resultados separados

Novo `scripts/financial-installments-initial-20261024/cancel-parties-credit.py`, importado pelo runner existente. Não duplica PostgreSQL/Auth/fixtures. Regra estrutural em AGENTS do pacote; contrato DRAFT existente atualizado sem preencher calendário, parcelas ou valor de crédito.

Execução final: **810 PASS / 0 FAIL inesperados / 1 BLOCKED / 1 NOT RUN**. Preserva os651 checks anteriores e14corridas; incremento159: **9 RED capturados**, **105 GREEN de hipótese**, **43 verificações de contrato fiscal reduzido**, **2 de fragmento de projeção**. Estes45 últimos não são integração fiscal nem persistência canônica de título B2B.

Separadamente: monetário **37 PASS / 0 FAIL** (10.300/7.550, eventos, parcial, estorno e replay); proveniência **42 PASS / 0 FAIL / 1 BLOCKED**; Vitest **10/10, quatro arquivos, sem erros finais**. Não somar assertions internas com testes Vitest nem com históricos.

## Defeitos RED e hipóteses

1. `generate_b2b_receivable_secure_impl`, catálogo `.functions[459].body`, linhas38–50: tenant ligado ao parceiro comprador precede commercial owner. A fixture sintética FSF com tenant próprio causa `42501 B2B_FINANCIAL_TENANT_MISMATCH` ao ator credor AR. Não reproduziu título invertido persistido: negou antes do INSERT. Hipótese substitui só essa resolução por owner comercial ativo; h15, RBAC, snapshot externo e demais gates preservados. Fragmento pré-gate devolve exatamente ownerAR/parceiroFSF sem writes. Implementação completa chega a **`P0001 billing_not_eligible:PAYMENT_TERMS_NOT_DEFINED`**, não sucesso.
2. `tg_partner_orders_credit_guard`, `.functions[245].body`, linhas59–60 e atalhos17–33: limite zero completo permite status aprovado/atalho no carrier. Isso é defeito RED, não autorização segura. Hipótese nega progressão com23514 `B2B_ZERO_CREDIT_LIMIT` **após autorização** e antes dos atalhos. MatrizA/B nega foreign com42501 `C2P1_FORBIDDEN`, sem revelar limite. Zero testado também em auto, elegibilidade, link e wrapper; contenções contábeis/origem ainda prevalecem. Calculator mantém fórmula e ação capturadas, removendo só classificação zero=`NO_LIMIT_DEFINED`; exposição positiva contra zero retorna `LIMIT_EXCEEDED_BLOCK`.

Limite NULL/ausente/negativo/NaN/Infinity e CAS/RBAC/método permanecem nos testes diferidos anteriores. Infinity mantém coerção22003 real. Não se decidiu exceção por aprovação para zero: hipótese mantém financeiro contido; futuros overrides/alçadas exigem contrato e prova específicos.

## Exposição e partes

Calculator capturado `.functions[900].body`: aberto=original−recebido, comprometidos aprovados sem título/link, pendentes vivos e novo pedido; exclui pedido próprio para não duplicar. Expectativas concretas: aberto9.300 após evento1.000 sobre financiado10.300; comprometido2.000; pendente1.500; novo700; atual12.800; projetada13.500; disponível6.500; utilização67,5%. Valor final financiado prevalece sobre total999. Pedido foreign9.000 e já vinculado5.000 não entram; excluir pendente resulta12.000; excesso retorna ação capturada BLOCK. Esta fórmula observada não define amortização, aging ou razão contábil.

IDs em metadata são **sintéticos explícitos**: ownerAR=`m.A`, tenant compradorFSF=`m.B`, parceiroFSF=`m.uid(900002)`. Nunca deduzidos por nome ou usados em produção. Matriz de contrato testa todos os campos NULL/invertidos/foreign: parceiro pedido/título/devedor fiscal e owner/título/parcela/emitente. É igualdade em carrier escrito para teste, **não assert fiscal instalado nem origem autorizada**.

Composição técnica avançou de42P01 `partner_order_items` ausente até condições canônicas ausentes: tabelas items/terms capturadas, vazias, colunas/checks/ACL e RLS deny-only. Não foram seedados preço/termos/approval/tickets. FKs/triggers/RLS completos desses dois elos seguem não integrados; relações vazias não provam writes. Bodies privados usam carriers DEFINER descartáveis: cliente authenticated despacha, mas isso não é o wrapper canônico. ACL impl/calculator client EXECUTE continua fechada. Cancelamento permanece chamado diretamente só como LOGIN não privilegiado.

## Evidência, hashes e revisão

Pasta nova `evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536/`: results/matrix/respostas/corpoimpl/diffs, logs finais PostgreSQL/Vitest, monetário, proveniência e SHA256SUMS. **68 arquivos históricos byte a byte preservados**; manifests antigos não regravados. integrity registra igualdade antes/depois, sem corrigir divergências antigas.

Tentativas intermediárias registradas: comando inicialmente iniciou antes do patch integrado; accessor `r.captured` reinstalava função durante transformação, corrigido por lookupmetadata+pg_get_functiondef; ACL impl fechada motivou carrier explicitamente não certificador; dependência items ausente composta sem fixtures; cadastro guard exigiu mutação autenticada legítima; Vitest comparava representação13500.0 com13500, corrigido para número. Logs preservados, nenhuma falha final mascarada. Revisão independente de fonte incorporou autorização antes do zero, integridadeorg/perfis/papéis nos negativos e limites dos carriers. Não certificou integração.

```text
python3 scripts/financial-installments-initial-20261024/test-cancel-authorization.py --output-dir <pasta-nova>
python3 scripts/financial-installments-initial-20261024/test-receivable-red-green.py --output-dir <pasta-nova>
python3 scripts/financial-installments-initial-20261024/test-financial-provenance.py --output-dir <pasta-nova>
bun run test --maxWorkers=1 --no-file-parallelism src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts src/test/financeiro/financialProvenanceOffline.test.ts
```

## Próxima intervenção exata e limites

### Suplemento15:58 — discrepância de empacotamento, sem nova execução

Revisão do commit `6107d3fbe0c47bc74c431d3a25779a79edfbd812`: o proprietário reportou `read_file`404 para `vitest-final.log`, apesar da entrada noSHA256SUMS. Conferência `git ls-files` e `git ls-tree` confirmou **11/28 entradas do manifesto no commit;17/28 logs ausentes**, ignorados por `*.log`. Portanto, o manifesto anterior certificava bytes locais, não disponibilidade versionada; sua declaração de logs preservados não significava acessibilidade pelo commit.

Os17originais ainda existem localmente e todos coincidem comSHA256 do manifesto original. Cópias byte a byte `.txt` em **`evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1536-git-supplement-1558/transcripts/`**, incluindo `vitest-final.txt`, `postgres.txt`, `monetary.txt`, `provenance.txt` e tentativas. Nenhuma execução nova, nenhum log inventado, nenhum byte ausente do commit alegado recuperado. Originais e manifests históricos intactos.

`source-manifest-reconciliation.json` registra presença/ausência de cada entrada no commit revisado e correspondência local/cópia; `SHA256SUMS.versioned` é o suplemento, exclui arquivos não rastreados e não altera oSHA256SUMS histórico. `check-git-tree.py <commit>` verifica existência **e bytes de blobs do commit**, não apenas disco. Suplemento confere as11evidências originais versionadas e as cópias novas; auto-manifest não incluído para evitar referência circular. Limite/gatilho/calendário aguardam resposta humana; nenhum ajuste funcional/runtime/produção nesta entrega.

Validação efetivamente executada contra commit **`fc2dfce542470c15d72e5b691f3e22e863c9bc20`**: **30 entradas, zero ausências/divergências** (11originais+17transcrições+reconciliação+verificador); o próprio manifesto também consta em `git ls-files`. Além de `*.log`, a regra literal `logs` ignorava a primeira pasta suplementar: corrigido para `transcripts`, sem mudar `.gitignore`. O404 informado não foi repetido via ferramenta read_file nesta rodada; sua causa de ausência no commit foi comprovada pela árvoreGit. Sem reexecução de testes nem recuperação alegada do commit antigo.

Não falta decidir vendedor/comprador, limite obrigatório nem cadastro posterior. Falta **fornecer limite numérico real autorizado e condições canônicas vinculáveis ao pedido**: calendário/dias fracionários, quantidade/distribuição/amortização das parcelas e gatilho de faturamento. A fixture usa manual/20.000 apenas como dados sintéticos, não decisões comerciais. Sem esses contratos, não fabricar PAYMENT_TERMS para tornar gate positivo.

Separadamente, evidência externa ainda necessária: origem canônica credor/owner/cliente; emitente fiscal vinculado ao mesmo credor e destinatário/devedor corretos; razão/BI/proveniência e consumidores integrais; full order/RLS/trigger/FKs/ledger; revisão e homologaçãoJWT/RLS/PostgRESTA/B autorizada. `C2_ACCOUNTING_PENDING` e `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` intactos. Nenhum positivo contábil/fiscal, cobrança ou remediação histórica. **NO-GO de produção.**