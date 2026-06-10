# Ideias de funções — Monitor-Pfsense

Documento para registrar ideias de funcionalidades a implementar no futuro. Cada seção descreve a ideia, o benefício e os requisitos de forma que possam ser executados depois.

---

## 1. Comandos servidor → agente via arquivo no GitHub (assinado)

### Ideia

Em vez de o agente buscar comandos diretamente na API do controlador (fila no servidor), usar um **arquivo de comandos versionado no GitHub** que o agente consulta de tempos em tempos. O servidor (ou um job dedicado) **escreve** os comandos nesse repositório; o agente **baixa o arquivo**, **verifica a assinatura** e só então executa as ações permitidas localmente.

Fluxo resumido:

1. Operador/servidor decide que um node deve executar uma ação (ex.: rodar sync, verificar atualização).
2. O comando é registrado (tabela de comandos no backend, para auditoria e disparo).
3. Um processo autorizado gera/atualiza o **arquivo de comandos** no repositório (ex.: `commands.json` ou por node) e **assina** o conteúdo com uma chave privada.
4. O agente no pfSense, em intervalo configurável (ex.: a cada ciclo de heartbeat ou a cada N minutos), faz **GET** na URL do arquivo (ex.: raw do GitHub ou CDN).
5. O agente **verifica a assinatura** usando a chave pública embutida ou distribuída de forma segura.
6. Se válido, o agente filtra os comandos para o seu `node_uid`, executa apenas **ações permitidas** (lista fixa: ex. `run_sync`, `check_update`) e opcionalmente reporta conclusão (ex.: no próximo heartbeat ou endpoint dedicado).

### Benefícios

- **Auditoria:** histórico de comandos no Git (quem, quando, o quê).
- **Separação de canais:** o canal de “entrega” não é a API principal; quem comprometer só a API não tem, por padrão, como injetar comandos válidos sem a chave de assinatura.
- **Integridade e autenticidade:** apenas payloads **assinados** são aceitos pelo agente; arquivo alterado por terceiros (fork malicioso, MITM) é rejeitado.
- **Imutabilidade:** Git preserva o histórico; não se perde “quem mandou o quê”.

### Requisitos para implementação futura

1. **Formato do arquivo de comandos**  
   Definir estrutura (ex.: JSON) com campos como: `node_uid` (ou lista), `action` (enum fixo), `id`, `created_at`, opcionalmente `version` ou parâmetros limitados. Sem script nem código arbitrário.

2. **Assinatura**  
   - Quem gera o arquivo assina o conteúdo (ex.: chave privada em servidor dedicado, HSM ou job de release).  
   - Agente possui chave pública (ou certificado) e valida antes de executar.  
   - Formato: ex. JSON + assinatura em campo separado, ou JWS, ou arquivo `.sig` ao lado.

3. **Lista fixa de ações**  
   O agente só reconhece verbos definidos (ex.: `run_sync`, `check_update`). Nenhuma execução de script ou payload arbitrário.

4. **Onde o arquivo vive**  
   - Repositório (público ou privado). Se privado, o agente precisa de credencial só de leitura (token/deploy key); considerar se o ganho compensa o segredo extra no firewall.  
   - URL estável para o agente (ex.: raw do GitHub, ou artefato em release, ou CDN).

5. **Quem escreve no repositório**  
   - Servidor Monitor-Pfsense (com token de escrita) e/ou job de CI.  
   - Restringir quem pode fazer push (ex.: apenas um job que lê “intenção” da API e gera + assina o arquivo) aumenta a separação: API comprometida ≠ posse da chave de assinatura.

6. **Tabela de comandos no backend**  
   Manter no servidor uma tabela (ex.: `node_commands` ou `pending_commands`) com: node_id, action, status (pending/sent/acked/failed), created_at, optional payload. Serve para: disparar a geração do arquivo assinado, auditoria e eventual reporte de conclusão pelo agente.

7. **Agente**  
   - Rotina periódica (ou junto ao ciclo de heartbeat) que baixa o arquivo, verifica assinatura, filtra por `node_uid`, executa ações permitidas e opcionalmente envia confirmação para a API.  
   - Tratamento de falha: se download ou verificação falhar, não executar; logar e tentar no próximo ciclo.

8. **Documentação de segurança**  
   Atualizar `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md` com: novo canal (GitHub + assinatura), quem pode injetar comandos (quem tem chave de assinatura), e que o agente não executa nada não assinado nem fora da lista de ações.

### Notas

- Latência: depende do intervalo de polling e do GitHub/CDN; geralmente aceitável para comandos do tipo “rodar sync” ou “verificar atualização”.
- Rate limit: GitHub raw/API tem limites; se muitos agentes consultarem o mesmo arquivo, considerar cache/CDN ou arquivo por node/por grupo.

---

*Documento de ideias. Implementação a ser planejada em trilha própria quando for priorizada.*
