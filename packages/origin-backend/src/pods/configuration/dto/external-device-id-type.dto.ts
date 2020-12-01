import { ExternalDeviceIdType } from '@energyweb/origin-backend-core';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExternalDeviceIdTypeDTO implements ExternalDeviceIdType {
    @ApiProperty({ type: String })
    @IsNotEmpty()
    @IsString()
    type: string;

    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    autogenerated?: boolean;

    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    required?: boolean;
}