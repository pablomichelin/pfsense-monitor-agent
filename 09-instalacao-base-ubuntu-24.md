# Instalacao Base Ubuntu 24

## Objetivo

Preparar um host Ubuntu 24 limpo para receber o controlador central.

## Aviso para este ambiente especifico

O host atual nao esta limpo. Ele ja opera como servidor Zabbix.

Antes de executar qualquer passo deste documento no host atual, validar:

- se o passo altera `apache2`, `mysql`, `zabbix-server` ou `zabbix-agent`
- se o passo disputa portas usadas ou reservadas pelo Zabbix
- se o passo pode causar restart indireto de servicos criticos do host

Norma principal:

- nunca estragar ou alterar algo do Zabbix Server

## Premissas

- Ubuntu 24 LTS instalado
- acesso administrativo por `sudo`
- IP funcional
- DNS ja apontando para o host quando aplicavel

## Passo 1: atualizar o sistema

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

## Passo 2: instalar utilitarios basicos

```bash
sudo apt install -y ca-certificates curl git jq ufw
```

## Passo 3: definir hostname e horario

Exemplo:

```bash
sudo hostnamectl set-hostname monitor-pfsense
timedatectl
```

Validar:

- hostname correto
- NTP ativo
- timezone coerente com a operacao

## Passo 4: criar estrutura inicial de diretorios

```bash
sudo mkdir -p /opt/monitor-pfsense
sudo mkdir -p /opt/monitor-pfsense/{infra,data,backups,logs}
sudo chown -R $USER:$USER /opt/monitor-pfsense
```

## Passo 5: instalar Docker Engine pelo repositorio oficial

Referencia oficial:

- https://docs.docker.com/engine/install/ubuntu/

Comandos base:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Observacao:

- `noble` corresponde ao Ubuntu 24.04
- instalar Docker neste host exige validar previamente que nao ha impacto no firewall local e nas regras de rede usadas pelo Zabbix

## Passo 6: validar Docker

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
```

## Passo 7: permitir uso de Docker sem root para o usuario operacional

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## Passo 8: configurar firewall local

Exemplo com `ufw`:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Ajuste `22/TCP` por origem restrita quando possivel.

No host atual:

- nao alterar regras que afetem `80/TCP`, `10050/TCP`, `10051/TCP` e `3306/TCP` sem entender o impacto no Zabbix
- tratar `443/TCP`, `10052/TCP` e `10053/TCP` como reservadas para o ecossistema Zabbix

## Passo 9: preparar arquivos de ambiente

Criar, no futuro:

- `/opt/monitor-pfsense/.env.api`
- `/opt/monitor-pfsense/.env.web`
- `/opt/monitor-pfsense/.env.db`

Esses arquivos nao devem ser versionados com segredos reais.

## Passo 10: validar requisitos finais

Checklist:

- Docker funcional
- Compose funcional
- host resolvendo DNS
- horario sincronizado
- portas corretas liberadas
- disco e memoria suficientes

## Itens opcionais antes do deploy da aplicacao

- Fail2ban
- integracao com provedor ACME
- snapshot do host
- monitoramento do proprio servidor

## Pre-flight obrigatorio neste host

Executar verificacao antes de qualquer deploy:

- `systemctl is-active zabbix-server zabbix-agent apache2 mysql`
- `ss -ltnup | rg '(:80\\b|:10050\\b|:10051\\b|:3306\\b)'`

Se qualquer acao planejada tocar nesses componentes, ela deve ser revista.
