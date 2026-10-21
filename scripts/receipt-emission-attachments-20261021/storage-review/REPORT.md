# Recibos: promoção Edge + contenção Storage candidata — 21/10/2026

## Entrega e limites

Base solicitada `3eb1616ba0297b2f4fd683978004424a653c026e`; início sandbox
`7b01a7bf158cc442971424ee6e6d54ba081e2e59`. O sandbox já continha delta em
`previewAuthStorage.ts` em relação à base solicitada: SHA
`5b00130146b77ecd8ed49f118c640d3e75aa7c5e76695f3b9e3f7f8833719f0a`,
idêntico antes/depois; NÃO editado/revertido. Não pertence à correção de recibos.

Edge canônica promovida **exatamente** à candidata revisada:
`8fbceebf3054a38528fd48e250f9a58245d850ad2a99e01e0c21fa8db7978343`.
Baseline: `45913bfbc8aefe59c27868806a947f0e5b8c94e39f57212b27694e1536f9b4a0`.
Único delta funcional: remove createSignedUrl e campo url. Mantém getUser,
h15, bearer do ator, filtros tenant, geração, upload/upsert e atualização locator.
`receiptEmission.edgeReview.test.ts` agora executa runtime, não só candidata;
compara byte-exatidão e demonstra baseline assinando no laboratório.

**NÃO houve deploy Edge, SQL hosted, assinatura em produção, geração de recibo,
pagamento, mudança de sessão, reload ou publicação.** Nenhuma consulta hosted foi
feita por ferramenta com binding não comprovado. Informações live (bucket privado,
1 objeto/1 recibo, Edge v90/getUser+h15/verify_jwt=false/3600s) são recibo do
proprietário, não verificação independente nesta rodada. Catálogo/OS/termos/
contratos/portais permanecem fechados; CQ, referências, monitor e gates intactos.

## Contrato Storage e correção de risco adicional

Fontes oficiais fixadas em `supabase/storage@6a2aaee8acdd39d9bc59bcc3282528d613d37dbc`:
- [operation GUC](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/migrations/tenant/0024-operation-function.sql)
- [helpers exact/prefix normalization](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/migrations/tenant/0058-operation-ergonomics.sql)
- [nomes de rota](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/src/http/routes/operations.ts)
- [contexto servidor por transação](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/src/internal/database/postgres/scope.ts)
- [sign/sign_many e sign_upload](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/src/storage/object.ts#L1631-L1774)
- [autorização upload/upsert](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/src/storage/uploader.ts#L84-L101)

Captura SQL local anterior `scripts/authz-cache/v6/live-storage.sql.review` é de
17/10; é evidência histórica, NÃO substitui preflight atual ou prova HTTP instalada.
Policies locais `d51_5_financial_storage_*` exigem `financial_storage_object_permitted`
(h15 + equipe financeira + prefixo tenant). Não restringem operação, logo leitura
pode autorizar SIGN. Candidata mantém todas, sem redefinir funções/grants.

`storage.operation()` é GUC colocada pelo servidor Storage, não header/body cliente.
Helpers normalizam somente prefixo `storage.` e comparam exatamente. Ausente/
desconhecida nega. RPC SQL arbitrária privilegiada/acesso SQL pode forjar GUC na sua
transação: NÃO tratá-la como autoridade para tenant/papel. Não criamos RPC/setter.
`current_user='authenticated'` é papel SQL servidor, não metadata/claim frontend;
preflight HTTP deve comprovar este papel no caminho Storage instalado.

**Risco corrigido:** somente policy SELECT não bloqueia `createSignedUploadUrl`
sem upsert: este testa INSERT. Por isso candidata inclui fences RESTRICTIVE SELECT,
INSERT e UPDATE, apenas financial-receipts; nenhum OR permissivo as contorna.
Todas repetem guarda financeira/tenant e não substituem USING/WITH CHECK antigos.

Allowlist SELECT: download autenticado, info GET/HEAD (nomes legados), list/list_v2,
upload/upload_update (SELECT necessário ao upsert), delete/delete_many para preservar
operações financeiras existentes que dependam de leitura. INSERT/UPDATE só upload/
upload_update. Não permite sign/sign_many/sign_upload_url/get_signed/render.image_sign,
contexto NULL/vazio, copy/move, S3/TUS/futuras operações não inventariadas. Outros
buckets não são afetados. Nenhum gate global V6 foi ativado.
`service_role`, owner e BYPASSRLS não são contidos: Edge corrigida NÃO os usa; produtores
privilegiados precisam continuar sem assinadores, não há promessa de bloqueio global.

## Preflight / promoção SQL (bloqueada até revisão)

Arquivos ficam `.sql.review`, fora de `supabase/migrations`; nada aplicado.
1. Operador comprova destino exato `swzpzcwiasxmjutrmvkm` no transporte. Ausente/
divergente interrompe. Executa `preflight.sql.review` SELECT-only nesse destino.
2. Revisar snapshot JSON completo: policies de objects, ACL, RLS, bucket privado,
hashes/ACL/owner/volatilidade das cinco funções. Não imprimir JWT/path/conteúdo.
3. Comprovar versão instalada e operação das rotas HTTP; hash SQL não comprova rota.
As rotas/upsert necessitam prova em laboratório, não gerando assinatura em produção.
4. `prepare.py` recebe snapshot e recibo HTTP (`ref`, `storage_version`, `reviewed:true`,
`operations` com nomes normalizados requeridos) e produz SQL offline para revisão.
Ref errada/contrato incompleto aborta. **Não executar o template NULL.**
5. A SQL final trava policies concorrentes via LOCK e compara snapshot exato antes de
criar as 3 fences. Drift aborta atomicamente; reaplicação com destino ocupado aborta,
não duplica/não enfraquece. Reversibilidade aqui significa contenção, não restaurar
assinaturas. Aplicação e deploy permanecem atos exclusivos do proprietário.
6. `postflight.sql.review` + repetição PRE devem confirmar todas as guardas/policies
originais/ACL/funções preservadas, bucket privado e contagens iguais; comparar também
identidade/hash do documento pelo canal privado do operador, sem expor conteúdo.

## URLs antigas e cache: NÃO há revogação instantânea

[rota signed usa asSuperUser após validar token](https://github.com/supabase/storage/blob/6a2aaee8acdd39d9bc59bcc3282528d613d37dbc/src/http/routes/object/getSignedObject.ts#L58-L79):
a nova policy não revê autorização do emissor das URLs antigas. No origin, TTL3600s
conta desde emissão; não desde deploy. Cessar assinadores não apaga capabilities.

[Smart CDN oficial](https://supabase.com/docs/guides/storage/cdn/smart-cdn): token expiry
e cacheControl são independentes; cache por token pode servir resposta após expiração.
Cache de navegador/downloads já feitos também não podem ser revogados pela policy.
Não verificamos se Smart CDN está habilitado nem TTL efetivo do objeto existente;
portanto **não prometer fechamento em 1h ou horário definitivo**. Operador deve
inventariar último instante de emissão + TTL e Cache-Control/Age/cache-status pelo
canal privado, sem colar tokens em logs, sem gerar nova URL. Prova origin de expiração
não prova cache esgotado. Default descrito na documentação não é o TTL live comprovado.

Sem rotação global de chaves, exclusão/reescrita do objeto ou migração de path nesta
entrega. Não alterar bytes/histórico para invalidar cache. Se houver exigência de corte
imediato de capability existente, ela NÃO é atendida por este delta não destrutivo;
permanece risco residual explícito. Não usar signed URL antiga como fallback na UI.

## Evidências locais e rollback

- 110/110 focados (botão48 + lista51 + SDK1 + Edge runtime10).
- Config integral + focados: **1194/1194, 75 arquivos**, sem exclusão/skip/todo.
- **58 checks PG descartável**: baseline SIGN visível; sign/sign_many/sign_upload e
operações desconhecidas negadas; download/info/list/upload/upsert permitidos sob
escopo válido; tenant estrangeiro, revogado, anon e WITH CHECK negados; permissiva
ampla não contorna; ref/contrato drift e rollback não revisado bloqueados; documento
original preservado; service bypass explicitamente demonstrado.
- PostgreSQL real, mas operação/tenant/role são sintéticos: NÃO prova JWT/RLS HTTP
hosted nem homologação das sessões reais. Não executada emissão UI, pois não há
recebimento elegível autorizado; nenhum recibo novo foi criado para facilitar teste.
- Compilação/checagem automática do projeto: log `build-errors.log` build OK
12:40:23 UTC (harness, sem execução manual). Não confundir build hospedado antigo
3eb1616b com validação local atual. Edge avaliada via transpiler e mocks, não deploy
Deno hosted; aceite HTTP real continua pendente do proprietário.
- Rollback Edge `edge-rollback.py` preflight hashes protegido e testado em cópia:
retorna 503, nunca createSignedUrl nem escreve documento. Pode alternativamente
manter Edge corrigida. Rollback frontend existente continua desabilitando emissão.
- Rollback SQL mantém as 3 fences e nega leitura/escrita financeira; não remove policy,
não restaura signer; validado em PG com hashes POST, documento e outros buckets
preservados. Custo explícito: recibos temporariamente indisponíveis para cliente.
- `activation.json` / SHA256SUMS vinculam Edge, safe rollback e dependências intactas.
