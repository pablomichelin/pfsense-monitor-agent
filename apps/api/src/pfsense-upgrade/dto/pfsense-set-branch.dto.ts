import { IsIn } from 'class-validator';
import { PFSENSE_UPDATE_BRANCH_TARGETS } from '../pfsense-update-check.util';

export class PfsenseSetBranchDto {
  @IsIn([...PFSENSE_UPDATE_BRANCH_TARGETS])
  target_branch!: (typeof PFSENSE_UPDATE_BRANCH_TARGETS)[number];
}
