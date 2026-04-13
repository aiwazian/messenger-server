import { ArrayMinSize, IsArray, IsNotEmpty } from 'class-validator'

export class AddMembersDto {
	@IsArray()
	@IsNotEmpty({ each: true })
	@ArrayMinSize(1)
	userIds: string[]
}
