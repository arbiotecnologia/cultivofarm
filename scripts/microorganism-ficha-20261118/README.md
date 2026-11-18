# Ficha de microrganismos — preparação 18/11/2026

**Não publicar ainda. Nenhum SQL, Edge, dado ou aprovação foi aplicado em produção.**

## Implementado
- Catálogo/Microrganismos, Base Técnica e catálogo móvel abrem o mesmo editor; nome clicável e Abrir ficha.
- Seis seções visíveis, área central rolável, salvar/cancelar fixos e confirmação de saída dentro da ficha.
- Campos atuais preservados; cepa, sinônimos, origem, unidade/apresentação, textos de culturas/alvos e pendências documentais em complemento privado candidato. Nenhum preço, dose, aprovação ou fabricação é inferido.
- Editor fiscal existente pode ser embutido, sem novo diálogo; dossiês comerciais usam navegação existente.
- IA envia identidade completa disponível e separa espécie de produto/cepa. Seleção antes da pesquisa, comparação atual/sugestão, fontes por campo, aplicação ao rascunho e salvamento explícito.
- Cancelamento e timeout 90s aposentam geração; respostas antigas não liberam requisição nova. Edição manual não é desabilitada durante pesquisa. Fontes retêm texto aceito e indicam alteração manual posterior.
- Contrato candidato atômico reutiliza root writer, CAS da raiz + perfil, recibo e reautorização; complemento privado não muda dono/IDs. Rollback nega escrita e preserva fontes/histórico.

## Sequência de revisão
1. Comprovar destino canônico `swzpzcwiasxmjutrmvkm` pelo operador; executar somente `01-pre` read-only e arquivar ACL, constraints, triggers e hash dos 27 micros AR Bio. Esta sessão não certificou a contagem 27.
2. Revisar `02-install`: pins reais actor `5e0ce9cc9122f1c21d76e29a13de8b59`, root `7db253bcc2150276ea2bb2f7bd90e471`. Instalação mantém ACL cliente fechada e gate OFF. Não reaplicar pacote antigo documental/mobile.
3. `03-post`, revisão independente em teste autorizado, depois decisão separada `05-release`. Não executar release automaticamente.
4. Montar `service/` dentro de uma única Edge `catalog-documentary-suggestions` somente após autorização. Imports locais/autossuficientes, SDK e modelo existente preservados, configuração revisável separada. Não usar `ai-generate-ficha-campo`, nem service-role. LOVABLE_API_KEY é configuração privada do serviço, nunca código.
5. Testes reais abaixo e somente então publicação pelo root. `04-rollback` é deny-only, nunca apaga fatos ou restaura catálogo global.

## Bloqueios reais / escopo não concluído
- Backend candidato não instalado: salvar ficha completa informa erro e preserva rascunho; serviço documental ausente ainda requer implantação. Não escondemos com botão permanentemente desabilitado nem alegamos prontidão para publicação.
- Sessão `external_unmanaged`: não há JWT restaurável nem teste hospedado autenticado disponível. CLI read-only recusou backend externo; captura de metadados veio da ferramenta de leitura após comprovar ref. Nada foi alterado.
- Captura de receipt sofreu sanitização automática (`[REDACTED]`); não é SQL executável. Harness reconstrói essa dependência a partir do original revisado e declara a costura. Root deve recapturar antes de certificar cadeia integral.
- Relações canônicas culturas/alvos são consultadas, mas seus writers atuais ficam fechados. Textos de uso documentado têm persistência candidata, não substituem vínculos operacionais.
- Documentos regulatórios existentes ficam localizáveis via produtos vinculados e dossiê canônico. Upload/edição de documentos próprios do microrganismo continua contido; **não foi criado um writer regulatório paralelo**. Exige revisão do contrato fiscal/regulatório existente antes de declarar escopo completo.
- Teste de locks/ revogação durante espera, quotas compartilhadas servidor e prova de Storage precisam completar auditoria. URLs retornadas pela busca não demonstram, sozinhas, que o trecho sustenta uma alegação; revisão humana continua obrigatória.

## Roteiro hospedado pendente
Com fixtures exclusivamente no teste autorizado: Admin/Gestor A salvar/reabrir identificação, conteúdo e fontes; leitor técnico sem salvar/IA; Financeiro apenas fiscal conforme regra existente; B2B e Superadmin sem CRUD. B outro tenant deve receber negação direta nos três RPCs. Repetir JWT antigo após revogação e espera de lock; CAS raiz/perfil conflitante não altera complemento. Cancelar pesquisa, editar texto manual, trocar empresa A→B→A, devolver resposta antiga e repetir após falha. Testar fiscal embutido, documentos, logout e desktop 1280/mobile390. PRE/POST preservar contagem e hash de identidades; nenhuma aprovação real.

A instalação inicial é transacional e aborta se já instalada, exigindo POST/revisão em vez de reaplicar. Ainda não certificada como instalador idempotente completo nem como cadeia de locks integral.


## Revisão root — continuação 18/11, 02:11 UTC

Esta revisão supersede as lacunas locais da versão be1b6c238, **não** comprova instalação hosted.
- Global/leitor: consulta RLS canônica de raiz/perfil, sem encaminhar global ao reader próprio; complemento usa read_prefs + can_view_catalog_internal, nunca mutate. Dupla comparação das revisões impede hidratação rasgada. Schema, parent e tenant são verificados antes da adoção.
- Concentração: edição quantitativa usa exclusivamente concentracao_ufc_ml (numeric existente / UFC/mL). Label é documento textual separado. Não criar unidades nem migrar/converter valores antigos. Removido campo livre de unidade do novo candidato.
- Culturas/alvos/fontes: novo editor inline prepara alterações no rascunho; mesma chamada Salvar ficha grava nas tabelas canônicas existentes. Child parent/discriminator imutáveis, CAS, referências e campos fechados; sem delete histórico ou DML cliente. Fontes aceitas de IA continuam evidências por conteúdo, não substituem vínculos.
- Evidências selecionadas agora filtram candidate_key mesmo quando valores são idênticos. Save bloqueia geração/aplicação; edição manual durante geração continua disponível. Scope/unmount e cache actor são cercados.
- Edge: binding obrigatório CATALOG_DOCUMENTARY_PROJECT_REF, allowlist somente produção/HML; URL deve ser exatamente a do ref escolhido. Corpo <=24.000 bytes realmente lido, prazo 75s incluindo Auth/RPC/provedor. Quota transacional candidata por tenant: 2 pesquisas simultâneas, 10/h, lease80s; defaults técnicos revisáveis, não política comercial. Finalização não devolve quota.
- `capture-readonly.py`: root fornece CAPTURE_REF/CAPTURE_DSN localmente; não lista Auth/Vault/dados de negócio. `assemble.py captura.json /tmp/release`: sem conexão, exige cadeia/base exata e capture não sanitizada; não repina divergência HML. Gera PRE/install/POST/release/rollback por ref. Rerun exato não reabre rollback/release; drift aborta.
- `hosted-auth-qa.py`: HML-only, JWTs authenticated do root e manifesto privado sintético. Criação/replay/leitor/cross-tenant e Edge real opcional executáveis sem service-role; não depende de sessão do browser. Sem execução hosted nesta rodada.

### Dependências ambientais e bloqueios exatos
1. Nomes disponíveis nesta sessão: LOVABLE_API_KEY (managed), STAGING_REF, STAGING_DSN; demais nomes: FISCAL_CERTIFICATE_MASTER_KEY, FISCAL_CORS_ALLOWLIST, INTERNAL_FUNCTION_SECRET. Nenhum valor consultado/exposto. Binding disponibilizado em STAGING_REF/DSN **não corresponde** a vrlcdwmlytukrjezrrnf: falhou fechado antes de conexão. Root deve fornecer CAPTURE_REF/DSN corretos; isso não exige nova aprovação da tarefa. Disponibilidade de LOVABLE_API_KEY **na HML** ainda não verificada.
2. Produção: actor/root pins reconfirmados read-only; 27 micros/27 perfis ativos/27 PENDING_ACCOUNTING são verificação independente reportada pelo root, não leitura de dados desta rodada. Capturas child/config/triggers estão em capture/production-*.txt. Receipt permanece sanitizado pela ferramenta; capture-readonly local é caminho de recaptura integral. Nenhum SQL/Edge/dado produção alterado.
3. HML: catálogo real ainda não capturado nesta sessão; **não há pins HML inventados**, nem transplante automático da fundação. Assemble nega funções/config ausentes ou divergentes. Dependência mínima exata só pode ser fechada com captura HML; pacote completo ainda não certificado instalável nesse ambiente.
4. Documentos regulatórios de produto: contratos/upload/readers existentes confirmados por catálogo, reutilizados pela navegação embutida. Documentos exclusivos de microrganismo sem produto continuam sem contrato canônico autorizado; não abrir dossiê legado nem criar armazenamento paralelo. Essa lacuna está ABERTA, não resolvida por fontes URL/texto. Storage/hosted E2E ainda pendentes.
5. Prova descartável contém actor/root reais, receipt reconstruído original revisado e triggers reais de identidade/versão/auditoria capturados. Auth, entitlements e schemas/precificação restantes são costuras sintéticas declaradas; não chamar cadeia integral real nem JWT/RLS hosted. Quota/concentração/atomicidade/revogação/replay foram executados localmente.

### Manifesto/execução Auth HML
Arquivo privado MICRO_QA_MANIFEST exige ref, synthetic:true, release_reviewed:true, org_a, micro_name/micro_code exclusivos e create_key UUID estável. MICRO_QA_STATE deve apontar arquivo privado local; HML_ANON_KEY e QA_MICRO_EDITOR_A/QA_MICRO_READER_A/QA_MICRO_EDITOR_B ficam no ambiente do auditor. RUN_REAL_DOCUMENTARY=yes opta por pesquisa real (pode consumir créditos). Reusar fixtures Auth já existentes quando autorizadas; nenhum provisionamento automático. Cleanup exato requer revisão do root e preservação dos recibos/auditoria conforme política de HML; não há cleanup destrutivo improvisado.
