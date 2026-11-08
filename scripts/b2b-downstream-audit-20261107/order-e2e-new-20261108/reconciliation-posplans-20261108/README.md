# Reconciliação POSPLANOS — bloqueada para captura atual

**Estado: BLOCKED_CURRENT_LIVE_METADATA_REQUIRED. Nenhum pacote de instalação foi gerado.**

O PRE anterior `4f68d404` falhou corretamente em `CONFIRM_PRE_DRIFT`; o auditor não instalou a cadeia de entregas.

## O que foi verificado localmente

- Typecheck: exit 0.
- UI integrada: 21/21; interface candidata: 13/13; compatibilidade OS: 73/73.
- Build automático: OK.
- O ensaio descartável `evidence/posplans-reconciliation-20261108-attempt2/` restaurou a composição histórica, mas a migração canônica completa abortou no próprio PRE por ACLs históricas de tabelas fora deste recorte. Nenhum candidato foi instalado nessa tentativa e nenhum banco hospedado foi acessado.

## Por que uma captura é indispensável

Reaplicar a migração completa do catálogo a um checkpoint que já contém a composição de entregas não é uma forma válida de reconstruir o estado atual. O repositório contém fontes e pins antigos, mas não uma captura integral dos corpos/ACLs atualmente em produção. Trocar esses pins sem evidência seria exatamente a reconciliação cega proibida.

O auditor deve executar `00-current-live-capture.sql.readonly` somente em `swzpzcwiasxmjutrmvkm` e devolver o JSON integral. Ele lê apenas definições, owners, ACLs e triggers das dependências; não retorna registros comerciais nem escreve.

Com essa captura será possível gerar e ensaiar confirmação → envio → físico → logística → leitor/endpoint e rollbacks deny-only, com seis guards, oito ACLs restritas e gates OFF. Até lá, não há PRE/POST/candidato novo aprovado ou pronto para revisão de instalação.
