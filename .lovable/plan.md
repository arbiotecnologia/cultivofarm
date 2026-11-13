# IBS/CBS ponta a ponta + exceção de envio NFS-e AR (homologação)

## Situação encontrada
- Perfis RTC existem (`useFiscalRtc`, `rtcConfiguration.ts`), mas nem o gerador NF-e 55 (`buildNfeXml.ts`) nem o DPS (`dps.ts`) emitem grupos IBS/CBS hoje.
- `nfse-nacional-emit` bloqueia tudo por `NFSE_TRANSMISSION_ENABLED` (global, desligado). Host de homologação já é fixo e verificado.

## Etapa 1 — Guia Fiscal IBS/CBS (todos os itens)
- Seção IBS/CBS nos editores canônicos já usados pela Guia: produtos (`ProductEditDrawer`), microrganismos comercializáveis (`MicroorganismEditDrawer`) e serviços (`ServiceFiscalEditDrawer`).
- Campos: CST IBS/CBS, cClassTrib (compatível com o CST, validado contra catálogo RTC existente), vigência início/fim, indicador de destino. Alíquotas não são presumidas: ficam vazias até o operador ou o perfil RTC da empresa informar; ausência vira pendência de pré-emissão.
- Persistência em colunas/JSON existentes dos perfis; reabrir sem mudança não grava.

## Etapa 2 — Snapshot por item e XML
- Snapshot IBS/CBS por item ao criar/reaplicar rascunho (mesmo mecanismo CAS já usado).
- NF-e 55: grupo `IBSCBS` por item (base, pIBSUF, pIBSMun, pCBS, valores) e `IBSCBSTot`, interna e interestadual (UF de destino).
- DPS: grupo `IBSCBS` com `cLocalidadeIncid`/local e `cIndOp`; campos declarados separados dos devolvidos pelo autorizador (gravados só a partir da resposta, nunca calculados como "autorizados").
- Divergência entre CST/cClassTrib/vigência/data de emissão bloqueia o XML com pendência.

## Etapa 3 — Exceção segura de envio (somente AR, homologação)
- Nova tabela privada `nfse_homolog_send_allowlist` (organização + emitente, vazia por padrão, sem acesso de cliente; só leitura via função interna).
- `nfse-nacional-emit`: se a trava global estiver desligada, envia apenas quando: organização e emitente da prestação `ed5180f3-…` constam na allowlist; rascunho e emitente em HOMOLOGATION; produção desligada; host exato `sefin.producaorestrita.nfse.gov.br`; `redirect: "manual"` (redirecionamento = falha/reconciliação). Autenticação, A1, readiness, acesso, idempotência e reconciliação permanecem inalterados.
- Flag global não é ligada; nenhum outro tenant liberado.

## Testes
- Vitest: editores (persistir/reabrir/idempotência), compatibilidade CST×cClassTrib, ausência/divergência.
- Deno offline: XML NF-e interno/interestadual e DPS com IBS/CBS fictícios validados no XSD oficial (NF-e PL vigente com RTC; DPS produção restrita 20/10/2026); testes da allowlist (vazia bloqueia, outro tenant bloqueia, produção bloqueia, host divergente/redirect bloqueia).

## Implantação (autorizada, limitada)
- Migração: tabela allowlist + função de checagem (nomes exatos informados no fim) + snapshot IBS/CBS se necessário.
- Inserção pontual da linha AR (organização/emitente lidos da prestação, sem dados novos inventados).
- Deploy apenas de `nfse-nacional-emit`. Frontend não publicado; nenhuma emissão pela minha sessão; sem leitura de segredos.

## Pressupostos a confirmar
- Se o XSD NF-e oficial com grupos RTC não estiver no repositório, baixo o pacote oficial e registro o SHA-256.
- Alíquotas IBS/CBS nos testes são fictícias e marcadas como tal.
