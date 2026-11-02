# 205 — Publicação de UX e integridade

Data: 02/11/2026. Publicação autorizada pelo usuário e **concluída**: API **0.14.0**, web **1.15.0**; agente **0.5.26 inalterado**. Imagens construídas a partir de `f97ad28`; harness HTTP preservado em `b73c6f4`. **Recuperação integral pós-release aprovada no 220.**

## Escopo

Entregar as mudanças 201/203 e fechar três gates operacionais da revisão 204. Nenhuma alteração de firewall, classificação de saúde, HA/CARP, Zabbix, Theo ou proxy compartilhado.

- U204-01: leitura da frota e filtros de backup usa `backups.view`, mantendo escopo. Filtros retornam somente clientes/sites; detalhe do firewall continua exigindo `firewalls.view` e a interface não oferece link proibido. Download e comandos mantêm suas guardas.
- U204-02: login interpreta X-Forwarded-For da direita para a esquerda, a partir do peer TCP, parando no primeiro salto não confiável. Lista específica `LOGIN_TRUSTED_PROXY_CIDRS`; nunca aceita CF-Connecting-IP como identidade autodeclarada. Web/nginx devem manter endereços fixos na rede própria do projeto. Confiança global da API não muda.
- U204-03: a interface diferencia credenciais inválidas, limite temporário e indisponibilidade, sem revelar existência da conta ou resposta interna.

A lista Cloudflare foi conferida nas fontes oficiais [IPv4](https://www.cloudflare.com/ips-v4) e [IPv6](https://www.cloudflare.com/ips-v6). Modelo em `config/login-proxy.env.example`; endereços locais dependem da rede conferida no host. NAT e IPv6 /64 ainda compartilham orçamento deliberadamente. Limites: 60 tentativas/IP e 10/conta-IP em cinco minutos, incluindo sucessos.

## Pré-verificação e validação focalizada

Acesso direto Mac→221 expirou; acesso via 220→221 funcionou. Quatro serviços saudáveis e árvore limpa em `0f52839`; pull de `fad389f` concluído. Configuração efetiva tinha apenas ISPConfig na lista global; o login via web não preservaria o IP como pretendido. Rede do projeto confirmada `172.22.0.0/16`, web `.3`, nginx `.4`.

Cinco casos dirigidos novos PASS: cadeia confiável/spoofing, entrada inválida/limites, permissões de backup, mensagens de login e links do perfil restrito. As suítes anteriores e os 26 cenários PG aprovados não foram repetidos. Builds finais das duas imagens aprovados, uma execução por componente nesta entrega.

HTTP na imagem final, banco PG17 descartável e autenticação real: login/sessão, origem resolvida, leitor exclusivo de backups, filtros sob escopo, recusa ao inventário e a outro cliente, edição administrativa com CSRF e recusa sem CSRF aprovados. Somente a última expectativa foi corrigida no teste (a API existente retorna 401 sem CSRF, não 403), repetindo exclusivamente esse caso com registro inalterado. Nenhuma fonte de produto mudou por essa falha do teste. Preparação do QA precisou mover a sentinela para depois das migrations; não foi falha de migration em produção nem repetição da suíte anterior.

Produção: quatro serviços `healthy`; `/healthz` HTTP200 com banco `up` e versão 0.14.0; login LAN e público HTTPS HTTP200; HTML publicado confirma 1.15.0. Migration `20261102110000_password_login_rate_limit` consta concluída uma vez. Matriz de papéis foi consultada: admin/superadmin já possuem `bootstrap.view` + `bootstrap.execute`; não houve concessão nova a usuários ou papéis.

Uma submissão multipart real da tela de login pela LAN percorreu nginx→Next→API e retornou a mensagem de credencial inválida esperada. A conferência no banco comprovou orçamento associado à origem real, sem registro associado aos headers falsos ou ao IP compartilhado da web. A tentativa inicial com formulário URL-encoded não acionou o Server Action e não foi contada como prova. A verificação externa de IP via `/cdn-cgi/trace` recebeu HTTP403 antes de enviar login; a prova end-to-end de IP feita foi pela LAN. A cadeia Cloudflare foi coberta por teste dirigido e conferência readonly dos headers do ISPConfig; o login público foi verificado por HTTP200.

O recurso QA residual da tentativa anterior no 221 foi encontrado com label `pfs.qa=report202`; container e rede correspondentes removidos. QA novo `pfs-release205-*`, rede e `/tmp/pfs-release205-qa` removidos e ausência verificada. Nenhum recurso de outro projeto foi removido.

## Implantação e reversão

Backup cifrado anterior: `dr-20261102T142849Z-ac35a8546d7a49df`. Imagens construídas enquanto containers anteriores continuavam atendendo. API/web substituídos por Compose sem reiniciar banco/nginx ou serviços compartilhados, aguardando saúde. A migration aditiva foi aplicada no start da API. Configuração específica do login e IPs fixos da web/nginx ficaram no ambiente/override do projeto, cobertos pelo DR; a confiança global existente da API não foi ampliada.

Backup pós-release recebido/restaurado no 220: `dr-20261102T144031Z-2b7ea354ef064d20`. As quatro imagens exatas foram exportadas por ID, cifradas em fluxo e vinculadas a esse conjunto em `images/images-dr-20261102T144031Z-2b7ea354ef064d20.tar.gpg`; checksum, decriptação e importação aprovados. `verify-controller-dr-stack.py` retornou **DR STACK PASS (restored database, exact images, API/web/nginx; cleaned)**: recuperação de banco, correspondência das imagens, boot e saúde do stack, com limpeza. Nenhum TAR em claro foi persistido. A cópia continua na mesma LAN, sem alegação de independência geográfica.

Reversão: restaurar os IDs anteriores de API/web registrados no pré-deploy e suas configurações operacionais, sem apagar banco ou backups. A nova tabela de limite é aditiva; a versão anterior não depende dela. Não executar downgrade destrutivo de schema. Manter backups operacionais necessários, removendo somente QA/temporários próprios.

IDs anteriores: API `sha256:b7a2319ff779f0f16ec171bd13ca54b5998f12ae2dc70af58b9acd68857d8a93`, web `sha256:48e587dc461765c4b66f28ece9ea221a4b8484364361b212414bd97b74c1ea66`. Nenhuma reversão foi necessária.

## Continuidade

U204-01/02/03 tratados nesta publicação, com os limites de prova descritos. U204-04 a 10 permanecem propostas de usabilidade/medição, não bloqueiam a publicação autorizada nem foram presumidos implementados. Sem benchmark P95, certificação de acessibilidade ou alteração de appliances nesta rodada.

Auditoria de dependências: o build da API informou nove alertas totais. A consulta dirigida `npm audit --omit=dev` apontou **três high**, na cadeia `prisma` / `@prisma/config` / `deepmerge-ts`, e nenhum critical. O lockfile de dependências não mudou nesta publicação, apenas sua versão do projeto; os alertas não foram introduzidos por upgrade desta entrega. Não foi executado `audit fix` nem presumida explorabilidade ou ausência de impacto. Triagem e atualização compatível ficam registradas para a próxima frente, incluindo o uso do CLI de migrations na imagem de execução.

Artefatos locais de build já substituídos pelas imagens finais (`apps/web/.next`, `apps/api/dist`, `apps/web/tsconfig.tsbuildinfo`) foram removidos após conferir localização e condição de ignorados pelo Git. Fontes, testes duráveis, documentação e backups operacionais preservados.
