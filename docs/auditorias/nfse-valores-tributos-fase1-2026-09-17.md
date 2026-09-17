# NFS-e — valores e tributos, Fase 1

## Resultado
Auditoria local concluída; auditoria implantada e contrato normativo ainda parciais. Sem alteração funcional, acesso ao banco, emissão, publicação ou início da Fase 2.

## Matriz de adequações
| Informação | Evidência local | Situação e adequação |
|---|---|---|
| Alíquota e retenção ISS | `src/lib/fiscal/serviceFiscalValidation.ts:81-94` | Entradas existentes; preservar e validar domínio nacional e responsabilidade pela retenção no servidor. |
| ISS no snapshot | `src/lib/fiscal/rascunhoSnapshots.ts:112-130` | Envia alíquota e indicador de retenção; não comprova cálculo de ISS. |
| PIS/COFINS e outras retenções | `rascunhoSnapshots.ts:40-52,126-130` | Chaves federais previstas, mas não preenchidas pela construção do snapshot NFS-e. Estruturar contrato antes de acrescentar entradas. |
| IBS/CBS no cadastro de Serviços | `src/pages/configuracoes/FiscalServicos.tsx:612` | Já utiliza `IbsCbsItemCard kind="service_profile"`; não criar segundo formulário paralelo. |
| CBS/IBS UF/município, classificação e redução | `src/components/fiscal/IbsCbsItemCard.tsx:110-152,240-274` | Campos RTC existentes; mapear para políticas versionadas e limitar edição conforme autorização. Existência de entrada não comprova cálculo/transmissão. |
| Finalidade, débito/crédito e ajuste NFS-e | `IbsCbsItemCard.tsx:364-416` | Entradas em `additional_fields`, inclusive `vAjusteBC`. Validar domínios oficiais e compatibilidade antes de usar na nota. |
| Cálculo de tributos | `supabase/migrations/20261031000000_h10a_fiscal_draft_apportion_engine_v1.sql:120-140` | Lista de tributos desse helper inclui ICMS, IPI, ST, FCP, DIFAL, PIS e COFINS; não inclui ISS/IBS/CBS. Não assumir que o preview atual calcula os tributos NFS-e só por delegar a uma RPC. |
| Bases, descontos, deduções e líquido | Contrato implantado ainda não inspecionado | Mapear entradas autorizadas e resultados server-side, sem expandir payload apenas no frontend. |

## Conexão e limites de evidência
O cliente local contém o destino canônico autorizado. Isso comprova a configuração do aplicativo, **não** a disponibilidade de acesso administrativo ao schema implantado. O binding gerenciado informado nesta sessão é divergente e proibido; não foi utilizado. Nenhuma leitura de schema, função implantada, grant ou RLS foi executada. Bloqueio: canal de leitura de schema autenticado e comprovado para o destino canônico.

## IBS/CBS — pesquisa e gates normativos
- Cenário solicitado: CBS 0,9% e IBS total 0,1%, com vigência e aplicabilidade a validar antes da implementação.
- Referência legal identificada: LC 214/2025, arts. 343, 346 e 348; o texto pesquisado indica IBS **estadual** de 0,1% em 2026, CBS de 0,9%, reduções/regimes específicos e dispensa condicionada ao cumprimento de obrigações acessórias. Não repartir automaticamente 0,1% entre UF e município, nem aplicar a todos os contribuintes.
- Fonte oficial localizada: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm . A leitura integral direta apresentou timeout; trechos de fontes secundárias não foram promovidos a contrato homologado.
- Documentos oficiais candidatos identificados na pesquisa: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-009-se-cgnfse-v1-0-1.pdf e https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual . Versão aplicável, conteúdo integral, vigência, XSD e checksum ainda não verificados nesta rodada; não declarar homologação nem prazo obrigatório com base apenas no resultado de busca.
- Confirmar no texto oficial as exclusões da base (incluindo ISS/PIS/COFINS quando aplicáveis), CST/cClassTrib/cIndOp, descontos, reduções e regras de totalização. A soma R$ 298,50 no DANFSe não basta para definir a regra.
- Separar destaque, apuração e recolhimento: dispensa de recolhimento não significa omitir campos nem zerar tributos calculados.

## Critérios para próxima fase
1. Concluir leitura do schema canônico e fixar o contrato oficial versionado.
2. Reutilizar RTC e motor existentes, estendendo apenas o suporte comprovadamente necessário para NFS-e; nenhuma segunda tabela fiscal ou motor paralelo.
3. Definir base/tributos/líquido somente no servidor, e transportar resultados imutáveis aos snapshots e à revisão.
4. Preservar ISS/PIS/COFINS da nota histórica e ausência de IBS/CBS; não preencher retroativamente.
5. Validar cenários sintéticos com e sem exclusões, retenções, arredondamento e vigência; não confundir teste aritmético com enquadramento fiscal.

## Validação e status
Somente documentação e acompanhamento alterados. Não foram executados testes funcionais, build, typecheck ou homologação fiscal nesta fase documental; nenhum resultado de aprovação desses gates é alegado. Fase 1 parcial pelos dois bloqueios acima; Fases 2 e 3 não iniciadas e dependem de prompt específico.