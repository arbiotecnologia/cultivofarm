# Adequação dos valores e tributos da NFS-e

## Objetivo e limites
Organizar os campos necessários à apuração e à conferência da NFS-e nas telas existentes de Serviços e preparação/revisão de documentos, reutilizando a configuração da Empresa quando cabível.

Não alterar o cadastro fiscal de Produtos, o fluxo de NF-e, descrições de serviços, rotas ou dependências. Não criar outro motor fiscal, emitir notas, publicar ou habilitar produção. As alíquotas da nota de referência não serão padrões universais.

## Evidências confirmadas no código local
- O formulário fiscal de Serviços contempla alíquota de ISS e um indicador booleano de retenção, mas não inclui campos estruturados de PIS/COFINS em seu schema editável.
- A construção do snapshot NFS-e envia alíquota e retenção de ISS. Embora a lista de chaves preveja retenções federais, essa função não as preenche.
- Esses achados não comprovam o contrato ou o cálculo implantado no banco; essa verificação precederá qualquer implementação.

## Fase 1 — Auditoria e contrato dos campos
1. Mapear telas, leituras, gravações, snapshots e cálculo canônico para ISS, PIS/COFINS, IBS/CBS, descontos, deduções, retenções e líquido; identificar e reutilizar o suporte RTC existente antes de propor extensões.
2. Inspecionar schema, funções e permissões implantados somente após comprovar conexão ao projeto canônico autorizado; sem essa comprovação, interromper a parte dependente do banco. Não utilizar o banco integrado do Lovable Cloud.
3. Conferir os domínios do leiaute nacional aplicável: CST, incidência, retenções e distinção entre valores ausentes e zero. Para IBS/CBS, validar em fontes oficiais a vigência de 2026, enquadramento, CST/cClassTrib, composição da base, distribuição do IBS entre UF/município, reduções, dispensa de recolhimento e regras de totalização; registrar versão, fonte e data da norma/leiaute.
4. Entregar a matriz campo existente → origem → editável ou calculado → adequação necessária. Não duplicar campos já disponíveis.

## Fase 2 — Adequações propostas, condicionadas à auditoria
### Configuração fiscal de Serviços
- Preservar e esclarecer os campos de ISS: situação tributária, alíquota e responsabilidade pela retenção, usando seleções oficiais quando aplicáveis.
- Estruturar PIS/COFINS com CST, alíquotas e situação de retenção conforme o contrato nacional, sem confundir débito próprio com imposto retido.
- Exibir outros tributos/retencões apenas quando suportados pelo contrato e aplicáveis; não presumir incidência por estarem presentes na interface.
- Manter padrões de cadastro separados dos valores efetivamente resolvidos para cada nota.

### Preparação e revisão da NFS-e
- Organizar a conferência em **Valores da nota**, **ISS**, **Tributos federais**, **IBS/CBS**, **Retenções** e **Tributos aproximados**.
- Mostrar bases, alíquotas efetivas, valores apurados, retenções e líquido a partir da resposta do servidor; bases e totais calculados não serão campos de digitação livre.
- Permitir descontos ou deduções somente conforme regras e permissões existentes, com validação no servidor e motivo quando exigido.
- Diferenciar carregamento, erro, não informado e zero; nunca apresentar erro de cálculo como total zerado.
- Informar origem dos valores: cálculo do rascunho ou retorno do documento autorizado, preservando o histórico.

### IBS/CBS e tributos aproximados
- Manter a carga tributária aproximada separada do imposto devido e do líquido.
- Não transformar os R$ 298,50 impressos no DANFSe em redução automática nem reproduzir seu total adicional zerado.
- Incluir no escopo o planejamento e a adequação de IBS/CBS, reutilizando o motor, os catálogos e os snapshots canônicos, sem fluxo ou tabela fiscal paralelos.
- Adotar como cenário solicitado **CBS de 0,9% e IBS total de 0,1%**, somando **1% nominal**, condicionado à validação oficial de vigência e aplicabilidade. Não tornar essas alíquotas universais ou permanentes nem duplicar 0,1% nas parcelas estadual e municipal.
- Configurar políticas versionadas por vigência e contexto fiscal; selecionar CST/cClassTrib compatíveis e resolver incidência, base, exclusões legais, alíquotas nominais/efetivas e eventuais reduções no servidor. Não presumir que a base seja igual à do ISS.
- Mostrar base IBS/CBS, CBS, IBS estadual/municipal conforme domínio validado, total IBS e total IBS/CBS, com valores calculados somente leitura. Diferenciar não aplicável, não informado e zero, bem como destaque documental e obrigação de recolhimento.
- Calcular cada tributo com precisão decimal e regra de arredondamento validada; totalizar os valores calculados, sem aplicar 1% de forma agregada quando bases ou tratamentos forem diferentes.
- Derivar líquido e eventual total com IBS/CBS exclusivamente da regra oficial e do contrato do provedor; não somar nem descontar automaticamente o 1% do valor a receber.
- Validar os grupos e totais IBS/CBS no XML nacional contra o leiaute/XSD aplicável antes de permitir seu uso, sem habilitar emissão. Se faltar regra, classificação ou suporte comprovado, bloquear o cálculo/transmissão correspondente com mensagem específica, sem inventar zero.

## Fase 3 — Validação e aceite
- Testar a referência: base R$ 3.902,00; ISS 4% = R$ 156,08; PIS 0,65% = R$ 25,36; COFINS 3% = R$ 117,06; sem retenções, líquido R$ 3.902,00.
- Testar retenções, descontos/deduções permitidos, arredondamento, valores ausentes, zero, negativos, percentuais inválidos e falhas do servidor.
- Acrescentar cenário sintético isolado com base IBS/CBS expressamente definida em R$ 3.902,00, sem reduções: CBS 0,9% = R$ 35,12; IBS total 0,1% = R$ 3,90; soma R$ 39,02. Esse teste aritmético não atribui IBS/CBS à nota histórica nem comprova sua base legal.
- Testar vigência, enquadramentos incompatíveis, repartição do IBS, bases com exclusões legalmente previstas, reduções, arredondamento por tributo, dados ausentes e totais XML; preservar o XML histórico sem IBS/CBS e não preencher valores retroativamente.
- Confirmar paridade entre cálculo, snapshot e revisão, sem alterar documentos autorizados.
- Executar testes focados e verificação funcional; conferir os resultados automáticos de tipos e compilação, sem declarar aprovação sem evidências.
- Registrar limitações e reversão segura; não declarar aptidão para produção.

## Detalhes técnicos e gates
- Toda leitura do aplicativo deve reutilizar o cliente canônico existente; cálculo e validação financeira permanecem no servidor.
- Preservar snapshots históricos, autorização por perfil/tenant e contratos versionados. Não modificar permissões sem autorização específica.
- Se a auditoria identificar necessidade de alteração de banco, apresentar migration e impacto para autorização específica antes de aplicar; não resolver incompatibilidade apenas ampliando o payload do frontend.
- Executar em fases numeradas: esta aprovação permite iniciar a Fase 1; aguardar prompt específico antes das fases seguintes.