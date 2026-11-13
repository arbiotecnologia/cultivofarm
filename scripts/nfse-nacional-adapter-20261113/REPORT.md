# Adaptador NFS-e Nacional + rascunho canônico pela prestação — 13/11/2026

Estado: implementado localmente, **não publicado**, **migração do ledger não aplicada**, nenhum POST real, nada habilitado no banco.

## Fontes oficiais
- Manual contribuintes Emissor Público Nacional API v1.2 (out/2025): POST /nfse `{dpsXmlGZipB64}`, GET /nfse/{chave}, GET/HEAD /dps/{id}.
- Esquemas `nfse-esquemas_xsd-v1-01-20260209.zip` (SHA-256 e7935cbd…8072), cópia e hashes em `official/`.
- Anexo I v1.01 (regras E0714/E0715/E0717/E0718 de assinatura).

## Implementação
- `_shared/nfse/dps.ts`: DPS **v1.01**; corrigida ordem `tpRetISSQN` → `pAliq` (antes inválida no XSD); regime TCRegTrib por CRT (1→3/regApTribSN, 4→2, 2/3→1, ausente = pendência).
- `_shared/nfse/signDps.ts`: XMLDSig enveloped em `infDPS`, C14N 1.0, RSA-SHA256; recusa A1 de outro CNPJ (OID 2.16.76.1.3.3, E0718), expirado, chave≠certificado.
- `_shared/nfse/sefinContract.ts`: hosts oficiais por ambiente, gzip/base64, parse de sucesso/erros, verificação do XML da NFS-e devolvido (Id NFS+chave, DPS/Id, tpAmb, CNPJ, valor, assinatura presente).
- `_shared/nfse/emitFlow.ts`: um POST por transmissão; ambiguidade (rede, 5xx, E0014/E0015, resposta inválida) → reconciliação via GET /dps → GET /nfse; nunca reenvio.
- `_shared/nfse/dpsFromInvoice.ts`: rascunho canônico → DPS sem inventar dados.
- `nfse-nacional-emit`: prontidão canônica, `NFSE_TRANSMISSION_ENABLED` (padrão desligado), `NFSE_PRODUCTION_ENABLED` + marcador server-side para produção, A1 do emitente vinculado à nota (mTLS com cadeia), ledger service-only; ausência do ledger → `ledger_not_installed`.
- Tela: chave de envio por `draft_version`; mensagens por resultado.
- Migração candidata `migration/20261113170000_nfse_nacional_transmission_ledger.sql`: `nfse_transmissions` (RLS leitura por empresa; escrita só service_role), numeração DPS por empresa/ambiente/série, transições monotônicas, autorização grava `ISSUED` na nota; rejeição mantém rascunho; **não cria recebível**.

## Evidências
| Teste | Resultado |
|---|---|
| `offline.test.ts` (Deno, rede bloqueada) | 19/19; 0 tentativas de rede |
| DPS CRT 1/3/4 assinadas × XSD oficial (cópia com correção de âncora) + digest lxml + OpenSSL | válidas; `evidence/dps-sintetica-crt*.xml` |
| `billing_draft_pg_test.sql` (rpc_service_billing_create_draft_v1 → rpc_fiscal_draft_save reais, gatilhos ativos, ROLLBACK) | 17/17 |
| `ledger_pg_test.sql` (migração candidata, ROLLBACK) | 23/23 |
| vitest services/fiscal/config | 3332 ok, 1 falha preexistente (`cultivofarm-runtime.static`) |
| `deno check nfse-nacional-emit` | sem erros |

Contrato `rpc_fiscal_draft_save` pela prestação: nenhuma inconsistência encontrada (NFSE/HOMOLOGATION/DRAFT, itens SERVICE com snapshots, total 450,00, replay sem duplicata, chave reusada PT409, clientes misturados, sem perfil, outra empresa, gestor e sem sessão negados, sem recebível).

## Defeitos/limites
- **SCHEMA_ANCHOR_DEFECT**: `TSSerieDPS` usa `^0{0,4}\d{1,5}$`; em XSD `^`/`$` são literais, então o XSD oficial intocado rejeita qualquer série no libxml2. Validado com cópia em /tmp alterando só esse padrão; aceitação real pelo Sistema Nacional não comprovada.
- Algoritmo RSA-SHA256 não é fixado pelo Anexo I; aceitação real não comprovada.
- A cadeia ICP-Brasil da assinatura da NFS-e devolvida não é validada (só presença + coerência do conteúdo).
- Respostas oficiais simuladas por fixture; formato real de 201/400 não observado.
- Réplica local: esquema/funções/gatilhos lidos de produção, sem FKs para tabelas fora do esquema e ACLs replicados manualmente; policies de outras tabelas não copiadas; não substitui JWT/RLS/Storage reais.
- Concorrência simultânea entre sessões não exercitada (advisory locks presentes).
- Itens com códigos de tributação divergentes bloqueiam a DPS (uma DPS = um cServ).
- Para operar: aplicar a migração (autorização), configurar NFS-e/credencial da empresa, publicar a Edge e ligar `NFSE_TRANSMISSION_ENABLED` só em homologação.
