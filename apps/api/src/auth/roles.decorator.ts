import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLE_METADATA_KEY = 'monitor_pfsense_roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLE_METADATA_KEY, roles);
