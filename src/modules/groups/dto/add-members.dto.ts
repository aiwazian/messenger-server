import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumberString } from 'class-validator'

export class AddMembersDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@IsNumberString({}, { each: true })
	userIds: string[]
}
