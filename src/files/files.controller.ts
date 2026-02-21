import {
  Controller, Post, Get, Patch, Delete,
  Param, Body, UseGuards, UseInterceptors,
  UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload/:userId')
  @RequirePermissions('user_docs.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить документ пользователя' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  upload(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('description') description: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.filesService.upload(userId, file, title, description, adminId);
  }

  @Get(':docId/download')
  @RequirePermissions('user_docs.view')
  @ApiOperation({ summary: 'Скачать документ' })
  async download(@Param('docId') docId: string, @Res({ passthrough: true }) res: Response) {
    const { stream, fileName, mimeType } = await this.filesService.download(docId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
    return stream;
  }

  @Patch(':docId')
  @RequirePermissions('user_docs.upload')
  @ApiOperation({ summary: 'Обновить название/описание документа' })
  updateDetails(
    @Param('docId') docId: string,
    @Body('title') title: string,
    @Body('description') description: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.filesService.updateDetails(docId, title, description, adminId);
  }

  @Delete(':docId')
  @RequirePermissions('user_docs.delete')
  @ApiOperation({ summary: 'Удалить документ' })
  remove(@Param('docId') docId: string, @CurrentUser('id') adminId: string) {
    return this.filesService.remove(docId, adminId);
  }
}
