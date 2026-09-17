# N0 — NFS-e Nacional: XML × sistema atual

Data: 2026-09-17. Escopo: documentos fornecidos e código local, somente leitura funcional. Nenhum banco acessado, nenhuma emissão, publicação, migration ou alteração funcional. N1 não iniciada.

**N0 parcial:** a matriz registra evidências locais; não certifica schema implantado, RLS efetiva, execução de RPC, integração ou homologação. O canal gerenciado informado aponta a destino proibido; não foi utilizado. Conferência do schema depende de acesso comprovado ao projeto canônico.

## Referência e achados
- XML NFSe/DPS versão 1.01; namespace `http://www.sped.fazenda.gov.br/nfse`.
- SHA-256 XML: `f8dbd75fd2e09d03f8318b6ce08b652e7220348f1784ea37f73328512ee21f65`.
- SHA-256 DANFSe: `d4b83ffb2ee0f199338707c5056bd15caa089844efde74809574a2c1d2b27a8e`.
- XML original permanece no upload: não copiar CPF, contatos, assinatura ou certificado para fixtures públicas/repositório. Fixture automatizada futura deverá ser sanitizada, sem alegar assinatura válida.
- `tpAmb=1`: referência de produção, não instrução para alterar o ambiente do app. `ambGer=2` não substitui `tpAmb`.
- ISS: 3902 × 4% = 156,08; PIS: 3902 × 0,65% = 25,36; COFINS: 3902 × 3% = 117,06. Conferência independente com Decimal/ROUND_HALF_UP: 3/3. Não constitui teste do motor atual.
- Descrição narra 1.150 + 640 + 640 + 1.472 + 1.472 = **5.374**, divergente de `vServ=3.902`. Há repetição textual e 46 × 16 = **736**, não 1.472. Não corrigir o XML histórico nem derivar a base da narrativa.
- Descrição possui **627 caracteres**; perfil de serviço e item do Wizard limitam a 500 (`serviceFiscalValidation.ts:67-70`, `rascunhoWizardValidation.ts:45`). O default da empresa permite 2000: incompatibilidade local comprovada.
- DANFSe exibe exclusões/reduções de 298,50 sem campo correspondente no XML. A soma ISS+PIS+COFINS também é 298,50; isso é apenas coincidência aritmética observada, não prova de regra/base IBS/CBS. Não inventar redução.
- Nenhum grupo IBS/CBS encontrado no XML. Preservar RTC existente; não afirmar transmissão.
- Contatos de `emit` e `prest` divergem; não criar cadastros duplicados. Tomador não contém endereço: não inventar.
- Assinatura presente; autenticidade criptográfica, cadeia e XSD não verificados. `cStat=100` é conteúdo do arquivo, não consulta ao ambiente nacional.

## Matriz
Prefixos: D=`/NFSe/infNFSe/DPS/infDPS`; R=`/NFSe/infNFSe`. Status EXISTE significa campo local encontrado, não transmissão validada. Obrigatoriedade abaixo é do cenário observado; contrato normativo depende do XSD oficial pinado. Dados pessoais deliberadamente omitidos.

| XML path / campo técnico | Descrição / valor referência | Origem local / tabela.campo | Tela | Cenário | Status e lacuna |
|---|---|---|---|---|---|
| D/tpAmb | Ambiente: 1 | fiscal_invoices.environment | Wizard | Presente | PARCIAL: origem existe; mapear servidor, manter homologação |
| D/dhEmi | Emissão: 2026-09-09T11:48:26-03:00 | fiscal_invoices.issue_date | Wizard | Presente | PARCIAL: validar fuso e serialização |
| D/serie | Série DPS: 70000 | fiscal_invoices.series; configuração nfse.series/rps_series | Empresa/Wizard | Presente | PARCIAL: sem identidade DPS explícita |
| D/nDPS | Número DPS: 21 | Sem campo específico encontrado | Documento | Presente | AUSENTE; não reutilizar invoice_number |
| D/dCompet | Competência: 2026-09-09 | Sem campo específico encontrado | Wizard | Presente | AUSENTE; separar issue_date |
| D/tpEmit | Tipo emitente: 1 | Derivação do emissor a definir | Não editável comum | Presente | GERADO PELO BACKEND: contrato não implementado comprovadamente |
| D/cLocEmi | Município emissão: 3147006 | company_fiscal_settings / endereço e nfse_configuration.municipality_ibge_code | Empresa | Presente | PARCIAL: origem disponível; mapping DPS pendente |
| D/prest/CNPJ; fone; email | Prestador e contatos: omitidos | company_fiscal_settings.cnpj/phone/email | Empresa | Presentes; contatos conforme cenário | EXISTE como cadastro; validar snapshot e mapping |
| D/prest/regTrib/opSimpNac | Simples: 1, não optante no DANFSe | company_fiscal_settings.tax_regime/crt | Empresa | Presente | PARCIAL: derivação server-side não comprovada |
| D/prest/regTrib/regEspTrib | Regime especial: 0 | nfse_configuration.special_taxation_regime | Empresa | Presente | PARCIAL: texto livre versus domínio oficial |
| D/toma/CPF ou CNPJ; xNome; email | Tomador: omitido | clientes → fiscal_invoices.customer_snapshot | Clientes/Wizard | CPF presente; CNPJ alternativo | EXISTE origem; completude snapshot não certificada |
| D/toma/IM | Inscrição municipal: omitida | customer_fiscal_profiles.municipal_registration | Clientes | Presente neste cenário | EXISTE origem; mapping a validar |
| D/toma/end | Endereço não enviado | clientes / customer_snapshot | Clientes | Ausente na referência | PARCIAL: suportar quando disponível, sem inventar |
| D/serv/locPrest/cLocPrestacao | Local prestação: 3147006 | Sem campo documental distinto encontrado | Wizard | Presente | AUSENTE: não confundir com incidência |
| D/serv/cServ/cTribNac | Tributação nacional: 020101 | service_fiscal_profiles.national_taxation_code | Serviços/Empresa | Presente | PARCIAL: hook lê; buildNfseSnapshots não transporta |
| D/serv/cServ/xDescServ | Descrição: 627 caracteres | service_fiscal_profiles.fiscal_description_template; fiscal_invoice_items.description | Serviços/Wizard | Presente | PARCIAL: limite atual 500 impede referência integral |
| D/serv/cServ/cNBS | NBS: 112012000 | Sem campo/catálogo identificado | Serviços | Presente neste cenário | AUSENTE |
| D/valores/vServPrest/vServ | Serviço: 3902.00 | fiscal_invoice_items e fiscal_totals_snapshot | Wizard | Presente | PARCIAL: composição DPS e cálculo NFS-e não certificados |
| D/valores/trib/tribMun/tribISSQN | Tributação ISS: 1 | Sem domínio técnico explícito encontrado | Serviços/Wizard | Presente | AUSENTE |
| D/valores/trib/tribMun/tpRetISSQN | Retenção ISS: 1, não retido | service_fiscal_profiles.iss_withheld_default; tax_snapshot.iss_withheld | Serviços/Wizard | Presente | PARCIAL: booleano não representa domínio completo |
| D/valores/trib/tribFed/piscofins/CST | CST conjunto: 01 | service_fiscal_profiles.federal_withholding_defaults | Serviços | Presente | PARCIAL: JSON genérico; falta contrato e UI |
| D/valores/trib/tribFed/piscofins/vBCPisCofins | Base federal: 3902.00 | tax_snapshot: saída calculada a confirmar | Revisão, não configuração | Presente | GERADO PELO BACKEND: suporte não comprovado |
| D/valores/trib/tribFed/piscofins/pAliqPis; pAliqCofins | Alíquotas: 0.65; 3.00 | federal_withholding_defaults / regra fiscal | Serviços | Presentes | PARCIAL: sem contrato NFS-e estruturado no fluxo |
| D/valores/trib/tribFed/piscofins/vPis; vCofins | Valores: 25.36; 117.06 | tax_snapshot: saída calculada | Revisão | Presentes | GERADO PELO BACKEND: paridade motor não testada |
| D/valores/trib/tribFed/piscofins/tpRetPisCofins | Retenção conjunta: 0 | federal_withholding_defaults | Serviços | Presente | PARCIAL: não inferir retenção da existência do tributo |
| D/valores/trib/totTrib/pTotTrib/pTotTribFed; pTotTribEst; pTotTribMun | Carga aproximada: 13.45; 0.00; 2.16 | Sem fonte/versionamento explícito encontrado | Serviços | Presentes nesta referência | AUSENTE: não usar como imposto devido/default universal |
| R/nNFSe | Número autorizado: 23 | fiscal_invoices.invoice_number | Documento somente leitura | Resultado | RETORNADO PELO PROVEDOR; não confundir com DPS |
| R/@Id | Chave: omitida | fiscal_invoices.access_key | Documento somente leitura | Resultado | RETORNADO PELO PROVEDOR |
| R/cStat | Status: 100 | provider_status_raw/status: mapping a confirmar | Documento somente leitura | Resultado | RETORNADO PELO PROVEDOR |
| R/dhProc | Processamento: 2026-09-09T11:48:26-03:00 | authorized_at: semântica/mapping a confirmar | Documento somente leitura | Resultado | RETORNADO PELO PROVEDOR |
| R/nDFSe | DFSe: 394857 | Sem campo específico comprovado; preservar retorno/XML | Documento somente leitura | Resultado | RETORNADO PELO PROVEDOR; não sobrecarregar provider_reference |
| R/cLocIncid | Incidência: 3147006 | service_fiscal_profiles.incidence_municipality_ibge_code | Serviços | Resultado/regra | PARCIAL: previsto mas não transportado pelo snapshot atual |
| R/valores/vBC; pAliqAplic; vISSQN; vLiq | Base 3902.00; 4%; ISS 156.08; líquido 3902.00 | fiscal_totals_snapshot/tax_snapshot; retorno original | Revisão/Documento | Resultado | RETORNADO PELO PROVEDOR: reconciliar com cálculo, não editar |
| R/verAplic; ambGer; Signature | Aplicação; 2; assinatura omitida | XML original/retorno do provedor | Não editável | Resultado | RETORNADO PELO PROVEDOR; não usar ambGer como tpAmb |

## Evidências locais e responsabilidades preservadas
- `src/lib/fiscal/rascunhoSnapshots.ts:32-44,112-130`: whitelist NFSE sem NBS, tratamento ISS e tributos aproximados; código nacional/município previstos mas não materializados. Retenções previstas não são preenchidas.
- `src/hooks/useFiscalServicosLite.ts:17-20,34,52-55`: consulta código nacional, incidência e ISS; a existência no hook não garante snapshot.
- `src/lib/fiscal/serviceFiscalValidation.ts:65-96`: campos atuais e limites; tipos de row/insert/update são `any` (26-28), enfraquecendo detecção de drift.
- `src/lib/fiscal/companyFiscalValidation.ts:162-185`: configuração NFS-e existente; preservar defaults sem duplicar cadastro nem usar passthrough como contrato fiscal validado.
- `src/components/fiscal/documentos/RascunhoWizard.tsx`: preservar fluxo; não criar rota paralela.
- Arquitetura local mantém `company_fiscal_settings`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `fiscal_invoices`, `fiscal_invoice_items`, snapshots, catálogos e motor canônico. Migrations locais não comprovam implantação.
- Não foi identificado builder DPS Nacional equivalente ao builder NF-e; não reutilizar builder NF-e nem montar XML de estado React.

## Gates antes de N1 e implementação
1. Inspecionar schema, RPCs e políticas efetivos somente por conexão comprovada ao projeto canônico; conferir ledger sem replay automático.
2. Fechar contrato versionado e oficial, XSD 1.01/checksum, domínios de ambiente, retenções e regime; definir obrigatoriedade normativa.
3. Manter NFS-e recebida como referência histórica, nunca reenviar como homologação ou modificar assinatura.
4. Resolver discrepância de descrição com responsável fiscal; não bloquear o estudo dos valores estruturados corretos.
5. Executar apenas fase seguinte mediante prompt específico. N0 não representa aceite de produção.

## Validação e alterações
Somente este relatório e roadmap; nenhum código funcional, tabela, RPC, política ou catálogo alterado. XML analisado localmente com entidades externas desabilitadas, PDF extraído com a ferramenta documental (orientação da skill PDF). Nenhum PDF gerado. Não rodados Vitest, typecheck, build ou E2E: não há mudança funcional e não há alegação de aprovação desses gates. Rollback documental: remover apenas o relatório e a seção N0 se necessário.
