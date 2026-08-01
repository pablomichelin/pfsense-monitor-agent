# Proteção absoluta do usuário `admin` do pfSense

**Data:** 2026-08-01  
**Versões:** API **`0.10.3`** · painel **`1.10.7`** · package **`0.5.7`**

## Regra

O usuário local **`admin`** (e **`root`**, por precaução) é exclusivo do appliance pfSense. O Monitor **nunca** pode:

- cadastrar técnico com esse login;
- provisionar / resetar senha / desativar / excluir essa conta nos firewalls.

## Camadas

| Camada | Comportamento |
|---|---|
| Painel | Validação de login rejeita `admin`/`root`; botão de cadastro desabilitado; mensagem explícita |
| API DTO | `@NotIn(['admin','root'])` em `CreateTechnicianDto` |
| API util | `validatePfsenseUsername` / `isReservedPfsenseUsername` → `ForbiddenException` |
| API serviço | Toda provision/reset/revoke (unitário e lote) revalida username do banco antes de enfileirar |
| Enqueue | Payloads `local_user_*` passam por `validateLocalUser*Payload` (mesmo filtro) |
| Agente `0.5.7` | Recusa reserved no payload; após resolve, também bloqueia nome canônico reserved, `scope=system` ou `uid=0` |

## Validação rápida

1. Tentar cadastrar login `admin` no painel → botão inativo / erro amigável.
2. API `POST` com `login_username=admin` → 403/400 reserved.
3. Comando no agente com payload admin → `reserved username` / `cannot modify system account`.
