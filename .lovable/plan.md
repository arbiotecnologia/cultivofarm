# NF-e e NFS-e: comprovação de implantação e fluxo completo

## Objetivo
Verificar e completar a integração dos campos e tributos, incluindo IBS/CBS e redução de base, desde os cadastros até a autorização e consulta do documento, **exclusivamente em homologação**. Não considerar campos visíveis na tela como prova de implantação ou cálculo correto.

## Situação verificada
- O relatório local da Fase 1 registra pendências de conferência do banco implantado, contrato oficial e integração do cálculo NFS-e.
- A configuração local mantém `fiscalEmissionEnabled=false`.
- O destino informado para o acesso gerenciado não é o banco autorizado; não será utilizado, mesmo se voltar a responder.

## Fase 1 — Confirmar ambiente e contratos
1. Comprovar que cada canal de leitura, alteração e implantação aponta exclusivamente para o projeto canônico autorizado. Sem comprovação, interromper a etapa afetada sem acessar outro banco.
2. Comparar código e implantação real: migrations, funções de cálculo, permissões, políticas, armazenamento, funções de emissão e versões dos contratos. Inspecionar apenas os dados necessários, sem expor segredos.
3. Conferir separadamente NF-e e NFS-e Nacional nas fontes oficiais: leiaute/XSD, vigência, CST/classificação tributária, incidência, retenções, reduções, exclusões de base e totalização.
4. Validar CBS 0,9% e IBS total 0,1% no contexto de 2026, incluindo componente estadual/municipal, exceções e dispensa de recolhimento; nunca transformar essas taxas em padrão universal.
5. Entregar matriz por campo: cadastro → gravação → cálculo → snapshot → revisão → XML → retorno autorizado, identificando o que está comprovado, incompleto ou bloqueado.

## Fase 2 — Completar somente as lacunas comprovadas
- Reutilizar telas, cadastros RTC, políticas e motor fiscal existentes; não criar outro fluxo ou tabela paralela de impostos.
- Para NF-e, conferir tributos aplicáveis, CFOP contextual, reduções e grupos IBS/CBS em todas as etapas.
- Para NFS-e, integrar ISS, PIS/COFINS, retenções e IBS/CBS conforme contrato nacional e provedor, sem reaproveitar indevidamente fórmulas exclusivas de mercadorias.
- Manter cálculo crítico no servidor; distinguir entradas autorizadas de base, imposto e líquido calculados, apresentados somente para leitura.
- Preservar valores ausentes versus zero, histórico, snapshots e XML original; não atribuir IBS/CBS à nota histórica fornecida.
- Proteger contra dupla submissão, processamento parcial e repetição de envio após falha; não simular atomicidade entre banco e provedor.
- Submeter alterações de banco e implantação de funções à autorização específica e somente por ferramentas com destino canônico comprovado. Não alterar permissões, rotas ou dependências sem autorização explícita.

## Fase 3 — Testar ponta a ponta em homologação
Executar dois percursos independentes, um de NF-e e outro de NFS-e:

1. Configurar emitente, destinatário e produto/serviço sintéticos identificados como homologação.
2. Preparar documento, selecionar enquadramento e conferir cálculo server-side.
3. Salvar, reabrir e comparar valores e snapshots com a revisão.
4. Gerar e validar XML no XSD oficial aplicável.
5. Após autorização específica, transmitir somente ao ambiente de homologação; conferir retorno, protocolo e estado persistido.
6. Consultar novamente e recuperar XML/documento auxiliar disponibilizado pelo provedor, comparando valores com os registros autorizados.
7. Exercitar rejeição, timeout, repetição, retorno duplicado, falha de consulta e retomada sem emissão duplicada.

Credenciais, certificado, provedor ou endpoint indisponíveis serão registrados como bloqueios; mocks não comprovarão autorização real. Não remover globalmente a trava de emissão: qualquer habilitação de teste deverá ser restrita e autorizada, mantendo produção bloqueada.

## Detalhes técnicos e validação
- Comparar versões e definições realmente implantadas, não apenas nomes de migrations locais.
- Validar RLS, grants e autorização por perfil/tenant; testar acesso negado sem alterar permissões para facilitar testes.
- Cobrir arredondamento, retenções, descontos, base reduzida, vigência, enquadramento incompatível e dados inválidos.
- Conferir referência histórica: R$ 3.902,00; ISS R$ 156,08; PIS R$ 25,36; COFINS R$ 117,06; líquido R$ 3.902,00, sem inferir IBS/CBS.
- Cenário aritmético isolado, sem exclusões: CBS R$ 35,12 e IBS R$ 3,90; não representa enquadramento legal da nota histórica.
- Executar testes focados e regressões fiscais; conferir resultados automáticos de tipos/compilação e evidências da prévia após alterações.
- Preparar reversão por etapa, preservando dados e histórico; nenhuma publicação do aplicativo ou emissão em produção.

## Entrega e aceite
Relatório separado por NF-e e NFS-e com evidências de implantação, cálculos, XML e homologação, resultados dos testes e pendências com seus bloqueios.

Só classificar um fluxo como **ponta a ponta comprovado em homologação** após autorização real e consulta posterior consistente; validação local ou XML isolado não bastam. Não declarar aptidão para produção.

O trabalho seguirá fases numeradas: a aprovação inicia a Fase 1; as Fases 2 e 3 aguardam prompt específico e as autorizações de alteração/transmissão correspondentes.