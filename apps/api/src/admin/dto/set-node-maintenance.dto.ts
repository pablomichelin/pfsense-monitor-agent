import { IsBoolean } from 'class-validator';

export class SetNodeMaintenanceDto {
  @IsBoolean()
  maintenance_mode!: boolean;
}
