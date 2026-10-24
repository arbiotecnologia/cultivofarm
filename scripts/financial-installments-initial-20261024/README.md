# Parcelas iniciais financeiras — INATIVO / revisão independente

## Causa confirmada
Relato real tenant B em 24/10 às 03:10:47 e 03:11:50 UTC: RPC recusada com 23514, nenhum título persistido. Captura SELECT canônica feita pelo Lovable às 03:14 UTC; ref comprovado pela configuração `swzpzcwiasxmjutrmvkm`. Não houve SQL hospedado mutante.

`NovaContaDialog` envia R$1 em .34/.33/.33. O gerador atual insere .33/.33/.34 e a RPC tenta UPDATE de valores/datas imutáveis. O guard H6 recusa corretamente. **Payable tem a mesma falha demonstrada**, com o mesmo pós-UPDATE; o candidato cobre somente esse mecanismo comum.

## Candidato independente
- `preflight.sql`: READ ONLY, corpos completos por MD5, owner/ACL, triggers, RLS e policies capturados.
- `candidate.sql.review`: PRE → tabela estritamente privada → três corpos → POST, uma transação.
- `postflight.sql`: READ ONLY, hashes normalizados pelo PostgreSQL, infraestrutura privada sem acesso de anon/authenticated/service_role e contexto vazio.
- `rollback.sql.review`: PRE novo → restaura três corpos LIVE originais → POST original, uma transação; não apaga títulos, parcelas ou histórico. Preserva tabela privada vazia/inacessível. **Restaura também a recusa antiga para personalização: rollback não é solução funcional.** Drenar chamadas e exigir contexto vazio antes de operar.
- `baseline/`, `capture.json`: originais preservados; `*.diff` mostram cada mudança; `frontend.patch` traz apenas erro persistente/teste.
- `post-hashes.json`, `SHA256SUMS`: hashes e manifesto.

A RPC mantém suas validações/autoridade e acrescenta rejeição de total incapaz de produzir parcelas positivas e datas infinitas. Gera ID do título no servidor e registra parcelas previamente validadas em contexto privado por txid/título/kind/ator/tenant. O trigger consome essa linha na mesma transação, valida identidade/empresa/autoridade e insere os valores/datas finais de primeira. Sem payload de bypass, GUC autorizador, exceção de snapshot, DELETE de parcelas ou alteração RLS. A única remoção é do contexto privado transitório. Demais inserções preservam o gerador original.

## Hashes
LIVE RPC `382850b085f3a867b914c307f7ac7c10` → `0778b876b300e08d53f1cf7790394fc5`.
LIVE AR `9c6ef883bb4a97928a5179bc63e9ca31` → `fba70619b461c468a8c645ce1c3a8ed8`.
LIVE AP `6d541374b274b2a23707ffa591963581` → `f4b15f02171e321e5ca0370255ccbff1`.
Owners e ACLs originais mantidos. H6 AR/AP, tenant links e autorização permanecem byte-exatos.

## Testes e limites
`bun run test -- src/test/financeiro/initialInstallmentsPostgres.test.ts src/test/financeiro/novaContaReceber.test.tsx src/test/financeiro/novaContaDeadline.test.ts --maxWorkers=1 --no-file-parallelism`
**33/33 PASS em 3 arquivos (10,42s)**. PostgreSQL descartável executa funções financeiras/tenant/autorização capturadas, gatilhos definidos e políticas reais; Auth/readiness/SaaS/auditoria/outros guards de título têm dependências sintéticas e esquema reduzido explicitados em `test-local.py`. Não certifica JWT/RLS hosted ou contabilidade real.

Cobertura: erro antigo em AR/AP; R$1/3 .34/.33/.33 A/B; .99/3; .01/3 negado; datas customizadas; soma/numeração/datas infinitas inválidas; falha tardia com rollback título/parcelas/auditoria; tenant cruzado, cliente estrangeiro, RLS de leitura com controles positivos; revogação/perfil inativo; contexto inacessível; edição posterior negada; candidate e rollback **completos** com falha deliberada depois do POST, catálogo preservado, checkpoints com mesmo txid.
Erro remoto fica visível no diálogo enquanto edição permanece; timeout/resposta incerta continuam exigindo conferência, sem retry automático. Aviso Radix de descrição já existente foi observado, não alterado.
Build automático observado OK; build/typecheck manuais não executados conforme restrição do ambiente. Sem homologação no navegador autenticado: Supabase externo não disponibiliza sessão gerenciada e nenhuma sessão foi alterada.

## Conciliação com final-integrated
**Não instalar o final-integrated histórico depois desta correção:** seu PRE espera AR `9c6ef...` e seu CREATE substituiria a correção pelo corpo contratual `de469...`. Guards devem falhar, não ajustar hashes cegamente.
`future-composed-function.sql.review` é **somente fragmento não implantável**: preserva ramo manual privado e adiciona byte-exato o ramo contratual B2B do final-integrated. Teste local demonstra manual 1/3 e cronograma B2B com valores/datas/tenant corretos. Não certifica cadeia completa de origem/aprovação. Futuro pacote novo deve incorporar esse corpo, infraestrutura privada, RPC/AP preservados e recapturar PRE/POST/containment integrais. Histórico final-integrated ficou intocado.
Fiscal, crédito LIVE `213ac31f3a30816ead75365b0d1fed18`, wrapper corrigido, writer false e contabilidade DRAFT não foram alterados. Gate contábil pertence à composição de pedidos, **não é requisito artificial para corrigir criação financeira manual**. Implantação e homologação JWT/UI reais aguardam revisão independente, sem publicação neste trabalho.
