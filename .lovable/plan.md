# Adequação dos valores e tributos da NFS-e

## Objetivo e limites
Organizar os campos necessários à apuração e à conferência da NFS-e nas telas existentes de Serviços e preparação/revisão de documentos, reutilizando a configuração da Empresa quando cabível.

Não alterar o cadastro fiscal de Produtos, o fluxo de NF-e, descrições de serviços, rotas ou dependências. Não criar outro motor fiscal, emitir notas, publicar ou habilitar produção. As alíquotas da nota de referência não serão padrões universais.

## Evidências confirmadas no código local
- O formulário fiscal de Serviços contempla alíquota de ISS e um indicador booleano de retenção, mas não inclui campos estruturados de PIS/COFINS em seu schema editável.
- A construção do snapshot NFS-e envia alíquota e retenção de ISS. Embora a lista de chaves preveja retenções federais, essa função não as preenche.
- Esses achados não comprovam o contrato ou o cálculo implantado no banco; essa verificação precederá qualquer implementação.

## Fase 1 — Auditoria e contrato dos campos
1. Mapear telas, leituras, gravações, snapshots e cálculo canônico para ISS, PIS/COFINS, descontos, deduções, retenções e líquido.
2. Inspecionar schema, funções e permissões implantados somente após comprovar conexão ao projeto canônico autorizado; sem essa comprovação, interromper a parte dependente do banco. Não utilizar o banco integrado do Lovable Cloud.
3. Conferir os domínios do leiaute nacional aplicável: CST, incidência, retenções e distinção entre valores ausentes e zero.
4. Entregar a matriz campo existente → origem → editável ou calculado → adequação necessária. Não duplicar campos já disponíveis.

## Fase 2 — Adequações propostas, condicionadas à auditoria
### Configuração fiscal de Serviços
- Preservar e esclarecer os campos de ISS: situação tributária, alíquota e responsabilidade pela retenção, usando seleções oficiais quando aplicáveis.
- Estruturar PIS/COFINS com CST, alíquotas e situação de retenção conforme o contrato nacional, sem confundir débito próprio com imposto retido.
- Exibir outros tributos/retencões apenas quando suportados pelo contrato e aplicáveis; não presumir incidência por estarem presentes na interface.
- Manter padrões de cadastro separados dos valores efetivamente resolvidos para cada nota.

### Preparação e revisão da NFS-e
- Organizar a conferência em **Valores da nota**, **ISS**, **Tributos federais**, **Retenções** e **Tributos aproximados**.
- Mostrar bases, alíquotas efetivas, valores apurados, retenções e líquido a partir da resposta do servidor; bases e totais calculados não serão campos de digitação livre.
- Permitir descontos ou deduções somente conforme regras e permissões existentes, com validação no servidor e motivo quando exigido.
- Diferenciar carregamento, erro, não informado e zero; nunca apresentar erro de cálculo como total zerado.
- Informar origem dos valores: cálculo do rascunho ou retorno do documento autorizado, preservando o histórico.

### IBS/CBS e tributos aproximados
- Manter a carga tributária aproximada separada do imposto devido e do líquido.
- Não transformar os R$ 298,50 impressos no DANFSe em redução automática nem reproduzir seu total adicional zerado.
- Exibir IBS/CBS apenas conforme suporte e dados comprovados; ausência não equivale a zero. Implementação tributária nova de IBS/CBS fica fora deste lote.

## Fase 3 — Validação e aceite
- Testar a referência: base R$ 3.902,00; ISS 4% = R$ 156,08; PIS 0,65% = R$ 25,36; COFINS 3% = R$ 117,06; sem retenções, líquido R$ 3.902,00.
- Testar retenções, descontos/deduções permitidos, arredondamento, valores ausentes, zero, negativos, percentuais inválidos e falhas do servidor.
- Confirmar paridade entre cálculo, snapshot e revisão, sem alterar documentos autorizados.
- Executar testes focados e verificação funcional; conferir os resultados automáticos de tipos e compilação, sem declarar aprovação sem evidências.
- Registrar limitações e reversão segura; não declarar aptidão para produção.

## Detalhes técnicos e gates
- Toda leitura do aplicativo deve reutilizar o cliente canônico existente; cálculo e validação financeira permanecem no servidor.
- Preservar snapshots históricos, autorização por perfil/tenant e contratos versionados. Não modificar permissões sem autorização específica.
- Se a auditoria identificar necessidade de alteração de banco, apresentar migration e impacto para autorização específica antes de aplicar; não resolver incompatibilidade apenas ampliando o payload do frontend.
- Executar em fases numeradas: esta aprovação permite iniciar a Fase 1; aguardar prompt específico antes das fases seguintes.