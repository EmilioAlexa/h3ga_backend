import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles' as const;

export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles);
