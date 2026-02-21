import {
  Injectable, NotFoundException, BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

@Injectable()
export class FilesService {
  private uploadDir: string;
  private maxFiles: number;

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get('UPLOAD_DIR') || './uploads';
    this.maxFiles = parseInt(this.configService.get('MAX_FILES_PER_USER') || '15');
  }

  async upload(
    userId: string,
    file: Express.Multer.File,
    title: string,
    description: string | undefined,
    adminId: string,
  ) {
    // Проверяем лимит файлов
    const count = await this.prisma.userDocument.count({ where: { userId } });
    if (count >= this.maxFiles) {
      throw new BadRequestException(`Максимум ${this.maxFiles} файлов`);
    }

    // Проверяем MIME type
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Допустимы только изображения и PDF');
    }

    // Сохраняем файл
    const userDir = path.join(this.uploadDir, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const ext = path.extname(file.originalname);
    const savedName = `${uuid()}${ext}`;
    const filePath = path.join(userDir, savedName);

    fs.writeFileSync(filePath, file.buffer);

    const doc = await this.prisma.userDocument.create({
      data: {
        userId,
        title,
        description,
        fileName: file.originalname,
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.document_uploaded',
      entity: 'user_document',
      entityId: doc.id,
      details: { userId, title, fileName: file.originalname },
    });

    return {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
    };
  }

  async download(docId: string) {
    const doc = await this.prisma.userDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Файл не найден');

    if (!fs.existsSync(doc.filePath)) {
      throw new NotFoundException('Файл не найден на диске');
    }

    const file = fs.createReadStream(doc.filePath);
    return {
      stream: new StreamableFile(file),
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }

  async updateDetails(docId: string, title: string, description: string | undefined, adminId: string) {
    const doc = await this.prisma.userDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Файл не найден');

    const updated = await this.prisma.userDocument.update({
      where: { id: docId },
      data: { title, description },
    });

    await this.auditService.log({
      userId: adminId,
      action: 'user.document_updated',
      entity: 'user_document',
      entityId: docId,
      details: { title, description },
    });

    return updated;
  }

  async remove(docId: string, adminId: string) {
    const doc = await this.prisma.userDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Файл не найден');

    // Удаляем файл с диска
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }

    await this.prisma.userDocument.delete({ where: { id: docId } });

    await this.auditService.log({
      userId: adminId,
      action: 'user.document_deleted',
      entity: 'user_document',
      entityId: docId,
      details: { userId: doc.userId, fileName: doc.fileName },
    });
  }
}
