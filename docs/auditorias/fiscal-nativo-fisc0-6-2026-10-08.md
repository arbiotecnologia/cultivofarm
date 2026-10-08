# Fiscal nativo Cultivo Farm — FISC-0–6

## Resultado

**FISC-0: inventário parcial PASS; NO-GO para homologação oficial/E2E.** Diretriz19:29UTC integrada ao roadmap, preservando P2–P6. HEAD inicial `e99badff26a00a42b435417abbf682524aed8f3e`, árvore limpa; revisão intermediária `01790a53f2d36c795d678bca3c82310920b10c4a`. Commits automáticos preservados.

Somente docs/memória/regra arquitetural nesta rodada: **nenhum runtime, rota, dependência, migration, GRANT, vínculo, documento, certificado ou transporte alterado**. Arquitetura abaixo é evolução proposta, não emissor paralelo nem capacidade operacional certificada.

Canônico confirmado antes de SELECT por `lovable supabase info`: produção externa `swzpzcwiasxmjutrmvkm`, URL canônica; config/client concordam. Homolog `vrlcdwmlytukrjezrrnf` não acessada: **paridade UNVERIFIED**, sem fixtures persistentes ou troca de cliente. Nenhuma operação no banco interno Cloud.

## Inventário real e gaps

|Superfície|Existe/evidência|Gap/limite|
|---|---|---|
|Rotas|`App.tsx:623–632`: settings empresa/produto/serviço/cliente, documentos, reconciliação, prontidão e aliases|UI/RoleGuard não comprovam autorização backend|
|Settings|`company_fiscal_settings`: organization, identificação/CRT/regime/CNAE/inscrições, ambientes/séries/providers/referências/RTC|2 configurações atuais DRAFT, não alteradas; contrato multiestabelecimento não provado|
|Documento|`fiscal_invoices`: organization/company_settings, snapshots empresa/cliente/fiscal/tributário, origem/pedido/recebível/entrega, versão/lock/status/ambiente|Colunas não provam lineage/imutabilidade completa; origem comercial P6 permanece bloqueada|
|Modelos|CHECK vivo invoice `NFE/NFSE/OTHER`; wizard NFE/NFSE|Modelo legal55 não deve ser enviado nessa coluna; CT-e57/MDF-e58 sem implementação específica comprovada|
|Série/reserva|`fiscal_document_series`: company_id/model/series/environment, UNIQUE conjunto; CHECK modelo55; RPC `rpc_fiscal_reserve_nfe_number_v1`|Não suporta outros modelos; company_id é configuração fiscal, não cadastro multiestabelecimento certificado|
|Atomicidade|Reserva exige staff/invoice antes do replay, gate homolog, locks documento/advisory/série, atualização e reserva na mesma transação|Código presente, concorrência real/rollback autenticado/replay hostil UNVERIFIED; anon EXECUTE false/auth true exige guard|
|NF-e XML|`fiscal-xml-engine`, shared builder/XSD/Xerces/assinatura/run/hash/versão|Implementação presente, não autorização SEFAZ nem conformidade com NT atuais|
|Certificado|Edges upload/revoke/shared vault/titularidade; certificates/material|Nenhum material/PFX/senha/secret lido ou obtido; acesso real não testado|
|NF-e transporte|`fiscal-sefaz-transport/index.ts:4,20,377`: SOAP4.00 allowlist MG homolog/tpAmb2; guards invoice/run/event133,368,411,459|Não é suporte nacional ou homologação operacional comprovada; endpoint não invocado|
|Eventos/protocolo|`fiscal-event-sign:204` aceita CANCELLATION/CORRECTION; shared nfeProc/protocoledStorage verifica hash/bytes/colisão|Inutilização/EPEC/encerramento e lifecycle completo não comprovados; XML assinado não equivale a autorizado|
|NFS-e|Settings/perfis ISS/retencões/códigos nacional/municipal e campos RTC; `rascunhoSnapshots.ts:32–52,112–131`|Sem pipeline DPS/XML/transporte nacional/municipal específico comprovado; scaffolding não é emissor funcional|
|Storage/auxiliares|Buckets fiscal-xml/fiscal-certificates privados; refs danfe_document_id/opções/labels|Policy/path/download completo e geração DANFE/DANFSE/DACTE/DAMDFE por tenant/modelo UNVERIFIED|
|Webhooks/retry|Referências settings, reconciliação/eventos/chaves existentes|Receiver autenticado/dedup server/fencing/resultado incerto por modelo não certificados; chave UI não é idempotência distribuída|

Catálogo vivo: **28/28 tabelas fiscais incluindo settings com RLS habilitada**. Settings leem admin/gestor/financeiro por organization, escrevem admin por organization e DELETE false; certificados leem metadados por papel+h15_company_access; séries leem por papel+company scope. Material de certificado sem policy cliente observada: não abrir acesso. Evidência de composição estrutural **não** equivale a prova dinâmica RLS/JWT/Storage.

Ledger confirmado: BF `20261008173204`, P2A `20261008184449` e migrations snapshots/validação/contenção `20261008192025/192236/192601`. Nenhuma reaplicação. Creator A/revisão comercial/propagação até produção-entrega-título-fiscal continuam NO-GO; nova trilha não contorna BF01–03/P1A/P2A ou esses gates.

## Arquitetura-alvo reutilizada

Reutilizar fiscal_invoices/settings/series/reservations/xml_runs/events/transmissions/protocoled_documents/audit, shared fiscal e Edges existentes. Adapters/codecs por modelo dentro do mesmo pipeline; **nenhuma cópia de emissor ou fluxo comercial paralelo**.

```text
Operação própria provada → Auth ativo/papel/feature/tenant
 → estabelecimento proprietário/configuração/revisão fiscal
 → rascunho/revisão → snapshots imutáveis → reserva transacional
 → XML/DPS versionado → XSD oficial → assinatura server-side
 → SIMULAÇÃO SEM VALIDADE | homologação oficial gated
 → protocolo conferido/reconciliação → artefatos privados/auditoria/eventos
```

### Contratos obrigatórios antes de mudanças funcionais

- **A≠P:** operação interna A usa terceiro comercial P owned A; credor/emissor A só quando determinísticos. Tenant P pode emitir apenas suas operações/dados próprios P. Mesmo CNPJ/organizations.partner_account_id não concedem direitos. Negar A→P/P→A com IDs/chaves/paths conhecidos; não mover/atribuir legado.
- **Estabelecimento:** reutilizar configuração vinculada ao tenant se provar estabelecimento proprietário da operação. Ambiguidade/ausência/inatividade nega, sem “último atualizado”, CNPJ ou fallback. Antes de qualquer campo/FK aditivo, provar identidade/uniqueness. Selar identificação/endereço/inscrições/CRT/regime/revisão/fontes na emissão; mudanças por revisão/evento permitido, sem sobrescrever documento histórico.
- **Permissão:** RPC/Edge/Storage validam ator ativo, tenant do recurso, papel, feature e estado antes de replay/leitura privilegiada. Service-role é implementação interna, não autoridade do caller. Superadmin não herda conteúdo/credencial fiscal automaticamente.
- **Ambiente backend:** cruzar marcador/settings/operação/reserva/run/evento/endpoint/retorno. Marcador vivo diz STAGING no ref produção, production_emission_allowed=false: isso não comprova paridade homolog nem muda o destino do banco. Produção fiscal negada; UI não escolhe endpoint/credencial efetivos.
- **Sequências:** estender a reserva existente somente com contrato provado: tenant/estabelecimento/modelo/série/ambiente+unique+locks. NFS-e DPS/RPS/numeração depende padrão/município, não copiar NF-e. Timeout não devolve/reutiliza número arbitrariamente; conciliar e inutilizar somente quando aplicável legalmente.
- **Idempotência/retry:** scope tenant/estabelecimento/modelo/ambiente/operação e hash canônico; reautorizar replay, negar conteúdo divergente. Consultar recibo/protocolo antes de retry em resultado desconhecido, sem nova emissão automática. Lease/fencing do worker, auditoria e reconciliação; banco+SEFAZ não constituem transação distribuída.
- **Credenciais:** apenas referências sanitizadas na UI; material cifrado/privado e assinatura server-side. Titularidade/validade/tenant/estabelecimento/uso por modelo obrigatórios. Nenhum PFX/senha solicitado/obtido neste escopo; mocks sem material real primeiro.
- **Storage:** namespace derivado servidor tenant/estabelecimento/modelo/ambiente/documento/versão, owner pela origem persistida e não só prefixo; hash/bytes/imutabilidade sem mover legado. Separar assinado/autorizado/rejeitado/simulado/protocolado. Simulação **SEM VALIDADE FISCAL — SIMULAÇÃO**, sem AUTHORIZED/protocolo fictício.
- **Eventos:** matriz por documento/status/prazo/versão; cancelamento/CC-e/inutilização NF-e, cancelamento/substituição NFS-e e eventos CT-e/MDF-e (encerramento MDF-e quando aplicável) não são intercambiáveis. Contingência/EPEC bloqueados até retorno/reconciliação provados.
- **RTC2026:** fontes oficiais/revisão contábil/efetividade/regime/operação/modelo/XSD íntegro e snapshot da versão. Nunca inventar alíquota/CST/cClassTrib/unidade/prazo ou obrigação pela presença de campos RTC.

## Fontes oficiais consultadas em 2026-10-08

|Fonte|Observado|Gate|
|---|---|---|
|[NF-e NT](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY=)|HTTP200: NT2025.002v1.52, NT2026.007v1.10, .008v1.00, .002v1.11 e .010v1.00 listadas01/10/2026|Comparar PDFs/XSD/efetividade, sem adotar “última” cegamente|
|Manifesto local `fiscal-xml-engine/xsd/manifest.json`|PL_010e_v1.02/NT2025.002v1.40, publicado10/07/2026, hashes pacote/5arquivos|**Gap v1.40→v1.52** documental; conformidade atual não certificada; atualizar só por diff/testes oficiais, preservando runs|
|[NFS-e RTC](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc) e [documentação](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)|HTTP403 direto; pesquisa apontou NT009/010, conteúdo/versões não comprovados diretamente|UNVERIFIED; obter fontes acessíveis e adesão/credenciamento/padrão por município|
|[CT-e NT](https://www.cte.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=Y0nErnoZpsg=)|HTTP200 CT-e NT2026.004v1.00 listada01/10/2026|Revisar MOC/RTC/XSD/elegibilidade57; nenhum adapter habilitado|
|[MDF-e SVRS](https://dfe-portal.svrs.rs.gov.br/Mdfe/Documentos)|HTTP200 MOC3.00b, schemas NT2025.001v1.04 listados25/04/2026; NT2026.00129/05/2026 sobre CIOT|Verificar pacote/eventos/habilitação e condições CIOT; não universalizar obrigação|

Listagem de NT não comprova vigência de cada regra/pacote. Não adotadas afirmações secundárias sobre alíquotas/datas obrigatórias IBS/CBS/Simples, obrigação nacional NFS-e por porte ou CIOT universal. NFC-e/BP-e/CT-eOS não adicionados ao escopo.

## Matriz e cronograma técnico por gates

|Fase|Trabalho/saída antes de avançar|Estado/bloqueador|
|---|---|---|
|FISC-0|Manifesto schema/migrations/RLS/ACL/RPC/Storage/fiscal e diff homolog/canônico, fontes oficiais|Inventário parcial PASS; paridade/acesso homolog e versões NFS-e UNVERIFIED|
|FISC-1|Contrato tenant/estabelecimento/settings/roles/feature/ambiente/certificados/snapshot; mocks positivos/negativos; migration aditiva só com prechecks/rollback/grants restritos|Planejado; multiestabelecimento/proveniência sem prova e emissores DRAFT, sem editar real|
|FISC-2|NF-e55 no motor atual: XSD atualizado, simulação explícita, duas sessões, replay/timeout/reconciliação; homolog oficial só após segurança/pré-requisitos|117locais PASS, autorização oficial NÃO EXECUTADA|
|FISC-3|NFS-e adapter nacional/municipal no pipeline existente, DPS/RPS/XSD/regime/credenciamento/eventos/retorno oficiais; mock primeiro|Contrato/documentação faltantes; NO-GO transporte|
|FISC-4|CT-e57/MDF-e58 somente atividade/habilitação/necessidade; domain/modelo/eventos/XSD/auxiliares|Sem implementação específica; não ampliar CHECK apenas para liberar UI|
|FISC-5|Contingência/eventos/artefatos privados/webhook autenticado+fenced/retry/auditoria; reconciliação de resultado desconhecido|Não certificado; nenhum upload/download/evento real|
|FISC-6|E2E Auth real/RPC/RLS/API/browser/Storage/mobile/concorrência+manifesto/hash/cleanup, por tenant/papel/modelo/ambiente|Sessão/executor/paridade e gates anteriores pendentes, NO-GO integral|

Ordem FISC-0→1→2→3→4(elegíveis)→5→6; leitura/mocks independentes podem continuar com gate operacional fechado. Sem prazo em dias prometido antes de dimensionar acesso, municípios, estabelecimentos e versões. P2–P6 prova origem comercial; FISC prova emissão: completar uma não libera a outra.

Matriz dinâmica a expandir:14papéis existentes × A/P/terceiro comercial × estabelecimento próprio/cruzado/inativo/ambíguo ×4planos e estados reais de assinatura × simulação/homolog/produção negada × modelos elegíveis/não elegíveis × criar/ler/reservar/assinar/enviar/reconciliar/eventos/download/settings. Admin escreve settings conforme policy; financeiro/gestor têm leitura observada, emissão exige contrato RPC real. Demais papéis/superadmin não recebem habilitação inferida. Negar inativo/sem tenant/sem Auth/sem feature/status inválido antes de replay. Todas provas JWT/browser e negativas ambos sentidos **UNVERIFIED** nesta rodada; schema/mocks não viram PASS E2E.

## Evidências, reversão e próximos passos

- **117/117 Vitest em8arquivos PASS19:31UTC:** document_model_contract, h17Readiness, h7f.transporteSefaz, h7b.idempotencia, transportPersistenceSafety, nfeProcClosure, nfeXmlEngine, h14PostAudit. Predominantemente mocks/estrutura: não prova PFX real/SEFAZ/RLS/JWT/corrida. Não somar aos176anteriores.
- Fiscal secrets/integration scanners exit0 e diff-check PASS. Runtime não alterado: lint não reexecutado; amplo anterior3385erros/125avisos permanece histórico. Typecheck manual NOT RUN por proibição ambiental. Build automático observado OK19:30:27UTC após docs iniciais; nenhum build manual.
- SELECT integridade: fiscal_invoices4/MD5`de6a0db798517faa1b9abe7324acbdcb`, partner_orders0/MD5`d41d8cd98f00b204e9800998ecf8427e`, iguais ao checkpoint. Sem DML; não cobre todas tabelas/Storage.
- Nenhuma fixture/transação autenticada criada/executada. Futuras TEMPORARY_AUDIT exigem manifesto IDs/hashes/contagens e BEGIN/ROLLBACK em executor seguro; persistência homolog só após paridade/cleanup exato. Claims SQL não são JWT real.
- Rollback desta rodada é somente revisão documental removendo novas seções, sem tocar checkpoints/containment. Futuras migrations: forward-fix fail-closed, preservar snapshots/protocolos/histórico/ACL; não restaurar corpo inseguro. Nenhum SQL de rollback aplicado.

**Próximo gate concreto:** completar FISC-0/paridade e contrato FISC-1 antes de mudança funcional. Sem transmissão produção/homolog oficial nesta rodada, cobrança, Auth/invites, PFX/senha, publicação ou alteração fiscal real. Tenant P independente pode conceitualmente emitir suas operações, mas nenhum direito/fluxo foi habilitado sem prova.