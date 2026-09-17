# Auditoria de conformidade pós-aplicação — Fiscal H12

Data: 17/09/2026. Escopo: NF-e, NFS-e, IBS/CBS, migrations H11/H12, funções fiscais e integração da preparação. Nenhuma nota foi transmitida e produção permaneceu bloqueada.

## Veredito

**Conforme parcialmente com o planejamento e seguro para continuar a homologação controlada. Não está certificado ponta a ponta e não está apto para produção.**

O canal gerenciado disponível foi identificado como um destino expressamente proibido e não foi usado para consultas ou alterações. O host direto canônico não estava disponível nas variáveis desta sessão. Consequentemente, esta auditoria não afirma o estado remoto das funções, ACLs ou dados além das aplicações previamente registradas e informadas pelo proprietário.

## Conformidades comprovadas

- **Totalização NF-e:** o H12 distingue total comercial e total fiscal, incluindo ST, FCP-ST e IPI, e aceita a comparação com tolerância de um centavo.
- **Transporte seguro:** o estado `SENT` precisa ser persistido antes do POST; falhas posteriores são marcadas para reconciliação, sem afirmar autorização e sem retry automático.
- **Certificado por emitente:** a seleção parte da nota e do CNPJ do emitente, exige vínculo único e falha quando ausente ou ambíguo.
- **Autorização:** o retorno autorizado atualiza o documento de forma idempotente e rejeita chave divergente.
- **NFS-e:** preview e persistência usam RPC própria de serviços dentro da arquitetura fiscal existente; ISS, ISS retido, retenções federais, base e líquido são materializados em snapshots.
- **Separação de modelos:** NFS-e não usa cálculo/preflight/XML de mercadorias; DPS e transmissão nacional permanecem explicitamente bloqueados.
- **IBS/CBS:** não há alíquota universal aplicada. O suporte depende de vigência e XSD validados; com catálogo de leiaute vazio, o caminho falha fechado.
- **Segurança SQL:** as funções H12 `SECURITY DEFINER` fixam `search_path`; RPCs técnicas de certificado, autorização e gravação de retorno estão restritas ao `service_role`.
- **Ambiente:** transmissão real e produção continuam bloqueadas em camadas SQL e TypeScript.

## Correção realizada durante a auditoria

O `fiscal-xml-engine` ainda continha a referência de homologação antiga e não validava a URL canônica antes de construir clientes. A referência foi substituída pelo projeto CultivoFarm canônico e foi adicionada uma guarda fail-closed antes dos clientes. O teste de regressão agora impede o retorno desse destino proibido.

## Pendências que impedem certificação ponta a ponta

1. **Deploy ausente:** `fiscal-xml-engine` e `fiscal-sefaz-transport` responderam HTTP 404 no endpoint canônico. O código corrigido não está comprovadamente implantado.
2. **NF-e protocolada:** o `nfeProc` ainda não é montado nem armazenado; após autorização, a reconciliação permanece pendente até esse artefato existir.
3. **NFS-e nacional:** não há DPS/XML, assinatura, transmissão ou consulta nacional comprovadas; `nationalTransmissionSupported=false` permanece correto.
4. **IBS/CBS:** há bloqueio normativo, mas não há cálculo/totalização/XML habilitados para NF-e ou NFS-e. Abrir somente o gate de leiaute não seria suficiente.
5. **Reabertura NFS-e:** o cálculo salvo mantém o identificador e a versão na sessão do wizard, porém a reabertura completa em nova sessão não foi comprovada por E2E conectado.
6. **ACLs regravadas:** duas funções recriadas (`rpc_fiscal_tax_preview_v1` e `rpc_fiscal_calculate_invoice_v1`) dependem das ACLs preservadas das versões anteriores. Uma futura migration de hardening deve reafirmar explicitamente `REVOKE/GRANT`, após leitura canônica.
7. **Auditoria remota:** o canal gerenciado desta sessão aponta para destino proibido; por fail-closed, RLS, grants, corpos implantados e ledger não foram relidos por ele.

## Evidências executadas

- Suíte fiscal completa: **1.730 testes aprovados, 4 pulados**.
- Regressão crítica pós-correção: **35 testes aprovados**.
- Typecheck: aprovado.
- Lint dos arquivos fiscais alterados: aprovado.
- Build: aprovado.
- Observabilidade local: build atual `OK`, sem erro runtime fiscal registrado.
- Endpoints canônicos: `fiscal-xml-engine` HTTP 404; `fiscal-sefaz-transport` HTTP 404.
- Varredura do fluxo fiscal ativo após a correção: nenhuma referência aos destinos proibidos.

## Decisão

O que foi aplicado está coerente com o plano nas partes de cálculo, snapshot, segurança e bloqueios. A certificação final depende de implantar as duas Edge Functions exclusivamente no projeto canônico, concluir `nfeProc`, implementar o contrato nacional NFS-e e executar os dois E2Es em homologação. Nenhuma dessas pendências deve ser contornada removendo gates ou habilitando produção.