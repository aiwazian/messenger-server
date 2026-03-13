import { CreateChannelDto } from './create-channel.dto'
import { PartialType } from '@nestjs/mapped-types'

export class UpdateChannelDto extends PartialType(CreateChannelDto) { }
