# Reconciliação local fe2b6117 — catálogo, sem duplicação

Snapshot read-only: `fe2b61178c6ec8d6da633d983b24bba47a6dae62` do isolado aec6d152-e409-44bf-9cb3-10da72365572.

Hash integral do patch upstream conferido:
`15e9fe9c047ed01ad2dde62e2f81a5d7fe7534bd2e06127cbccaf5f4a61911c5`.

## Resultado da revisão do artefato

O patch exato tem **49 linhas e apenas um destino**, `src/test/catalogo/tenant-products-scope.test.tsx` (dois testes). **Não contém o hook runtime anunciado**. O runtime foi comparado diretamente com o arquivo legítimo do snapshot, preservado como `.ts.txt` para revisão, sem importação em src.

| Necessidade | Isolado | Original final | Decisão |
|---|---|---|---|
| Receiver rpc | bind(supabase) | bind(supabase) | Já corrigido |
| Cache empresa/usuário | key com org/user | wrapper com org/user/papéis/época/request | Preservar original |
| Fence ao mudar sessão | remove caches em effect | hide/cancel/remove e recusa resposta tardia/ABA | Preservar original |
| Chave de intenção | assinatura inclui org/user | assinatura inclui escopo integral | Novo teste SDK real confirma mesma chave só no mesmo escopo |
| Invalidação capturada | retorno `{ack,scope}` | ACK original + context capturado/predicate scoped | Não quebrar contrato de retorno |
| ACK pós-troca | sem recheck após await no hook upstream | recheck antes de adotar ACK | Não regredir |
| Teste sem perfil pronto | mock rpc | SDK real/fetch stub + perfil ativo/roles/ready | Já coberto com barreira mais estrita |

Não houve aplicação cega do patch de testes: mocks upstream não têm roles/perfil ativo/abortSignal que o wrapper original exige e escondem perda de receiver. Os comportamentos estão cobertos pelos testes reais do SDK existentes, incluindo o novo teste de chave incerta por escopo. Nenhum helper duplicado foi criado.

## Provas externas reportadas e limites

O auditor esclareceu que AR Bio no header/sidebar é `configuracoes_sistema.nome_empresa` **GLOBAL na homolog**, não cache vazado; não alterou o registro global. Esse esclarecimento supersede a suspeita inicial de branding/cache. Marca global não é prova da empresa dona de um registro nem autorização.

JWT FSF API/UI create/edit/archive/restore PASS, owner FSF confirmado, negativo AR Bio P0002 e leitura REST200[] foram **reportados pelo auditor**; não executados pelo agente. As 814 verificações catálogo do isolado são alegação externa, não somadas aos testes locais.

P0002 continua ausente no escopo, sem success/retry/invalidação ou tentativa de descobrir dono estrangeiro. Financeiro/comercial restaurados permanecem byte a byte da base9d3a9424 (suíte de separação 5/5). Não importar binding/containment homolog, não aplicar SQL nem publicar. SMTP, emissão fiscal e cobranças continuam OFF.

Publicação **NO-GO** até AR Bio→FSF em sessão real, POST e testes finais independentes; não reutilizar os resultados FSF para certificar produção.