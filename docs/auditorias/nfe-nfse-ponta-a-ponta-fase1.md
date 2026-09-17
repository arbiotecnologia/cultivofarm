# NF-e e NFS-e — verificação ponta a ponta, Fase 1

## Resultado: parcial, não comprovado em homologação
Nenhuma operação no banco gerenciado divergente foi executada. O canal informado nesta sessão aponta para destino proibido; a indisponibilidade de seu pooler não é o motivo para tentar novamente nesse destino. É necessário disponibilizar canal de inspeção comprovadamente ligado ao projeto canônico autorizado. Configuração local do cliente não comprova implantação remota.

## Evidências locais verificadas nesta rodada
| Etapa | NF-e | NFS-e |
|---|---|---|
| Preparação/salvamento | Migration `20261031000000_h10a_fiscal_draft_apportion_engine_v1.sql`, linhas 269 e 303, aceita NFE/PRODUCT | Mesma migration, linhas 269 e 306, aceita NFSE/SERVICE |
| Snapshot de entrada | Contrato deve ser comparado com o servidor implantado | `src/lib/fiscal/rascunhoSnapshots.ts:32-52` inclui classificação de serviço, ISS e chaves de retenção; não inclui IBS/CBS nessas whitelists |
| Cálculo | Migration citada, linhas 678-680, limita esse caminho a NFE | O mesmo caminho rejeita explicitamente documento diferente de NFE com `FISCAL_MODEL_UNSUPPORTED`; não representa cálculo NFS-e implementado |
| XML | `supabase/functions/fiscal-xml-engine/index.ts:25,241` importa e chama `buildNfeXml`; assinatura/verificação usa namespace NF-e | Nenhum builder DPS foi identificado na pasta compartilhada fiscal pesquisada; isso não comprova ausência de integração em todo o sistema ou no provedor |
| IBS/CBS no XML | Pesquisa por IBS/CBS em `buildNfeXml.ts` e na pasta fiscal compartilhada não retornou ocorrências; suporte de XML não comprovado | Suporte de XML não comprovado; existência do cadastro RTC não basta |
| Autorização/consulta | Não executadas | Não executadas |

## Gates pendentes
1. Canal autorizado para leitura do schema, definições de funções, migrations aplicadas, RLS/grants e versões implantadas. Não utilizar conexão alternativa divergente.
2. Contratos oficiais separados NF-e/NFS-e: obter conteúdo integral, vigência, XSD e checksum; confirmar incidência, exclusões, classificação e alíquotas de transição. Pesquisa anterior não equivale a contrato validado.
3. Após resolver 1 e 2, expandir a matriz por campo até retorno autorizado, sem presumir paridade entre código local e implantação.
4. Fase 2 depende de prompt específico e autorizações de alteração; Fase 3 depende de prompt específico, certificado/provedor de homologação e autorização de transmissão.

## Limites
Sem alterações funcionais, banco, implantação ou publicação. Produção permanece fora do escopo. Nenhum teste funcional, autorização fiscal ou aprovação de tipos/compilação é alegado nesta rodada documental. Não é possível certificar fluxo ponta a ponta com as evidências disponíveis.