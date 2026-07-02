# Entrega — link de acesso remoto por firewall (2026-06-24)

## Resumo

Campo `remote_access_url` por firewall (node) com padrão `https://{ip}:9999`, editável no cadastro e no detalhe do firewall. Coluna **Acesso** com botão **Conectar** no inventário (`/nodes`).

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.6.0` |
| Painel | `1.4.0` |

## Alterações técnicas

- Migration `20260624140000_node_remote_access_url`: coluna `nodes.remote_access_url`.
- API: create/update node aceita `remote_access_url`; listagem e detalhe expõem URL efetiva (override ou derivada de IP WAN / gerenciamento).
- Painel: formulário **Novo firewall** preenche link ao informar IP; aba **Configuração** do detalhe permite editar; inventário com coluna **Acesso**.

## Como testar

1. **Admin → Novo firewall:** selecione cliente, informe IP WAN (ex. `177.38.158.46`) — o campo de link deve preencher `https://177.38.158.46:9999`.
2. Crie o firewall e abra **Firewalls** (`/nodes`): coluna **Acesso** deve mostrar **Conectar** abrindo nova aba.
3. No detalhe do firewall, aba **Configuração**, altere o link (ex. porta diferente) e salve; inventário deve refletir o novo URL.
4. Firewalls existentes com IP WAN/gerenciamento e sem override devem exibir link derivado automaticamente.

## Arquivos principais

- `apps/api/prisma/schema.prisma`
- `apps/api/src/common/remote-access-url.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/nodes/nodes.service.ts`
- `apps/web/components/create-node-form.tsx`
- `apps/web/components/nodes/nodes-inventory-table.tsx`
- `apps/web/components/nodes/node-detail-config-tab.tsx`
