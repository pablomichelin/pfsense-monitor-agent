import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  IsNotIn,
} from 'class-validator';

export class CreateTechnicianDto {
  @IsString()
  full_name!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,31}$/)
  @IsNotIn(['admin', 'root'], {
    message: 'login_username is reserved and cannot be managed',
  })
  login_username!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RevokeTechnicianDto {
  @IsString()
  @IsIn(['CONFIRMAR'])
  confirm!: string;
}

export class DeleteTechnicianRegistryDto {
  @IsString()
  confirm_login_username!: string;
}

export class DeleteTechnicianAccountDto {
  @IsString()
  confirm_hostname!: string;
}

export class FleetRevokeTechnicianDto {
  @IsString()
  @IsIn(['disable', 'delete'])
  action!: 'disable' | 'delete';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsString()
  @IsIn(['CONFIRMAR'])
  confirm!: string;
}

export class BatchRevokeTechnicianDto {
  @IsUUID()
  technician_id!: string;

  @IsString({ each: true })
  node_ids!: string[];

  @IsString()
  @IsIn(['disable', 'delete'])
  action!: 'disable' | 'delete';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsString()
  @IsIn(['CONFIRMAR'])
  confirm!: string;
}

export class BatchProvisionTechnicianDto {
  @IsUUID()
  technician_id!: string;

  @IsString({ each: true })
  node_ids!: string[];

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(['admin_full'])
  privilege_profile?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  /** Default true no painel: enfileira backup antes do provisionamento se necessário. */
  @IsOptional()
  @IsBoolean()
  backup_before_provision?: boolean;

  @IsString()
  @IsIn(['CONFIRMAR'])
  confirm!: string;
}

export class BatchPasswordResetTechnicianDto {
  @IsUUID()
  technician_id!: string;

  @IsString({ each: true })
  node_ids!: string[];

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsString()
  @IsIn(['CONFIRMAR'])
  confirm!: string;
}

export class ProvisionTechnicianAccountDto {
  @IsUUID()
  technician_id!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(['admin_full'])
  privilege_profile?: string;
}

export class PasswordResetTechnicianAccountDto {
  @IsOptional()
  @IsString()
  password?: string;
}
