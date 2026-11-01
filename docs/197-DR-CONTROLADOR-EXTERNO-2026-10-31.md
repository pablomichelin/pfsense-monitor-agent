# 197 — Recuperação do controlador fora do host 221

Data: 31/10/2026; complementos de reconstrução, portabilidade e ativos offline: 01/11/2026 UTC. Estado: fontes e testes sintéticos concluídos. Operador informou PASS do backup real `dr-20261101T023854Z-943c2e86f8634487` e do verificador PG17/todos XMLs/nodeSecrets; implementação não executou nem observou esse ensaio. O boot desse arquivo foi recusado antes dos containers porque IDs do store containerd no 221 diferem dos IDs do store clássico no 220 após save/load. Não houve falha de aplicação demonstrada. Esse conjunto antigo mantém apenas a prova PG/AES; boot completo exige **novo backup com identidade portátil, fonte e pacote offline**. Destino: host 220, **na mesma LAN**. Não constitui cópia geograficamente separada.

## Objetivo e escopo

Recuperar PostgreSQL, arquivos `.enc`, configuração de execução e chaves do controlador como um conjunto cifrado antes de sair do 221. Sem acesso a clientes, instalação da stack de produção ou restauração em banco de produção. Sem alteração de API, schema, painel ou package. O conteúdo do banco, credenciais, caminhos dos backups, versão/commit e IDs de imagens ficam exclusivamente dentro da cifra.

Arquivos: `scripts/{backup-controller-dr.py,verify-controller-dr.py,controller-dr-common.py,test-controller-dr.py}` e `infra/systemd/monitor-pfsense-dr.{service,timer}`. Os helpers operacionais recusam execução fora de Linux/root; `--help` e testes com dados sintéticos funcionam no Mac.

Complemento autorizado: `scripts/verify-controller-dr-stack.py`, para boot descartável de API/web/nginx, importando os helpers de dados existentes. Nenhum helper possui opção `--keep`; limpar continua obrigatório.

## Contrato de instalação pelo operador

- **221:** fontes canônicas em `/Dados/Monitor-Pfsense/scripts`; GPG, Python 3, Docker Compose, Git e SSH disponíveis. Apenas a pública em `/etc/monitor-pfsense-dr/recipient.asc`, com fingerprint primário esperado em `/etc/monitor-pfsense-dr/recipient.fingerprint`. O helper importa a pública em um home temporário isolado e confere o fingerprint antes de cifrar. Não usa chave privada do 221.
- **220:** instalar os três helpers operacionais juntos em `/opt/monitor-pfsense-dr/scripts`; Python 3 com `cryptography`, GPG e Docker. `postgres:17` deve estar previamente disponível. Não é necessário Node ou uma imagem da API. Chave privada exclusivamente no `GNUPGHOME=/var/lib/monitor-pfsense-dr/keys` (desbloqueável em modo batch; nenhuma senha em argumento).
- **Transporte:** SSH root 221 → 220 com autenticação pronta e host key conhecida. Destino de host, diretório e chamada do receptor são fixos. Os helpers não configuram SSH.
- **Permissões:** diretórios específicos de DR `700`, arquivos `600`, proprietário root, `umask 077`; nenhum link simbólico nos caminhos de trabalho. Criar também `/opt/monitor-pfsense-dr` com `700` ao instalar o diretório `scripts`. Copiar somente código ao Mac/repositório; material privado permanece nos hosts.

O receptor está fixado em `/opt/monitor-pfsense-dr/scripts/backup-controller-dr.py`. Não exige checkout do projeto no 220.

```bash
# 221: backup real, somente pelo operador
python3 /Dados/Monitor-Pfsense/scripts/backup-controller-dr.py backup

# Pública fora do padrão ou fingerprint explícito, se necessário
python3 /Dados/Monitor-Pfsense/scripts/backup-controller-dr.py backup \
  --keys /etc/monitor-pfsense-dr --recipient FINGERPRINT_PRIMARIO_COMPLETO

# 220: verificação real; nome aleatório e nenhum vínculo com banco de produção
GNUPGHOME=/var/lib/monitor-pfsense-dr/keys \
python3 /opt/monitor-pfsense-dr/scripts/verify-controller-dr.py latest

# Também aceita ID específico emitido pelo backup
python3 /opt/monitor-pfsense-dr/scripts/verify-controller-dr.py dr-AAAAMMDDTHHMMSSZ-0123456789abcdef

# Ajuda não executa backup, restauração ou acesso remoto
python3 /Dados/Monitor-Pfsense/scripts/backup-controller-dr.py backup --help
python3 /opt/monitor-pfsense-dr/scripts/verify-controller-dr.py --help
```

A chamada interna do receptor é `python3 /opt/monitor-pfsense-dr/scripts/backup-controller-dr.py receive ID`. O stdin é um cabeçalho JSON de uma linha (formato, timestamp UTC, bytes cifrados e SHA-256), seguido dos bytes GPG. Não executar com um `.gpg` isolado no stdin: faltaria o cabeçalho. O emissor implementa o protocolo automaticamente.

Opções adicionais do backup: `--repo`, `--storage`, `--db-storage-prefix` (prefixo **gravado no banco**, padrão `/app/data/pfsense-config-backups`), `--key-file /caminho/absoluto` repetível para chaves externas aos dotenv. O destino remoto não é configurável. Não passar valores de chaves nessas opções. Se a implantação usa arquivos de chave adicionais, o operador deve enumerá-los; os dois segredos AES atuais estão em `.env.api`.

## Consistência, cifra, publicação e retenção

1. Lock `flock` exclusivo em `/var/lib/monitor-pfsense-dr/backup.lock`. Primeiro fixa todos os `.enc` existentes com hardlinks privados em diretório temporário irmão do storage, portanto no mesmo filesystem. A retenção da aplicação pode remover os nomes originais sem perder os inodes fixados. Não modifica permissões nem bytes dos originais e não interrompe ingestão.
2. Abre transação `REPEATABLE READ READ ONLY`, exporta snapshot e consulta **todas** as referências (`storage_path` presente ou status `stored`). `pg_dump --snapshot` usa a mesma visão enquanto a sessão exportadora permanece aberta. Timeout de lock de três segundos impede espera prolongada por DDL; nenhuma trava global de ingestão é criada.
3. Valida o custom dump com `pg_restore --list`. Copia os arquivos referenciados para inodes privados; referências posteriores à fixação inicial ganham novos hardlinks. Ausência de referência, symlink, versão desconhecida, tamanho incorreto ou mudança durante a cópia aborta. O conjunto contém apenas arquivos referenciados, não os órfãos fixados provisoriamente.
4. `.env.api`, `.env.web`, `.env.db`, `compose.yaml`, `config/package-release.env`, nginx interno, overrides/dotenv adicionais existentes, extras enumerados e contexto de release são preservados. Inclui agora `runtime/recovery-assets/source.bundle`, gerado por `git bundle create --all HEAD`, verificado por `git bundle verify` e pela presença do HEAD capturado nas referências do bundle. Recusa mudança de HEAD durante a captura. O operador realiza o backup final após commit/push, com checkout limpo: WIP não commitado não é representado pelo bundle.
5. Lê versão e SHA da **cópia capturada** de `package-release.env`, sem source/eval; copia de `dist/pfsense-package` somente `monitor-pfsense-package-v<VERSÃO>.tar.gz` e seu `.sha256`. Confere SHA dos bytes copiados e exige sidecar com esse mesmo SHA e nome exato. Ausência, versão/configuração inválida ou divergência aborta antes de GPG/transporte. Os arquivos ficam em `runtime/recovery-assets/dist/pfsense-package/`. `release.json.recovery_assets` relaciona membros, SHA, versão e commit dentro da cifra; todos os ativos gerados também entram no `manifest.files`. O recheck posterior ignora esse prefixo gerado, mas continua exigindo `package-release.env` original inalterado. Imagens Docker permanecem em bundle cifrado separado, preservado pelo pai; não são duplicadas diariamente no conjunto de dados.
6. Manifesto interno associa referências do mesmo snapshot, caminhos, hash do XML, tamanho original, versão criptográfica e SHA-256 de cada `.enc`, configuração, ativos offline e dump. Tar é transmitido diretamente ao GPG; não cria tar com credenciais em claro. Apenas o `.gpg` sai por SSH. Dump/configuração/ativos temporários privados no 221 são eliminados ao finalizar, inclusive em erro.
7. No 220, lock exclusivo `/var/backups/monitor-pfsense-dr/.lock`, compartilhado com o verificador. Recebe em `.incoming-*` privado; confere EOF, tamanho e SHA-256; sincroniza arquivos e publica o diretório inteiro por rename atômico. O conjunto publicado contém `controller.tar.gpg`, `controller.tar.gpg.sha256` e `metadata.json`, este último somente com formato, timestamp, bytes e checksum. Nomes aleatórios/UTC não identificam clientes.
8. Somente após publicação concluída remove conjuntos gerenciados excedentes, mantendo os últimos **sete**, ordenados pelo timestamp/ID. Recepção truncada, checksum inválido, colisão de ID ou falha de rename não aciona retenção. Não toca em diretórios alheios ao padrão de IDs do helper. Uma falha de retenção posterior à publicação resulta em erro e preserva o novo conjunto; o operador deve conferir o destino antes de repetir.

Uma referência perdida pela retenção antes de ser fixada pode fazer o snapshot falhar; isso é deliberado. Não publica conjunto com referência ausente nem pausa ingestão para forçar sucesso. Não repetir automaticamente tentativas com efeitos sem avaliar o motivo.

## Verificador de recuperação no 220

Confere checksum/sidecar antes de decifrar em diretório privado temporário. Extração aceita somente arquivos regulares previstos, sem links, caminhos absolutos ou `..`; manifesto e hashes devem cobrir exatamente o conteúdo extraído. GPG precisa concluir com integridade válida antes de iniciar PostgreSQL.

Cria um PG17 exclusivo, sem rede ou portas, CPU 1, memória e memória+swap limitadas a 1 GiB, pids limitados e logs Docker desabilitados. Usa `--pull=never`. O dump entra por stdin de `pg_restore --exit-on-error --no-owner --no-privileges` no banco descartável. O helper não aceita nome de container, banco ou volume de produção.

Após restaurar, consulta novamente as referências no **banco restaurado** e compara integralmente com o manifesto. Para cada referência, decifra AES-256-GCM e confere tamanho e SHA-256 do XML original em memória. O formato atual é IV 12 bytes + ciphertext + tag 16 bytes: `.enc = size_bytes + 28`, pois o ingest cifra `xmlBytes` já descompactado e grava `sizeBytes=configSize` validado contra esses bytes. `payload_size_bytes` pode representar gzip e não é usado para esse cálculo.

Decifra **todos** os `node_credentials.secret_encrypted` (incluindo revogados) com a segunda chave de `.env.api`, confere UTF-8 e `secret_hash`. Nenhum segredo ou XML é impresso ou escrito em disco; XML aparece apenas na memória do processo verificador. A saída final é genérica, sem nomes ou contagens de clientes. Remove container com `docker rm -f -v` e diretório temporário em `finally`, também nas falhas normais e sinais de término. Erro de limpeza não vira sucesso. SIGKILL, queda de energia ou falha do daemon podem exigir limpeza manual dos recursos `monitor-pfsense-dr-*` pelo operador após inspeção.

Essa verificação demonstra restauração do banco e capacidade de recuperar os arquivos/chaves do conjunto testado. Não instala a stack nem promove o banco descartável a produção. A reposição efetiva de um controlador exige decisão operacional, código/imagens correspondentes e aplicação controlada da configuração preservada. Não restaura nada em pfSense.

## Boot isolado de API, web e nginx no 220

Instalar também `verify-controller-dr-stack.py` junto aos três helpers em `/opt/monitor-pfsense-dr/scripts`, arquivos `600`/diretório `700`. O operador preservou as quatro imagens originais com `docker save` no 221 e `docker load` no 220 por stream, sem arquivo intermediário. Isso é uma informação operacional do operador, não teste executado pelo implementador.

```bash
# 220, root; substituir pelo ID NOVO, gerado com backup-controller-dr.py atualizado
python3 -B /opt/monitor-pfsense-dr/scripts/verify-controller-dr-stack.py \
  ID_DO_NOVO_BACKUP_FINAL
```

O argumento pode ser `latest`, mas o ID específico torna a prova reproduzível. O script usa o mesmo lock do receptor/verificador, valida checksum/GPG/manifesto em um novo temporário privado e restaura novamente o banco porque o verificador de dados já eliminou seu container/volume. **Não repete AES, nodeSecret ou os 15 testes sintéticos**: esse novo grupo comprova boot e HTTP. As consultas para comparar referências do banco restaurado usam transação somente leitura.

`runtime/release.json` agora contém `image_identity='docker-inspect-execution-v1'` e quatro `image_specs`, cada uma com `source_id` completo, `role` e `fingerprint`. `image_ids` é mantido para rastreabilidade e deve corresponder exatamente aos `source_id`. Os papéis continuam identificados pela configuração original: `dist/main.js` → API; `server.js` → web; `postgres`/`PG_MAJOR=17` → banco; `nginx` → proxy. O fingerprint é SHA-256 UTF-8 da receita exata abaixo; ordena chaves dos objetos, preserva a ordem dos arrays/camadas e representa `Variant` ausente como `null` por `get()`:

```python
json.dumps({k: img.get(k) for k in ['Config', 'RootFS', 'Os', 'Architecture', 'Variant']},
           sort_keys=True, separators=(',', ':'))
```

O pai confirmou por comparação independente que essa identidade é igual nos quatro pares 221/220, embora `.Id` difira. Inclui todo `Config` e todo `RootFS`, portanto não reduz a verificação a nome, tag, comando ou plataforma. Exclui `.Id`, `RepoTags`, `RepoDigests`, `Descriptor` e `GraphDriver`, que descrevem indexação, referências ou armazenamento local. Configurações/ambientes de imagem ficam apenas na memória usada para o hash; não são impressos nem copiados para metadados públicos. Referências de contexto: [image inspect](https://docs.docker.com/reference/cli/docker/image/inspect/), [stores containerd/clássico e índices](https://docs.docker.com/engine/storage/containerd/).

No 220, o helper lista somente IDs locais completos, inspeciona candidatos em lotes e compara o fingerprint inteiro com cada especificação cifrada. Confirma novamente o papel a partir do conteúdo correspondente. Só então executa o **ID local imutável** com `--pull=never`; nunca executa uma tag. Se mais de um ID local representar exatamente a mesma configuração/plataforma/camadas, escolhe deterministicamente o menor ID entre esses equivalentes. Candidato com o nome/tag esperado e conteúdo diferente é recusado. Arquivo sem `image_specs`/versão de identidade, imagem faltante ou hash divergente interrompe antes de rede/containers; não existe fallback por ID antigo, tag ou registry. A próxima imagem final publicada terá outro fingerprint e precisa constar do novo backup.

Cria rede bridge exclusiva `10.77.19.0/24` com `--internal`, gateway IPv4 `isolated`, sem masquerade e sem IPv6. Antes confere conflito contra todas as redes Docker, rotas IPv4 e endereços do host; se houver sobreposição, aborta sem escolher outra sub-rede automaticamente. Confere que o bridge criado não recebeu endereço do host. Esse modo evita a exposição do gateway do host que uma rede `--internal` comum ainda poderia permitir. Requer Docker com suporte a gateway `isolated`; não existe fallback mais permissivo. DNS externo é direcionado ao loopback do próprio container; os aliases locais `db`, `api`, `web`, `nginx` são resolvidos na rede exclusiva. A sonda também rejeita rota IPv4 default dentro da API. Referência: [gateway isolated do Docker](https://docs.docker.com/engine/network/port-publishing/#gateway-modes).

Cada serviço tem CPU 1; PG/API/web têm memória e memória+swap limitadas a 1 GiB cada, nginx a 128 MiB, pids limitados, core desativado e logs Docker descartados. Nenhum `-p`, `--publish`, Docker socket, namespace host ou bind da base PostgreSQL de produção é usado. Nomes/labels aleatórios identificam apenas recursos desta execução.

O banco é criado como `monitor_qa`, usuário local descartável `dr_verify`; `DATABASE_URL` é sobrescrito para `postgresql://dr_verify@db:5432/monitor_qa`. Dotenv originais não são alterados no conjunto cifrado. As cópias temporárias de `.env.api`/`.env.web` são montadas somente leitura e interpretadas pelo Node `--env-file`, sem executar shell nem expandir comandos. Valores de AUTH/chaves não passam por argv ou saída; os overrides de ambiente Docker têm precedência sobre os dotenv. `MONITOR_API_BASE_URL=http://api:8088`, portas internas API8088/web3000 e `AUTH_COOKIE_SECURE=false` valem **somente no clone**. Veja [precedência de --env-file no Node](https://nodejs.org/docs/latest-v22.x/api/cli.html#--env-filefile).

Na cópia privada, arquivos e diretórios dos `.enc` recebem proprietário `100:101`, acesso de leitura/travessia e bind somente leitura em `BACKUP_STORAGE_DIR=/app/data/pfsense-config-backups`. O pacote e sidecar recuperados de `runtime/recovery-assets/dist/pfsense-package` são montados somente leitura em `/app/dist/pfsense-package`, também acessíveis ao UID100/GID101. O boot recusa falta desse bind offline. Os originais do 221 e o conjunto cifrado não mudam. Nenhum XML é decifrado por esse helper de boot; nenhum XML em claro é escrito em disco. Chaves extras não montadas pelo contrato padrão exigem uma extensão específica, não montagem arbitrária.

API inicia diretamente por `node dist/main.js`, web por `node server.js`; não executa CMD da API que contém `prisma migrate deploy`. Desativa flags reais de worker, notificações, métricas, upgrades, operações remotas, técnicos, pfREST/vault e diff/drift. Não inventa uma flag de desligamento global para schedulers/retenção. A API existente contém startup MFA com `upsert`, reconciliação de status e expiração/follow-up sem chave global: **o boot pode escrever exclusivamente no banco clonado**. Portanto, "validação somente leitura" descreve as consultas de conferência, não uma promessa de que todo o processo API será SQL read-only. Não há alternativa automática para liberar rede externa ou escrever no banco original quando o boot falhar. A retenção de arquivos não consegue modificar a cópia montada somente leitura.

A partir de `docker exec` na API, uma sonda Node faz somente:

- `http://api:8088/healthz`: HTTP200 e JSON `ok=true`, `database='up'`;
- `http://web:3000/login`: HTTP200 e formulário com campo de senha;
- `http://nginx:8088/login`: mesma comprovação passando pelo proxy;
- `http://nginx:8088/healthz`: comprova proxy → API → banco.

Não segue redirects, não usa contas reais, não acessa hosts/domínios originais nem imprime respostas, env ou logs. Confere containers em execução, sem OOM e sem portas publicadas. Ao terminar ou falhar, tenta remover **todos** os containers com volumes anônimos, a rede própria e o temporário privado. Falha de limpeza não vira PASS. SIGKILL/falha do daemon/host ainda podem exigir limpeza manual por labels após inspeção. Saída de sucesso: `DR STACK PASS (restored database, exact images, API/web/nginx; cleaned)`.

## Preservação durável da versão e reconstrução integral

O Docker local do 220 com imagens carregadas permite este ensaio, mas não substitui uma cópia durável: prune, perda do disco ou do próprio 220 podem apagar as imagens. Para recuperação independente de registry/HEAD, o operador deve preservar estes componentes **antes de considerar o DR completo do serviço**:

| Componente | Preservação e vinculação |
|---|---|
| Dados/chaves/configuração | Conjunto GPG já implementado e verificado; manter o ID e checksum do conjunto testado. |
| Imagens exatas | No 221, `docker image save` dos quatro IDs de origem do `runtime/release.json`, nunca tags móveis; gravar stream cifrado e seu SHA-256 no 220. Após `docker image load`, conferir os quatro fingerprints portáteis/papéis e usar os IDs locais resolvidos. IDs de origem e destino podem diferir por store; identidade de execução precisa ser igual. |
| Fonte do serviço | **Incluída automaticamente** em `runtime/recovery-assets/source.bundle`, com todas as refs/HEAD e histórico necessário, verificação Git e vínculo ao commit completo de `release.json`. Permite clone e checkout sem GitHub ou 221. Fazer checkout explícito do commit preservado, nunca de `main` atualizado. Bundle não incorpora WIP não commitado; backup final pelo pai após commit/push e árvore limpa. |
| Artefato de agente | **Incluído automaticamente**, pacote e sidecar exatos da versão/SHA capturados de `runtime/config/package-release.env`, em `runtime/recovery-assets/dist/pfsense-package/`. Não depende do bind perdido do 221 nem de GitHub. Nenhuma versão é fixada neste runbook: vale a capturada no novo conjunto final. |
| Infraestrutura | Arquivos de compose/nginx já preservados no conjunto, versões Docker/arquitetura compatíveis e instalação base do host. Certificados TLS/proxy externo e DNS/ISPConfig dependem de recuperação própria. Não fazem parte do boot isolado. |

Para gerar o arquivo de imagens no **220**, com as variáveis contendo os quatro IDs completos **locais já resolvidos por fingerprint** a partir do mesmo conjunto e apenas a fingerprint pública em `DR_RECIPIENT`, o operador pode usar o seguinte padrão. Não usar IDs de indexação do 221 como se fossem IDs locais do 220, não preencher com segredos nem usar uma tag para substituir um ID. Não executar no Mac.

```bash
set -euo pipefail
umask 077
# DR_IMAGE_API, DR_IMAGE_WEB, DR_IMAGE_NGINX, DR_IMAGE_DB: IDs locais resolvidos por fingerprint.
# DR_RECIPIENT: fingerprint pública correspondente ao conjunto de chaves provisionado.
install -d -m 700 /var/backups/monitor-pfsense-dr/images
DR_IMAGE_FILE="/var/backups/monitor-pfsense-dr/images/images-$(date -u +%Y%m%dT%H%M%SZ).tar.gpg"
test ! -e "$DR_IMAGE_FILE"
docker image save "$DR_IMAGE_API" "$DR_IMAGE_WEB" "$DR_IMAGE_NGINX" "$DR_IMAGE_DB" \
  | gpg --homedir /var/lib/monitor-pfsense-dr/keys --batch --trust-model always \
      --recipient "$DR_RECIPIENT" --encrypt > "${DR_IMAGE_FILE}.partial"
test -s "${DR_IMAGE_FILE}.partial"
mv "${DR_IMAGE_FILE}.partial" "$DR_IMAGE_FILE"
sha256sum "$DR_IMAGE_FILE" > "${DR_IMAGE_FILE}.sha256"
```

Esse padrão é operação manual do pai, não função do receptor `receive` nem do timer. Cabeçalho GPG/credenciais nunca são impressos. Publicar o checksum depois do stream concluído e considerar arquivo sem sidecar como incompleto. Se interrompido, remover apenas o `.partial` próprio; não usar `docker image prune`. Para carregar, conferir primeiro SHA-256 e usar `gpg --decrypt ... | docker image load`, com pipefail, suprimindo a saída de nomes/tags e conferindo depois fingerprints portáteis contra o conjunto. `docker save/load` pode atualizar tags embutidas no arquivo; realizar em daemon de recuperação destinado a isso, sem sobrescrever referências de outros projetos. Alternativamente, o operador pode manter tags novas e exclusivas `monitor-pfsense-dr-operational/<serviço>:<ID-do-conjunto>` para proteger referências locais, sem retag de nomes existentes; essas tags não substituem o arquivo cifrado nem a comparação portátil. Referência: [docker image save](https://docs.docker.com/reference/cli/docker/image/save/).

Fonte, pacote, sidecar e seu mapa de SHA/commit/versão já são gerados **dentro do payload privado antes da cifra** pelo backup atualizado; não é necessário gerar ou transportar um bundle Git separado. O mapa fica em `runtime/release.json.recovery_assets`, coberto também pelo manifesto. Imagens continuam sendo preservadas pelo pai em bundle cifrado separado: associar seu SHA aos quatro fingerprints do conjunto sem divulgar configuração. Manter bundles de imagens compatíveis com os sete conjuntos de dados retidos e com backups retidos manualmente; a retenção automática gerencia somente os diretórios de dados (agora com fonte/pacote inclusos), não os arquivos de imagens externos.

Na reconstrução offline, após validar GPG/manifesto e extrair somente em área privada no host de recuperação, usar a fonte preservada e repor o bind do pacote. Exemplo para o operador, **não executado nesta entrega**, com `DR_PAYLOAD` apontando à extração privada validada e `DR_SOURCE` a um diretório novo de recuperação; o checkout do serviço não inicia nada:

```bash
git clone --no-checkout "$DR_PAYLOAD/runtime/recovery-assets/source.bundle" "$DR_SOURCE" >/dev/null 2>&1
DR_COMMIT="$(python3 -B -c 'import json,sys; print(json.load(open(sys.argv[1]))["git_commit"])' "$DR_PAYLOAD/runtime/release.json")"
git -C "$DR_SOURCE" checkout --detach "$DR_COMMIT" >/dev/null 2>&1
install -d -m 700 "$DR_SOURCE/dist/pfsense-package"
cp "$DR_PAYLOAD"/runtime/recovery-assets/dist/pfsense-package/* "$DR_SOURCE/dist/pfsense-package/"
```

Esse exemplo imprime somente o commit no pipe capturado pela variável, nenhum segredo/env/XML. O verificador de dados e o boot normal **não deixam a extração preservada**: uma reconstrução operacional requer extração privada controlada própria, conferência do manifesto e limpeza posterior, sem adicionar `--keep` aos verificadores. Repor dotenv/chaves somente desse payload privado, respeitando permissões/UID dos serviços e mantendo `.enc` cifrados. Comparar novamente SHA do pacote e versão de release antes de eventual ativação.

A sequência de reconstrução de um controlador é: preparar host compatível → verificar/decriptar bundles em área privada → carregar imagens e conferir fingerprints de execução/papéis → clonar Git bundle e checkout do commit registrado → recuperar dotenv/chaves e artefatos da distribuição → restaurar banco e `.enc` → executar verificador de dados → executar boot isolado API/web/nginx → registrar o limite da prova → decidir ativação operacional. Não reconstruir binários com `npm install`, `docker build` ou `git pull main` para alegar restauração exata da versão preservada.

O compose canônico publica portas e contém serviços/rotinas de produção. **Não executar esse compose para este ensaio**, nem presumir que `ports: []` em override remove portas herdadas. O helper cria containers individualmente sem portas e sem mounts da stack original. Uma ativação efetiva após desastre exige configuração própria revisada, domínio/TLS/proxy, destino de dados/chaves adequado e reativação deliberada de workers/integrações. Nenhuma dessas ações é feita por este runbook de prova isolada.

## Alcance da prova e perda simultânea

PASS de banco/AES demonstra recuperação dos dados e chaves daquele conjunto. PASS do novo helper demonstra que as imagens preservadas iniciam e servem saúde/login atrás do nginx contra o banco restaurado. Não demonstra autenticação/MFA, operação autenticada completa, ingestão por firewalls, upgrades, notificações, conectividade de clientes ou publicação HTTPS externa. O boot somente testa a página pública de login e consultas de saúde; não reutiliza senha de usuário real. RPO é o último conjunto integral aprovado; RTO completo ainda precisa de medição do operador e inclui preparação do host, carga de imagens, restore e decisão de ativação.

221 e 220 pertencem à mesma LAN. Perda simultânea por energia, rede, storage, sinistro ou comprometimento administrativo pode destruir ambos. A privada GPG apenas no 220 também se perde com ele. Para suportar essa classe de desastre, é necessária cópia cifrada adicional fora desse domínio de falha e custódia recuperável da chave privada/revogação em local independente, conforme decisão operacional específica. Não foi feita nem programada aqui; não há alegação de recuperação geográfica/offsite.

## Timer operacional opcional, somente no 221

As unidades fornecidas executam o backup diário às 05:15 America/Sao_Paulo, com atraso aleatório de até dez minutos, prioridade reduzida e timeout de duas horas. Após instalar os helpers e concluir o ensaio manual, o operador pode instalar as unidades em `/etc/systemd/system/`, executar `systemctl daemon-reload` e `systemctl enable --now monitor-pfsense-dr.timer`. Não instalar esse timer no 220. Não cria automação Codex ou fila de execução. O operador informou ativação no 221, próxima execução 05:16:07-03; o implementador não ativou nem verificou o timer.

## Evidência e próximos passos

Grupo novo `python3 scripts/test-controller-dr.py`: **15 casos aprovados** com Docker/GPG/SSH simulados e AES-GCM real de `cryptography`, sem dados reais. Abrange snapshot compartilhado, limite de lock, retenção concorrente com hardlinks e ingestão posterior, ausência de referências, falhas de dump/cifra/transporte/rename, retenção de sete, permissões, lock concorrente, paths/symlinks, corrupção de `.enc`, XML/hash e nodeSecret, correspondência dump/manifesto, limpeza e restrições do container. GPG real e PostgreSQL real não foram executados pelo implementador.

Execução inicial: 11 casos aprovados e quatro bloqueados porque `/tmp` no Mac é symlink. A fixture foi corrigida para o caminho real; somente esses quatro casos foram reexecutados, todos aprovados. O código operacional não foi relaxado. Dependência de teste isolada e temporários locais removidos ao encerrar. Verificações sintáticas e ajuda não acessam produção.

Complemento de boot: conferência sintática e help do novo helper pelo implementador; execução do novo grupo real API/web/nginx permanece com o operador. Os 15 testes e a validação AES anterior não foram repetidos. Nenhum remoto/build ou operação de produção foi executado pelo implementador nesta frente.

Correção de portabilidade: `python3 -B scripts/test-controller-dr-portability.py` executado **uma vez, um caso aprovado** com captura `copy_runtime` e resolução `image_roles`, simulando IDs/Descriptor/GraphDriver/tags diferentes com a mesma execução. Cobre a fórmula canônica independente, recusa de Config/camadas/Variant divergentes, decoy `latest` e recusa de arquivo antigo antes de Docker. Usa somente biblioteca padrão e fixtures sintéticas, sem Docker/remoto/credenciais. Os 15 testes prévios não foram repetidos.

Ativos offline: `python3 -B scripts/test-controller-dr-offline-assets.py`, **três casos aprovados na primeira e única execução**: bundle real de repositório sintético pode ser clonado em repo novo e contém o HEAD; SHA/ausência de pacote e sidecar incorreto são recusados; manifesto cobre fonte/pacote/sidecar e recusa corrupção posterior. Sem PG, Docker, AES ou dados reais. Fixture do teste antigo de portabilidade foi isolada da nova captura de ativos, sem reexecução desse grupo. Nenhum dos 15 testes foi repetido.

Próximo passo do operador: instalar o backup atualizado no 221 e backup+stack atualizados juntos no 220 (o stack importa a função de identidade do backup). Após commit/push final e checkout limpo, gerar **novo backup** já com fonte/pacote, preservar/importar as imagens finais e executar o grupo de boot contra esse novo ID. Não reescrever `release.json` nem o manifesto do conjunto antigo para simular captura original. Preservar o bundle cifrado externo de imagens e registrar somente resultado genérico e limite da prova. Mantida a orientação de uma validação por grupo, repetindo apenas grupos afetados por falha ou mudança.
