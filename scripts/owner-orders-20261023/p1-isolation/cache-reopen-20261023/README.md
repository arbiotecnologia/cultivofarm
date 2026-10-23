# P1 — correção de cache/baseline salvar e reabrir (não publicada)

## Diagnóstico reproduzido
Default global App refetchOnMount=false/staleTime5min impedia releitura em reabertura; RPC onSuccess só invalidava sem await e não adotava retorno. Diálogo inicializava baseline uma vez a partir de cache stale, inclusive durante refetch, congelando pix/produzindo conflito permanente. Os testes separados não exerciam essa composição.

## Fix exato
- Somente src/hooks/useB2BFinanceiro.ts e src/pages/financeiro/FinanceiroB2B.tsx, diff frontend-cache.patch.
- RPC confirmada: valida partner_id retorno; cancela query pfs/partner/scope anterior, revalida fence, setQueryData do retorno canônico e await invalidateQueries(active, throwOnError), revalida fence novamente. Nenhum default/draft vira cache, nenhuma escrita direta/retry de mutation.
- Operação permanece pending até releitura concluir; fechamento só com fence válido. Falha de confirmação/refetch mantém diálogo/rascunho e impede reenvio automático.
- Reader pfs sobrescreve APENAS refetchOnMount=always; baseline novo espera isFetchedAfterMount e !isFetching. Baseline estabelecido permanece imutável, edição suja preservada, alteração real/CAS negado continua conflito. Adotar retorno enquanto saving não gera alerta falso de conflito.
- Escopos owner/ownorg/RLS/RPC/CAS servidor, Auth/roles/lease/rotas/entitlements/Edges/SQL/dados não alterados. Writer C2 fechado.

## Evidência
59/59 testes em5arquivos, incluindo11 integrados com QueryClient/hook/dialog/scope reais e SDK externo sintético. Reproduziu baseline 3 falhas funcionais de9 (save/reopen/cache, read inicial, await/read tardio); primeira execução também teve2 falsos positivos no teste tenant/epoch por nova consulta legítima do novo scope lendo o servidor sintético após RPC. Corrigido fixture segurando reads do novo contexto, sem alterar regra de segurança; depois fix e cobertura adicional pós-RPC:11/11 integração. Não contabilizar falsos positivos como vulnerabilidade baseline.
tsgo app/node EXIT0 em cópia integrada /tmp/p1-cache-integrated-check; não tsc. Vite production PASS26,04s (aviso chunks grandes); preview build OK. Runtime bytes finais do fix iguais aos compilados. Scripts/tests não equivalem a JWT/RLS real; authenticated E2E indisponível external_unmanaged, sem sessão alterada.

## Release externo registrado, não reaplicar
Codex migration20261023211007_c2_private_assignments_financial_settings/PRE/POST/dados iguais relatados, JWT B nova aba nenhuma atribuição/A própria publicada. Método AUDIT salvo UI21:18:08.481422+00, prazo7/na_entrega intactos. applied/ contém registro relatado, não migration fabricada. Arquivamento B bloqueado pela revisão automática Codex: sem tentativa por outro mecanismo, pendente confirmação específica.

## Artefato publicado investigado read-only
HTTP público app.cultivofarm.com.br anuncia commit bafe3e23b135646bd1b9f49ffa0a61fd6c09b1cb/deploymentbcca6f2f/meta build-mvlgu8zf. Entry index-b876l0_R.js importa lazy App-g15BlqsQ.js; SHA256 App público3ea109c28dcf93873be3fd40318c648f3905921ba2df277e451202b298ddadae igual à cópia build anterior. Chunk real contém RPC/invalidação antiga, não erro de artefato velho. Busca inicial só no entry não provava ausência: foi corrigida conferindo App. Isto prova conteúdo público, não sessão da nova aba autenticada nem comportamento do backend.

## Revisão e limites
Conferir SHA256SUMS, diff e testar UI real após publicação expressamente autorizada. Não publicar agora; não banco/dados/migrations/Edges/writerC2/arquivamento. Monitor/multiperfil B/anexos/fiscal/cancelamento/estorno/idempotência/preço e negativo arquivamento continuam pendentes; não afirmar homologação integral. Reversão nunca restaura DML direto/ACL antiga.
