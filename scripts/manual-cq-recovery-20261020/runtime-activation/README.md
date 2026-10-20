# Ativação runtime do frontend CQ manual — 2026-10-20
Pacote final 26509be763c2afadf9b05d149704ffc1a2faad08. Copiados byte-exatos 3 candidatos; OSDetalhesDialog difere do candidato só em MANUAL_CQ_REVIEWED=true. Demais gates inalterados; envase/reserva/entrega fechados; monitor 88a872 não ativado.
Pós: CQComparativoTable bdbd8d16…, RegistrarCQDialog b57564bc…, useCQReferencia 97928611…, OSDetalhesDialog 1b98d1a1…, teste RBAC aa4ced5d… (asserção de fonte atualizada para a nova guarda de papel; guarda preservada).
Validação: tsgo app EXIT 0; build OK; 199 testes CQ/lotes sobre bytes runtime (vitest.runtime.config.ts); suíte completa: 15 falhas em 6 arquivos alheios ao CQ, preexistentes (anexos/financeiro/comunicação/visita).
Sem DDL/DML, sessão, recarga ou publicação. Não é homologação UI/JWT real; OS não concluída; PDF não homologado.
Rollback: bash scripts/manual-cq-recovery-20261020/runtime-activation/rollback.sh (bytes exatos, sha256 verificado).
