import { IsOptional, IsString } from 'class-validator';

export class ImportGuestListDto {
  @IsOptional()
  @IsString()
  presentationId?: string; // выбранная презентация (необязательно)
}
