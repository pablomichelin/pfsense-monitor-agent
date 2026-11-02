# 205 — Publicação de UX e integridade

Data: 02/11/2026. Publicação autorizada pelo usuário. Versões preparadas: API **0.14.0**, web **1.15.0**; agente **0.5.26 inalterado**. Estado inicial deste registro: em preparação, sem alegação de implantação concluída.

## Escopo

Entregar as mudanças 201/203 e fechar três gates operacionais da revisão 204. Nenhuma alteração de firewall, classificação de saúde, HA/CARP, Zabbix, Theo ou proxy compartilhado.

- U204-01: leitura da frota e filtros de backup usa `backups.view`, mantendo escopo. Filtros retornam somente clientes/sites; detalhe do firewall continua exigindo `firewalls.view` e a interface não oferece link proibido. Download e comandos mantêm suas guardas.
- U204-02: login interpreta X-Forwarded-For da direita para a esquerda, a partir do peer TCP, parando no primeiro salto não confiável. Lista específica `LOGIN_TRUSTED_PROXY_CIDRS`; nunca aceita CF-Connecting-IP como identidade autodeclarada. Web/nginx devem manter endereços fixos na rede própria do projeto. Confiança global da API não muda.
- U204-03: a interface diferencia credenciais inválidas, limite temporário e indisponibilidade, sem revelar existência da conta ou resposta interna.

A lista Cloudflare foi conferida nas fontes oficiais [IPv4](https://www.cloudflare.com/ips-v4) e [IPv6](https://www.cloudflare.com/ips-v6). Modelo em `config/login-proxy.env.example`; endereços locais dependem da rede conferida no host. NAT e IPv6 /64 ainda compartilham orçamento deliberadamente. Limites: 60 tentativas/IP e 10/conta-IP em cinco minutos, incluindo sucessos.

## Pré-verificação e validação focalizada

Acesso direto Mac→221 expirou; acesso via 220→221 funcionou. Quatro serviços saudáveis e árvore limpa em `0f52839`; pull de `fad389f` concluído. Configuração efetiva tinha apenas ISPConfig na lista global; o login via web não preservaria o IP como pretendido. Rede do projeto confirmada `172.22.0.0/16`, web `.3`, nginx `.4`.

Cinco casos dirigidos novos PASS: cadeia confiável/spoofing, entrada inválida/limites, permissões de backup, mensagens de login e links do perfil restrito. As suítes anteriores e os 26 cenários PG aprovados não foram repetidos. Builds finais das imagens e prova HTTP com autenticação real em QA serão registrados após execução.

O recurso QA residual da tentativa anterior no 221 foi encontrado com label `pfs.qa=report202`; container e rede correspondentes removidos. Nenhum recurso de outro projeto foi removido.

## Implantação e reversão

Preparar backup cifrado operacional antes da troca; construir imagens sem substituir os containers em uso. Rodar HTTP autenticado na imagem final, com banco descartável e fixtures próprias. Publicar API/web coordenadamente, permitindo apenas a migration aditiva já aprovada em PG17. Verificar saúde, versão, login, permissões e origem real; preservar imagens exatas e conjunto DR pós-release no 220.

Reversão: restaurar os IDs anteriores de API/web registrados no pré-deploy e suas configurações operacionais, sem apagar banco ou backups. A nova tabela de limite é aditiva; a versão anterior não depende dela. Não executar downgrade destrutivo de schema. Manter backups operacionais necessários, removendo somente QA/temporários próprios.
