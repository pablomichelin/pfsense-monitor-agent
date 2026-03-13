# Versionamento e Branding

## Objetivo

Definir como o Monitor-Pfsense sera versionado e como a autoria da Systemup aparecera no produto.

## Regra principal

O produto deve sempre exibir:

- versao do sistema
- autoria `Desenvolvido por Systemup`

Com hyperlink obrigatorio para:

- `https://www.systemup.inf.br`

## Estrategia de versionamento

O projeto usara `Semantic Versioning`:

- `MAJOR.MINOR.PATCH`

Exemplos:

- `0.1.0`
- `0.2.3`
- `1.0.0`

Regras:

- enquanto o produto estiver em maturacao inicial, usar serie `0.x.y`
- quando o MVP estiver estavel em producao, promover para `1.0.0`
- `MAJOR`: quebra de compatibilidade
- `MINOR`: nova funcionalidade compativel
- `PATCH`: correcao sem quebra de contrato

## Versao global e versoes tecnicas

Deve existir uma versao global de release:

- `vX.Y.Z`

Exemplo:

- `v0.1.0`

Tambem podem existir versoes tecnicas por componente:

- `api_version`
- `web_version`
- `agent_version`
- `pfsense_package_version`
- `schema_version`

Regra:

- a release oficial usa a versao global
- o `schema_version` do heartbeat e independente da versao do aplicativo

## Convencao de release

### Git

Tags oficiais:

- `v0.1.0`
- `v0.1.1`
- `v0.2.0`

### Docker

Imagens devem usar a tag da release.

Exemplo:

- `monitor-api:v0.1.0`
- `monitor-web:v0.1.0`

### Pacote pfSense

O pacote deve carregar versao propria alinhada com a release.

Exemplo:

- `systemup-monitor 0.1.0`
- `monitor-pfsense-agent-v0.1.0.tar.gz` para o bootstrap transitorio pre-pacote

## Onde a versao deve aparecer

Obrigatoriamente:

- rodape da tela de login
- rodape do layout autenticado
- pagina de configuracoes ou sobre
- tela local do agente no pfSense

Formato recomendado:

- `Monitor-Pfsense v0.1.0`

## Branding obrigatorio

Texto oficial:

- `Desenvolvido por Systemup`

Link oficial:

- `https://www.systemup.inf.br`

Onde deve aparecer:

- rodape da tela de login
- rodape do painel autenticado
- pagina `Sobre` ou `Informacoes do sistema`

Desejavel:

- tela local do pacote no pfSense

Formato recomendado no painel:

- `Monitor-Pfsense v0.1.0 | Desenvolvido por Systemup`

## Regras adicionais

- a versao exibida deve vir do build real
- o branding deve existir em producao e homologacao
- em desenvolvimento, a versao pode incluir sufixo tecnico

Exemplo:

- `0.1.0-dev+abc1234`

## Decisao desta fase

Fica decidido que:

- o projeto usara `Semantic Versioning`
- a interface exibira a versao do sistema
- a interface exibira `Desenvolvido por Systemup`
- o link oficial sera `https://www.systemup.inf.br`
