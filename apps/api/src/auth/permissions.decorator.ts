import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permission-keys';

export const PERMISSIONS_METADATA_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
