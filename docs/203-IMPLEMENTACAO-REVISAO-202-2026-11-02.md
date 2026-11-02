# 203 — Implementação da revisão 202

Data: 02/11/2026. Base: `0f52839`; implementação local concluída, com ressalvas de aceite abaixo. Este documento distingue implementação local de publicação. Versões publicadas de referência continuam API 0.13.1, web 1.14.1 e agente 0.5.26. **Esta rodada não publicou mudanças no controlador.**

## Escopo e contratos

Implementar os achados do relatório 202 e preservar a reorganização 201. Oito firewalls persistentemente degradados, cálculo de saúde, HA/CARP, Zabbix e Theo excluídos. Nenhum comando de appliance nesta etapa.

- Usuários/escopos/sessões/auditoria passam a compartilhar a transação; trava comum protege o último superadministrador. Redefinição administrativa de senha encerra sessões e desafios de login antigos.
- Comando de instalação exige `bootstrap.execute`, com conferência de escopo, auditoria antes da resposta e `no-store`. `bootstrap.view` mantém consulta da página sem receber credencial. Nenhum segredo entra no texto de evidência. Overrides devem usar HTTPS e raízes configuradas pelo servidor.
- Instalação filtra estados antes de paginar; instalação registrada não é rotulada como contato online.
- Backups recebem resumo e página em uma única resposta/snapshot, sem buscar todas as páginas do inventário. O classificador existente permanece autoridade. A implementação ainda tem custo O(N) por consulta e ordenação em memória: benchmark SQL real permanece necessário.
- Clientes têm consulta própria sob `clients.view`, com busca/paginação e inativos acessíveis a quem tem escopo global. Admin restrito continua respeitando a política de escopo existente. Alterações pendentes exigem atenção antes de navegar.
- Usuários e sessões administrativas recebem busca/cursor/limite; sessões próprias filtram e paginam no banco. A interface conserva o contexto da navegação. Edição de identidade não reenvia automaticamente vínculos históricos.
- JSON vazio só é normalizado após leitura real de zero bytes; corpo chunked preservado. Login de senha recebe orçamento compartilhado em PostgreSQL por IP e par conta/IP, sem bloqueio global de uma conta por outro IP.
- A emissão de sessão/desafio de login revalida o estado da conta sob a mesma trava da redefinição administrativa: uma senha verificada antes de um reset não pode emitir uma sessão depois dele. A autenticação MFA também participa dessa proteção.

## Mapeamento dos 20 achados

| Achados | Alteração entregue no código | Prova e limite |
|---|---|---|
| 01, 03, 04 | Transações administrativas, trava de último superadmin e revogação idempotente auditada | Sintéticos + concorrência/rollback em PG17 real |
| 02, 06, 07 | `bootstrap.execute`, resposta sem cache, auditoria, origens HTTPS aprovadas e evidência sem segredo | Helpers/contratos/renderizações aprovados; mapa dos papéis existentes ainda precisa conferência antes da publicação |
| 05, 14, 15, 20 | Consulta própria de clientes, paginação, inativos/reativação e proteção de rascunho; contagem sem varrer inventário | Testes dirigidos e navegação sintética; escrita end-to-end com autenticação real não exercitada no navegador |
| 08 | Parser preserva bytes reais antes de decidir se o corpo é vazio | HTTP chunked real, Unicode, vazio e HMAC aprovados |
| 09, 10 | Bucket antes de paginar, resumo global sob escopo e rótulo instalado | Casos dirigidos incluindo frota acima de mil |
| 11 | Endpoint específico de frota de backup, página + resumo no mesmo snapshot | Funcional sintético 1.105/5.105; benchmark SQL/P95 ainda aberto |
| 12, 13 | Paginação/busca de usuários e sessões administrativas; sessões próprias filtradas no banco | PG17: 1.105 usuários, 205 sessões administrativas, histórico próprio e isolamento |
| 16, 19 | Preservação de vínculos históricos, edição por campo alterado, aba/seleção na URL e cancelamento | Casos dirigidos e navegador sintético desktop/mobile |
| 17 | Limiter compartilhado entre réplicas, orçamento IP + conta/IP, falha fechada | PG17 real aprovado; confiança de proxy/IP real e política de borda em produção ainda não conferidas |
| 18 | Reset administrativo revoga sessões/desafios e impede emissão concorrente com credencial anterior | PG17 cobre sessão de senha, desafio e conclusão MFA contra reset |

“Código entregue” não significa aceite integral de produção para os vinte itens. Os limites acima e a nova revisão 204 permanecem explícitos.

## Migration e publicação

Migration nova: `20261102110000_password_login_rate_limit`. Não foi aplicada em produção nesta etapa. A imagem da API usa `prisma migrate deploy` antes de iniciar: publicar exige validar a migration e o limiter no PostgreSQL de QA primeiro. Backend e web precisam ser entregues de forma coordenada porque a web usa endpoints/paginação novos.

As mudanças locais não significam que o painel publicado já mudou. Publicação, versão, commit/push/pull e novo conjunto DR serão registrados somente quando executados e verificados.

## Evidências por grupo

- Clientes: 3 casos sintéticos aprovados; 2 passaram na primeira rodada e o caso restante foi repetido após corrigir a chave de metadado no teste, sem alteração da fonte. A revisão final encontrou uma restrição extra por nome de papel no novo GET; ela foi removida, mantendo sessão, MFA, `clients.view` e escopo. **Um quarto caso dirigido passou**, exercitando perfil customizado autorizado, rejeição sem permissão e restrição por escopo; os três anteriores não foram repetidos. Escritas administrativas mantêm suas guardas existentes.
- Sessões próprias, interface: 1 caso dirigido aprovado após adaptar o contrato de paginação; sem repetir a suíte inteira.
- Bootstrap: 16 cenários efetivos aprovados pelo agente B (9 iniciais, 5 no detalhe e 2 de contagem), com checagem de tipos isolada. O runner conta um agrupador adicional; não é outro cenário. Apenas uma asserção de espaçamento foi corrigida/repetida.
- Frota/backup: 6 casos dirigidos e renderização isolada aprovados pelo agente C. Somente a asserção de espaços da renderização foi corrigida/repetida. Cenários sintéticos com 1.105 e 5.105 nodes reduziram chamadas de lotes de 10 para 5 e de 126 para 21 respectivamente. Não representam número total de SQL nem p95 real.
- Administração: 27 casos iniciais + 14 dirigidos para vínculo com cliente inativo, todos aprovados; sem repetir os 27 após o adendo.
- Interface administrativa: 19 verificações dirigidas e checagem de tipos aprovadas.
- Autenticação/parser: 9 casos distintos aprovados; somente o caso de login afetado pela correção da corrida de reset foi repetido.
- PostgreSQL real: **26 subcasos novos aprovados na primeira execução** — 20 administrativos e 6 de autenticação. Os dois agrupadores dos runners não são testes adicionais. Cobertura de disputas entre conexões, rollback, sessão revogada com auditoria única, reset, paginação, orçamento compartilhado e falha de reserva. A paginação de 1.105 usuários/205 sessões levou 475 ms no ensaio funcional; **não é P95 nem benchmark de produção**.
- Build web de produção: aprovado em uma execução. Build API: aprovado após freeze das cinco frentes; uma segunda compilação foi necessária pela correção final do guard de clientes, sem repetir os grupos PG/admin/auth. `git diff --check`: aprovado.
- Navegador real com API sintética e cookie exclusivo de QA: seleção de uma ficha, proteção de rascunho ao trocar aba, Cancelar, Back/URL, navegação ativos/inativos, desktop e viewport de 390 px aprovados. Não foram submetidas escritas. A aparente sobreposição mobile durante animação foi refutada após estabilizar a transição e não é achado.
- Nenhuma suíte das entregas 198/200 foi repetida. Repetições desta rodada foram exclusivamente dos casos afetados, descritos acima.

## Ambiente de QA

O servidor 221 respondeu à inspeção inicial: árvore canônica limpa e quatro serviços saudáveis. Depois, novas conexões SSH expiraram. Uma tentativa de preparar rede/container QA ficou sem saída e o processo SSH local foi encerrado; não há prova de criação nem confirmação de recursos remotos dessa tentativa. Quando o acesso retornar, verificar apenas os nomes `pfs-report202-qa` e `pfs-report202-db` antes de criar/remover recursos. Nunca concluir prova PG pelo teste sintético.

A alternativa foi PostgreSQL 17 descartável no **220**, rede Docker interna sem portas publicadas, usuário/banco QA, dados em tmpfs e sentinela exclusiva conferida pelos harnesses. As 42 migrations, incluindo a nova, foram aplicadas nessa base vazia. A imagem existente `58dc16031453` serviu como runner com o `dist` recém-compilado montado; Prisma Client foi regenerado somente dentro do runner. Não foi usado banco de produção nem fallback `DATABASE_URL` pelos testes.

Após os 26 casos, runner, banco, rede `pfs-report202-qa` e `/tmp/pfs-report202-qa-20261102` foram removidos e a ausência verificada. Os servidores locais sintéticos e suas portas foram encerrados; aba QA fechada e viewport restaurado. Nenhuma imagem temporária foi criada. Permanecem fontes finais, testes úteis, documentação e artefatos de compilação; não foram geradas cópias intermediárias de projeto.

## Pendências de aceite

1. Recuperar acesso SSH ao 221 e conferir seu estado antes de publicar; a última tentativa desta rodada expirou novamente.
2. Resolver os gates da revisão [204](204-REVISAO-USABILIDADE-CINCO-AGENTES-2026-11-02.md): matriz de permissões e IP real do login, com estados de erro compreensíveis. Não ampliar permissões nem confiar em headers arbitrários para passar teste.
3. Navegação com autenticação real e submissões no QA, incluindo perfis restritos; teclado/leitor de tela não foram certificados pelo ensaio visual.
4. Medir SQL/P95/memória da frota e seletores antes de prometer escala sob carga.
5. Publicação coordenada API/web, versão de release, migration, saúde e conjunto DR com imagens exatas. Nada disso foi declarado executado por esta rodada. Package/agente permanece inalterado.
