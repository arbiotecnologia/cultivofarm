# Correção visual da fase CQ no detalhe da OS (separada do monitor v2)
- Arquivo runtime: src/components/ordens-servico/OSDetalhesDialog.tsx  pre 1b98d1a184770c5d9bd9aa17811444f500c63e395e8d85d107a2a1c76c2a392d (ativação CQ 1e0) -> post 7d844076c89a543bce0f22cd39e4e7bfb6bda421ff5ea683befc2d0ac6a9d32c
- Teste novo: src/test/ordens-servico/cq-phase-trace.test.tsx (e2020462…8dc8)
- Badge usa status_os do trace fresco da mesma OS; sem trace, preserva fallback aprovada/programada/os.status.
- Enviar: status_os=programada e esteira programada/em_producao. Registrar: status_os=em_cq e esteira aguardando_cq/em_cq.
  cq_aprovado/cq_reprovado e etapas posteriores: nenhuma ação (sem reanálise). Writer/gates/core inalterados.
- Cockpit consulta continua consultivo; CQ opera somente pelo detalhe canônico da OS. Sem fluxo paralelo.
- Preservados: monitor v2 useAuth ace8f12d…; RegistrarCQDialog b57564bc…, CQComparativoTable bdbd8d16…, useCQReferencia 97928611…; SQL intocado.
- Rollback: cp rollback/OSDetalhesDialog.tsx.review src/components/ordens-servico/OSDetalhesDialog.tsx (somente se runtime = post) e remover o teste novo.
- Sem DDL/DML, sessões, reload ou publicação.
