# Pós-implantação informado e pré-requisito revisável —19/10 13:46

## Evidência externa, não reexecução pelo agente

Auditor aplicou `application_canonical_recovery_20261019` em `swzpzcwiasxmjutrmvkm`: candidata638ad55 SHA54b9ad6cd32368149c3956de58c6affb314e39a60e5af7789bda0c7a6bd72fe1 (execute_roles).76168eff renomeia variável/docs, corpos iguais. Postflight integral16 funções/schema/ACL PASS: RPCf8bc9d5f000abef7f13e6ca340988734, Storagedaefb183522e2ee7f730e0db243f4823, helper04067ba43cea3eed845a1fd3735061e0 preservado. applications/evidence/preparations0; privada RLStrue/ACLpostgresonly.

Publicação76168eff deployment878d2654-90c8-49a3-8993-ec1526938fe2 confirmada pelo auditor no painel e nova aba B, bundle index-Dew52uBQ.js; originais A/B sem reload. Independentes tsc app após diagnóstico+OS EXIT0, tsc node EXIT0,228 testes recuperação/PDF/monitor e25 OS PASS. Recibos referem-se ao publicado, não às alterações desta entrega.

Advisors:37 RLS policyless (+1 privada intencional),337 authenticated definer (+1 RPC validada),2 anon,1 password. Não é ausência de findings ou risco zero.

Formulário REAL cliente→fazenda→talhão PASS, mas INSERT recusado, nenhuma OS criada. BioInoculante70705eb6-0230-5e32-9e43-2b2998194d67/dose100/famíliaNULL: SQL authenticated+iat fresco em ROLLBACK reproduziu23514 LAB_ITEM_NOT_MANUFACTURABLE; não é JWT real. Oito doses positivas listadas sem família e único biológico sem dose: sem item válido atual. Não homologados cadastro de aplicação/anexo/revogação A/B; pausa admin ainda sem causa certificada.

## Correção focal

Nova OS lê família explícita e filtra produtos biológicos com dose finita positiva; valida novamente no submit. Nunca infere família pelo tipo legado. Guard server preservado: família biológico/existência para produto, existência para microrganismo e negação de dupla referência; dose positiva é pré-requisito adicional já exigido pelo formulário para cálculo de volume.23514 com mensagem exata LAB_ITEM_NOT_MANUFACTURABLE tem retorno específico, demais erros continuam neutros.

Somente `recordAuthzDiagnostic` emite `console.warn('cultivo-authz-expire', allowlist)` para expire verdadeiro; evento/estado/reason/visibility/online/RTT/deltas limitados e reconstruídos. Nada de PII/URL/token/fingerprint, nenhum envio/persistência. AuthProvider mantém observador exclusivamente admin empresa; monitor/lease/gates intactos. Capturar em dev.logs antes de retry; não requer JS global e não permite concluir causalidade retroativa.

## Fixture e sequência executável, com bloqueadores

Leituras hosted pelo agente validaram ref pelo fiscal_environment_marker, schemas/triggers/policies de produtos e corpos/ACL de fabricação/aprovação/avanço. Sem escrita. Catálogo global UI de empresa fechado; ProdutosTab não grava família e OwnedCatalogItemDialog não grava dose: nenhum desses formulários oferece sozinho produto completo elegível. Não habilitar escrita global/alterar reais para forçar teste.

`scripts/os-manufacturable-prerequisite/fixture-product.sql.review` prepara um produto NOVO sintético ID1986af48-709f-4bf4-85b4-3c9ed8a61019, família biológico/classe inoculante/dose100, código manual único, sem preços/B2B. Guarda fingerprint real produtos e helper; triggers existentes ativos; sem GUC/grants. Seed privilegiado exclusivo auditor autorizado pelo proprietário, não alçada tenant. Default ROLLBACK; persistência exige revisão pelo auditor e troca apenas terminador para COMMIT com novo SHA. Não executado hosted; execução em catálogo local equivalente ainda NÃO CERTIFICADA. Rollback exato recusa identidade divergente/referências; FKs adicionais negam sem cascade, sem destruir histórico. Não remover produto após uso em OS/aplicação.

1. Auditor ensaia seed/rollback, verifica triggers/RLS, persiste somente fixture revisada. Admin A/B leem produto via política internal existente, não recebem escrita global.
2. B usa pais existentes cliente cc586e4a-8953-4f3c-9a38-57e3665d1667/fazenda46bea8e9-79fc-440b-bdb5-76f40ba4550f/talhão806d9789-a87e-4e25-8d59-aa9eea24dabe e cria somente OS aberta pelo formulário, sem finalizar comercial/comunicação.
3. **STOP antes de aprovação/avanço:** `rpc_aprovar_os_v1(uuid,text)` live MD5d65be82dbf38ec429b7377bd6873ba47, ACLpostgresonly, authenticated/service false; `_avancar_os_status` MD53da8242d67462c916a2d971f5ea7bb97 e fn_avancar_etapa_esteira MD57ed490f667efcd6e50eb7a2a061899b6 authenticated false. Não chamar helper privado/UPDATE status/INSERT avançada nem conceder EXECUTE. Tornar OS elegível depende de recuperação canônica separada/revisada dessas operações; esta entrega não a implementa.
4. Homologação aplicação/PDF/anexo/revogação depende da OS elegível canônica e sessões reais; nenhum PASS positivo inventado com seed, claims ou timers.

Rollback frontend somente os três arquivos listados no manifesto próprio com checagem POST antes de restaurar; não usar rollback antigo do pacote recuperação/diagnóstico para remover funcionalidades já publicadas. Pacotes SQL/PDF anteriores preservados byte-exatos; novos hashes em manifesto dedicado.
## Tipagem e limite da candidata

SDK gerado não inclui familia_catalogo live: query usa filter no cliente canônico; resposta unknown decodificada estruturalmente falha fechado se família faltar. Não editar types gerados ou adotar erro select como Produto. Build automático não é recibo app; checker independente novo aguarda auditor.

## Recibo local final

- Vitest dirigido:5 arquivos/93 testes PASS (OS/decoder/diagnóstico/financeiro-admin ambiental/monitor); transporte fake, não Auth/JWT/homologação real. RTT3s≥90s e suspensão de clock incluídos nas regressões existentes; nenhum limite alterado.
- Staging4/4 e export7/7 PASS. Build automático último13:55:14Z OK; checker efetivo app/node desta entrega NÃO EXECUTADO pelo agente (proibição de typecheck manual). Snapshot novo1671 arquivos/26 partes em scripts/os-manufacturable-prerequisite/typecheck-snapshot, manifesto SHA b7a2726027989d1234ed63395869ea372221021f3e3a8d940583aa27819d7a9c, materializado byte a byte em /tmp. Auditor usa materialize.py existente, instala com scripts desabilitados e executa tsc -p tsconfig.app.json --noEmit e tsc -p tsconfig.node.json --noEmit.
- Preflight/seed/rollback fixture novos NÃO executados em catálogo equivalente nem hosted; revisão deve confirmar fingerprint/colunas/triggers antes de persistência. Não chamar este seed implantável certificado.
- Divergência literal a reconciliar: auditor informou Storage POST terminando4827, enquanto pacote SQL congelado e recibos locais anteriores terminam4823. Nenhum corpo/hash do pacote foi alterado para ocultar diferença; auditor deve confirmar valor exato. RPC/helper conforme informados, sem reaplicação.
- Sem nova DDL/DML hosted, publicação, Edge, reload/login, pagamentos, contratos ou v6. Sem prova positiva real nova: sessão publicada não contém esta candidata, e OS elegível depende de operações fechadas.

## Complemento auditor — base ff80ad
1671 hashes sem divergência, tsc app/node EXIT0 e93/93 independentes para ff80ad, não para esta revisão posterior. Deployment solicitado a25497c3-d44c-4765-aed9-887875a127be informado pending; sem consulta de conclusão. Seed1986af48-709f-4bf4-85b4-3c9ed8a61019 ensaio ROLLBACK PASS seguido COMMIT PASS e pós-consulta biológico/dose100/B2Bfalse/preçosNULL informados; não reaplicado. Storage4827 foi transcrição; correto4823. Nenhuma OS criada até o relato.
