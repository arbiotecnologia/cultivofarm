# Auditoria sequencial de emissão — NF-e e NFS-e

Data: 17/09/2026. Escopo: código local, contratos SQL versionados e testes isolados; primeiro NF-e, depois NFS-e.

## Conclusão

**Nenhum dos dois percursos está comprovado ponta a ponta em homologação.** A NF-e tem preparação, cálculo, geração/assinatura de XML e transporte implementados em partes, mas há interrupções de integração e defeitos concretos. A NFS-e tem cadastros e rascunhos, sem cálculo definitivo e transporte nacional identificados no caminho auditado. IBS/CBS cadastrados não equivalem a tributos calculados e emitidos.

Não houve alteração funcional, leitura/escrita de banco, transmissão, implantação ou publicação. O canal gerenciado informado aponta para destino proibido: não foi utilizado nem repetido após a falha de conexão. A implantação real, RLS/grants efetivos, certificados disponíveis e autorizações fiscais continuam **não verificados**. Código local não prova estado remoto.

## 1. NF-e

| Prioridade | Achado e impacto | Evidência local |
|---|---|---|
| Alta | **Total do rascunho incompatível com tributos adicionados à nota.** O save soma líquido comercial e encargos; o cálculo adiciona ST/FCP-ST/IPI e rejeita diferença maior que R$ 0,01 antes de atualizar o total. Operações com esses valores podem parar mesmo com entradas corretas. | `supabase/migrations/20261031000000_h10a_fiscal_draft_apportion_engine_v1.sql:486-495,573,812-815,841` |
| Alta | **Falhas de persistência do transporte ignoradas.** A gravação SENT não tem erro verificado; após resposta fiscal, `recorded.error` também não é verificado. Pode haver POST externo mesmo sem confirmação de SENT e HTTP 200 com `SUCCEEDED` embora a gravação final tenha falhado. `authorized` ainda exige outcome, portanto não se afirma falsa autorização automática. | `supabase/functions/fiscal-sefaz-transport/index.ts:375-380,393-423,428-436` |
| Alta | **Transmissão e consulta não fecham o percurso pela tela.** O painel é somente leitura; a chamada encontrada no frontend ao transporte é `action: status`, teste de disponibilidade, não autorização. Não foram identificados comandos de autorizar/consultar recibo na aplicação nem acompanhamento periódico no hook. | `src/components/fiscal/TransporteSefazSecao.tsx:1-6,49-51`; `src/hooks/useFiscalSefazTransmissions.ts:64-74`; `src/hooks/useFiscalHomologationSmokes.ts:47` |
| Alta | **IBS/CBS não implementados no cálculo auditado.** O aplicador rejeita expressamente IBS/CBS/IS; o helper calcula tributos de mercadorias e o builder examinado não serializa grupos IBS/CBS. Não habilitar campos como se produzissem nota válida. | `supabase/migrations/20261032000000_h10b_fiscal_audit_reason_v1.sql:132-133`; `supabase/migrations/20261031000000_h10a_fiscal_draft_apportion_engine_v1.sql:87-186`; `supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts` |
| Alta — compatibilidade | **Contrato de transporte ainda exige marcador de ambiente antigo.** O corpo SQL local compara o marcador com referência não autorizada para este projeto; um marcador canônico correto seria recusado se esse corpo fosse implantado sem adaptação. Não mudar o marcador para satisfazer esse código nem remover a trava de produção. Confirmar definição remota primeiro. | `supabase/migrations/20260926000000_h7g_transporte_evento_sefaz_v1.sql:379-382,644-647` |
| Alta — integração | **Retorno autorizado não fecha documento e artefato final no caminho examinado.** O record atualiza transmissão e reconcilia eventos; não atualiza a nota para autorizada nesse corpo. A Edge guarda resumo do retorno, não o XML integral de protocolo; não foi identificada montagem/persistência de `nfeProc` nesse percurso. Verificar possíveis triggers implantadas antes de concluir ausência remota. | Mesma migration `:799-831`; `fiscal-sefaz-transport/index.ts:393-403`; comentário de escopo em `buildNfeXml.ts:10` |
| Média | **Recuperação após timeout não está fechada.** Mesma chave devolve replay inclusive de falha; nenhuma orquestração de reconciliação/retry foi identificada no frontend. Timeout não prova que a SEFAZ deixou de receber: consultar chave/recibo antes de decidir por nova tentativa; não recomendar simplesmente trocar a chave. | `20260926000000_h7g_transporte_evento_sefaz_v1.sql:698-733`; `fiscal-sefaz-transport/index.ts:366-369,422-436` |
| Média — condicional | **Certificado mTLS sem filtro explícito de empresa.** Seleciona certificado disponível de homologação pela validade. Se houver múltiplos emitentes, pode escolher certificado diferente daquele da nota; unicidade e restrições implantadas não verificadas. | `fiscal-sefaz-transport/index.ts:117-127` |
| Baixa | **Contrato visual incompleto.** SQL pode retornar `SERVICE_INFO`, ausente do tipo e dos rótulos do painel; resposta de consulta de disponibilidade pode ficar sem legenda. O hook aceita resposta sem validação estrutural e o painel converte ausência de `items` em lista vazia. | `20260926000000_h7g_transporte_evento_sefaz_v1.sql:792-794`; `useFiscalSefazTransmissions.ts:18-24,71-72`; `TransporteSefazSecao.tsx:27-34,51` |

### Proteções presentes no código

- Verificação de usuário/perfil fiscal antes do transporte; vínculo de invoice/run/evento conferido no servidor.
- Host SEFAZ de homologação permitido explicitamente; ambiente de produção bloqueado em TS e SQL.
- Fingerprint, lock e replay para idempotência; autorização fiscal distinguida de sucesso HTTP/transporte.
- RPC de gravação do retorno com EXECUTE revogado de PUBLIC/anon/authenticated no contrato local, concedido ao papel técnico.

Essas proteções são evidências locais, não certificação de segurança da implantação. O escopo por empresa/tenant exige conferir políticas e vínculo do operador no banco autorizado.

## 2. NFS-e

| Prioridade | Achado e impacto | Evidência local |
|---|---|---|
| Alta | **Cálculo definitivo recusa NFS-e.** Não basta remover o guard: o corpo seguinte depende de NCM e regras de mercadorias. | `supabase/migrations/20261031000000_h10a_fiscal_draft_apportion_engine_v1.sql:678-680,724-726` |
| Alta | **Preview não tem a mesma proteção por modelo.** Verifica rascunho/permissões, mas encaminha qualquer modelo ao helper de tributos de mercadorias, sem ISS. Dependendo das regras disponíveis pode falhar ou retornar apuração inadequada; não é preview NFS-e válido. Esse comportamento não foi executado no banco. | Mesma migration `:864-954`, especialmente `:890-903,923-930`; helper `:87-186` |
| Alta | **ISS/retenções do cadastro não fecham apuração.** O snapshot do Wizard inclui alíquota e retenção de ISS, mas não preenche as retenções federais previstas na whitelist. O helper canônico examinado não resolve ISS nem o líquido com retenções de serviço. | `src/lib/fiscal/rascunhoSnapshots.ts:32-52,112-130`; helper SQL acima |
| Alta | **IBS/CBS do perfil não chegam ao percurso tributário completo.** Há formulário RTC, mas não foi identificado consumo dessas informações pelo helper auditado; as whitelists do rascunho não incluem os grupos IBS/CBS. Nenhum suporte de cálculo/XML é demonstrado pela presença dos campos. | `src/components/fiscal/IbsCbsItemCard.tsx`; `src/lib/fiscal/rascunhoSnapshots.ts:32-52`; helper SQL acima |
| Alta — lacuna local | **DPS/XML nacional e transmissão/consulta NFS-e não identificados.** Busca nas funções compartilhadas, Edge Functions e migrations encontrou geração/assinatura/transporte NF-e, não integração nacional NFS-e executável. Nomes de provedores em configuração não comprovam adaptador implementado. | `supabase/functions/fiscal-xml-engine/index.ts`; `supabase/functions/_shared/fiscal/nfe/`; `supabase/functions/fiscal-sefaz-transport/index.ts`; `20260721000000_fiscal_fase2_fundacao.sql:39` |

### Matriz de fechamento

| Etapa | NF-e | NFS-e |
|---|---|---|
| Cadastro e rascunho | Presentes localmente | Presentes localmente |
| Cálculo definitivo | Presente com incompatibilidade de total; IBS/CBS bloqueados | Rejeitado pelo motor examinado |
| Preview | Helper de mercadorias | Falta rejeição/dispatch próprio para serviços |
| Snapshot tributário completo | Depende do cálculo; sem IBS/CBS | Não comprovado; retenções/ISS sem fechamento |
| XML e assinatura | Builder NF-e e assinatura presentes | DPS nacional não identificado |
| Transmissão | Edge de homologação presente, sem percurso operacional completo na tela | Transporte nacional não identificado |
| Retorno/documento autorizado | Persistência parcial do transporte; artefato autorizado/conciliação da nota não fechados no caminho lido | Não identificado |
| Autorização real e consulta posterior | Não executadas | Não executadas |

## 3. Validações executadas

**110 testes passaram em 9 arquivos**, sem banco ou transmissão:

- `nfeXmlEngine.test.ts`: 26.
- `h7f.transporteSefaz.test.ts`: 26.
- `fase_h5_a1.draftSave.test.ts`: 4.
- `h7b.idempotencia.test.ts`: 9.
- `h7h.matrizStatusGuard.test.ts`: 14.
- `document_model_contract.test.ts`: 3.
- `bloco5_service_profile_ibs_cbs.test.ts`: 13.
- `h7e.corsAllowlist.static.test.ts`: 6.
- `h7.sefazEndpoints.test.ts`: 9.

São testes puros/contratos estáticos, não execução SQL ou autorização fiscal. O teste de cadastro IBS/CBS não prova cálculo. A suíte de XML testa o builder/validador local; não equivale a homologação do leiaute vigente no autorizador.

Contraprova independente com Decimal: rascunho R$ 100,00 e IPI R$ 5,00 produzem total calculado R$ 105,00; a diferença R$ 5,00 satisfaz a condição de `FISCAL_TOTAL_MISMATCH`. É conferência da condição, não teste integrado da RPC.

Nenhum build/typecheck manual foi executado nesta auditoria documental. Log automático consultado: `build OK`. Nenhuma conclusão de aprovação integral da suíte ou de tipos é feita.

## 4. Ordem recomendada para correção (não executada)

1. Disponibilizar inspeção comprovadamente canônica e comparar corpos/RLS/grants implantados; resolver incompatibilidade de ambiente sem afrouxar proteção.
2. NF-e: corrigir contrato de totais, tratar falhas de persistência e recuperação incerta; fechar autorização/consulta/conciliação e XML protocolado no fluxo existente.
3. NFS-e: bloquear preview inadequado; fechar contrato próprio de serviço, apuração, retenções, snapshot, DPS e integração nacional, preservando arquitetura compartilhada.
4. IBS/CBS: validar leiaute oficial/vigência/contexto e integrar políticas, cálculo e XML por modelo; não aplicar 1% genérico nem reproduzir deduções da nota histórica sem fundamento.
5. Executar dois E2Es independentes em homologação com autorização específica: salvar/reabrir, calcular, validar XML, transmitir, consultar autorização e recuperar documento; testar timeout, rejeição e repetição.

**Não apto para declaração de ponta a ponta ou produção com as evidências desta auditoria.** Correções de código, banco e funções dependem de etapa autorizada; nenhuma trava foi removida.

## 5. Continuidade autorizada — H12

Estado atualizado após conexão direta validada exclusivamente com o projeto canônico `swzpzcwiasxmjutrmvkm`:

- As migrations `fiscal_transport_preview_safety` e `fiscal_canonical_environment_gate` foram aplicadas externamente pelo proprietário e não foram repetidas.
- A migration H12 (`20261035000000_h12_fiscal_totals_certificate_authorization_services.sql`) passou por dry-run revertido e foi aplicada no banco canônico. Ela corrige a totalização NF-e, resolve o certificado pelo emitente da nota, fecha o estado de autorização e cria a apuração NFS-e própria dentro da arquitetura fiscal existente.
- O transporte agora exige persistência `SENT` antes do POST, mantém falhas incertas como reconciliação pendente e seleciona o certificado por `invoice_id`; não há retry automático após timeout/rede.
- A preparação NFS-e ganhou prévia server-side e persistência explícita de ISS, ISS retido, retenções federais e líquido, preservando snapshots e o identificador/versão do rascunho.
- `fiscal_rtc_layout_support` permanece vazio e o gate NFS-e/IBS está falso. IBS 0,1% e CBS 0,9% não são aplicados nem emitidos sem vigência, cenário e leiaute oficial validados.
- Os endpoints canônicos de `fiscal-xml-engine` e `fiscal-sefaz-transport` responderam 404. Sem token de deploy disponível, nenhuma função foi publicada; nenhum destino alternativo foi usado.
- O `nfeProc` ainda não é montado/armazenado, e DPS/XML/transmissão nacional NFS-e continuam bloqueados (`nationalTransmissionSupported=false`).

Validação local: 1.730 testes fiscais aprovados e 4 pulados; typecheck e build aprovados. O lint global continua falhando por dívidas preexistentes fora do módulo fiscal; os arquivos alterados foram validados separadamente. Portanto, o estado permanece **apto apenas à continuação controlada da homologação**, não apto a E2E completo nem a produção.