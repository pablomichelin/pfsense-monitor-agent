import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permission-keys';

export const PERMISSIONS_METADATA_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);

/**
 * C-PG: escape hatch explicito para rotas que legitimamente exigem apenas
 * sessao autenticada (sem permissao RBAC), ex.: "Minha conta", logout, listar/
 * revogar as proprias sessoes. Marca a rota como deliberadamente sem permissao,
 * tornando o default-deny do PermissionsGuard seguro para todas as demais rotas.
 */
export const ALLOW_SESSION_ONLY_METADATA_KEY = 'allow_session_only';

export const AllowSessionOnly = () =>
  SetMetadata(ALLOW_SESSION_ONLY_METADATA_KEY, true);
