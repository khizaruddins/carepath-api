import { PartialType } from '@nestjs/swagger';
import { RegisterLabDto } from './register-lab.dto';

export class UpdateLabDto extends PartialType(RegisterLabDto) {}
