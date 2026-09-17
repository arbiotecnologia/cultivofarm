# Correção da emissão NF-e e NFS-e

## Objetivo e limites
Corrigir as falhas auditadas no fluxo existente, primeiro NF-e, depois NFS-e, sem motor paralelo e sem habilitar produção. A autorização de conexão e correções foi recebida; transmissão real continuará restrita à homologação e à autorização específica da etapa.

## 1. Conexão e confirmação da implantação
- Usar exclusivamente o projeto Cultivo Farm autorizado (`swzpzcwiasxmjutrmvkm`). Não utilizar nem reconfigurar o banco interno do Lovable Cloud como substituto.
- **Bloqueio confirmado nesta sessão:** as variáveis de conexão disponíveis não comprovam o destino canônico; não há conexão externa de banco listada nem token de administração canônico disponível.
- Disponibilizar um canal administrativo comprovadamente canônico antes de inspecionar o banco. A autorização não substitui credenciais nem muda o destino das ferramentas.
- Comparar funções, migrations, permissões, políticas, certificados e funções implantadas com o código auditado, inicialmente somente leitura.

## 2. NF-e: corrigir falhas comprovadas
- Ajustar a totalização no servidor para incluir corretamente IPI/ST/FCP-ST, sem eliminar validações de consistência.
- Impedir envio quando a gravação prévia falhar; tratar falhas após envio como resultado pendente de conciliação, nunca como sucesso confirmado.
- Vincular certificado ao emitente e preservar isolamento por empresa, permissões e bloqueio de produção.
- Completar autorização, consulta, atualização da nota e armazenamento do XML protocolado no percurso existente.
- Consultar chave/recibo após timeout antes de qualquer reenvio; preservar idempotência e histórico.
- Validar respostas do painel e apresentar corretamente disponibilidade, ausência de dados e falhas.

## 3. NFS-e: contrato próprio e percurso integrado
- Bloquear o preview inadequado de mercadorias enquanto não houver cálculo próprio de serviços.
- Validar contrato oficial nacional e do provedor, versões, vigência e XSD antes de implementar DPS e transmissão.
- Integrar ISS, PIS/COFINS, retenções e líquido no servidor, snapshots, revisão, XML, retorno e consulta, reutilizando a arquitetura existente.

## 4. IBS/CBS por modelo
- Integrar cadastro, política, cálculo, snapshot e XML separadamente para NF-e e NFS-e.
- Validar CBS 0,9% e IBS estadual 0,1% para os contextos aplicáveis de 2026; não usar 1% universal ou duplicar a parcela municipal.
- Respeitar CST/cClassTrib, base, exclusões legais, reduções, dispensa e totalização conforme contrato oficial verificado.
- Manter bloqueio explícito quando faltar regra comprovada; preservar documentos históricos sem preenchimento retroativo.

## 5. Validação e entrega
- Testes focados de totais, retenções, arredondamento, permissões, persistência, timeout e duplicidade; verificação na prévia e diagnósticos automáticos de compilação/tipos disponíveis.
- Dois percursos independentes em homologação: salvar/reabrir, calcular, validar XML, transmitir quando autorizado, consultar e recuperar XML autorizado.
- Se credenciais, certificado, provedor ou leiaute impedirem a etapa, registrar o bloqueio sem alegar autorização real.
- Relatório separado por modelo e fase; aguardar prompt específico antes de avançar à próxima fase.

## Detalhes técnicos e reversão
- Alterações de esquema somente por migration versionada na ferramenta de migrations, após comprovação do destino canônico; se a ferramenta continuar vinculada ao destino proibido, não aplicar nem contornar por SQL direto.
- Preservar RLS, grants mínimos, validações server-side e snapshots imutáveis; não alterar migrations históricas.
- Implantação de funções apenas no destino autorizado, mantendo emissão desativada até os gates de homologação.
- Reversão por etapa, sem apagar histórico nem reverter artificialmente autorizações fiscais externas.

**Critério final:** testes locais não comprovam emissão ponta a ponta; somente autorização real seguida de consulta consistente comprova homologação, nunca aptidão automática para produção.