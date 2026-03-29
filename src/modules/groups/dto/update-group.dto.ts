import { CreateGroupDto } from './create-group.dto'
import { PartialType } from '@nestjs/mapped-types'

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}
