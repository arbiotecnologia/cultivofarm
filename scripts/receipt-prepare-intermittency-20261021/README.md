# Intermitência do preparo de recibos (candidata local, NÃO implantada)

Base: frontend publicado 56e5, Edge v96 (fonte layout v95). Sem Edge/SQL/Auth/dados/publicação.

## Causas reproduzidas (`src/test/financeiro/receiptPrepareIntermittency.test.tsx`)
1. `opener.open` engolia falha de Storage e o chamador seguia como se houvesse bytes: post-read rodava e o
   estado terminava "preparado" sem Blob → botão volta a "Preparar PDF" sem baixar (sintoma B 13:30:07).
2. Timeout pai (15 s) abortava só o controller do componente; o I/O do opener tinha controller próprio,
   continuava vivo e mantinha `loadingPaths` → retry desabilitado até a resposta tardia (sintoma 13:29–13:32).
3. Renovação natural muda `authzEpoch` → escopo da lista muda → linhas remontam e o preparo some em silêncio.

## Correção
- `open(path, onError, parentSignal)` retorna `true` só com bytes frescos armazenados; o sinal pai aborta o I/O
  próprio; caminho ocupado/abortado retorna `false`. Chamadores existentes sem retorno seguem compatíveis.
- Lista e botão: `!loaded` ⇒ erro, sem post-read nem estado preparado; respostas tardias não criam Blob.
- Renovação durante preparo: aviso neutro após o commit **apenas se o ator continua autorizado**; nunca retry
  automático (emissão é mutante). Lease/monitor/Auth inalterados.
- Telemetria local `cultivo-receipt-prepare` (ring 40, console só em não-ok): `source/stage/outcome/elapsedMs`;
  sem IDs, caminhos, tenant, tokens, URLs ou texto de erro.

## Resultados
Novos 6/6 (baseline reproduz 1 e 2); recibos/anexos 192/192; `tsgo` e build OK. Testes de opener só tiveram
a anotação `Promise<void>`→`Promise<boolean>`.

## Rollback
`rollback.py` restaura byte-exato a baseline 56e5 (hashes em `SHA256SUMS`); não reintroduz assinatura.

## URLs antigas (investigação, sem ação externa)
- Assinaturas antigas da Edge ≤v90 são JWT do Storage com `exp` próprio (3600 s); remover a emissão (v91+)
  e as policies `receipt_no_capability_*` não as invalida antes do `exp`. Revogação imediata exigiria rotacionar
  o segredo JWT (impacto global, não feito) ou mover/renomear o objeto (altera histórico, não feito).
- Bytes já baixados e caches de navegador/proxy não são revogáveis. Nenhum chamado foi enviado.
- Controle sugerido para revisão: consulta read-only de logs Storage por `/object/sign/financial-receipts`
  após a janela de exp das últimas emissões v90, para confirmar ausência de uso.

## Revisão cc5fbf (corrigida)
- Ownership do opener é liberada no próprio abort do pai (comparando controller) e publicada se o escopo ainda vale;
  transporte que ignora abort não bloqueia mais `loadingPaths`/retry; completion antiga não remove nem revoga bytes novos.
- Telemetria registrada exatamente uma vez: no evento timeout/fence (mesmo com I/O pendurado) ou no finally.
- Testes: `attachmentOpenerAbortOwnership.test.tsx` (hook real) + 2 de telemetria; focados 196/196.

## Revisão 6a551 (corrigida)
- Abort do pai (timeout/fence) revoga na hora o Blob já armazenado e ainda não confirmado pelo pós-read
  (`dropUnconfirmed`, só se `latest === controller`); finally reutiliza a mesma função (idempotente).
- Variáveis `opened/kept/outcome` declaradas antes do listener; clique de download sobre estado confirmado não é afetado.
- Testes: pós-read ignorando abort (lista/botão), revogação aos 15001 ms, retry até Baixar PDF, e retry antes da
  resposta tardia sem revogar o Blob novo. Mock antigo de `sonner` em `RecibosList.scope` ganhou `info` (só simulador).
- Focados 200/200 sem erros não tratados; tsgo e build OK.
