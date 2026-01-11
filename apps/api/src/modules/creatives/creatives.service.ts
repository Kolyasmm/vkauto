import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

@Injectable()
export class CreativesService {
  private readonly logger = new Logger(CreativesService.name);

  constructor(private prisma: PrismaService) {
    // Создаём директорию для загрузок если не существует
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      this.logger.log(`Created upload directory: ${UPLOAD_DIR}`);
    }
  }

  /**
   * Получить все креативы пользователя
   */
  async getCreatives(userId: number, folderId?: number) {
    const where: any = { userId };
    if (folderId !== undefined) {
      where.folderId = folderId || null;
    }

    return this.prisma.creative.findMany({
      where,
      include: {
        folder: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить креатив по ID
   */
  async getCreative(userId: number, id: number) {
    const creative = await this.prisma.creative.findFirst({
      where: { id, userId },
      include: { folder: true },
    });

    if (!creative) {
      throw new NotFoundException('Креатив не найден');
    }

    return creative;
  }

  /**
   * Загрузить креатив
   */
  async uploadCreative(
    userId: number,
    file: Express.Multer.File,
    folderId?: number,
    name?: string,
  ) {
    this.logger.log(`Uploading creative for user ${userId}: ${file.originalname}`);

    // Проверяем папку если указана
    if (folderId) {
      const folder = await this.prisma.creativeFolder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        throw new NotFoundException('Папка не найдена');
      }
    }

    // Генерируем уникальное имя файла
    const ext = path.extname(file.originalname);
    const filename = `${userId}_${Date.now()}${ext}`;
    const storagePath = path.join(UPLOAD_DIR, filename);

    // Сохраняем файл
    fs.writeFileSync(storagePath, file.buffer);

    // Получаем размеры изображения
    let width: number | undefined;
    let height: number | undefined;

    if (file.mimetype.startsWith('image/')) {
      try {
        const metadata = await sharp(file.buffer).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch (e) {
        this.logger.warn(`Could not get image dimensions: ${e.message}`);
      }
    }

    // Создаём запись в БД
    const creative = await this.prisma.creative.create({
      data: {
        userId,
        folderId: folderId || null,
        filename: file.originalname,
        storagePath: filename, // Храним только имя файла
        mimeType: file.mimetype,
        fileSize: file.size,
        width,
        height,
        name: name || file.originalname,
      },
      include: { folder: true },
    });

    this.logger.log(`Creative uploaded: ${creative.id}`);
    return creative;
  }

  /**
   * Загрузить несколько креативов
   */
  async uploadCreatives(
    userId: number,
    files: Express.Multer.File[],
    folderId?: number,
  ) {
    const results = [];
    for (const file of files) {
      try {
        const creative = await this.uploadCreative(userId, file, folderId);
        results.push(creative);
      } catch (e) {
        this.logger.error(`Failed to upload ${file.originalname}: ${e.message}`);
      }
    }
    return results;
  }

  /**
   * Обновить креатив
   */
  async updateCreative(
    userId: number,
    id: number,
    data: { name?: string; description?: string; folderId?: number | null },
  ) {
    const creative = await this.prisma.creative.findFirst({
      where: { id, userId },
    });

    if (!creative) {
      throw new NotFoundException('Креатив не найден');
    }

    // Проверяем папку если указана
    if (data.folderId) {
      const folder = await this.prisma.creativeFolder.findFirst({
        where: { id: data.folderId, userId },
      });
      if (!folder) {
        throw new NotFoundException('Папка не найдена');
      }
    }

    return this.prisma.creative.update({
      where: { id },
      data,
      include: { folder: true },
    });
  }

  /**
   * Удалить креатив
   */
  async deleteCreative(userId: number, id: number) {
    const creative = await this.prisma.creative.findFirst({
      where: { id, userId },
    });

    if (!creative) {
      throw new NotFoundException('Креатив не найден');
    }

    // Удаляем файл с диска
    const filePath = path.join(UPLOAD_DIR, creative.storagePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Удаляем запись из БД
    await this.prisma.creative.delete({ where: { id } });

    return { success: true };
  }

  /**
   * Удалить несколько креативов
   */
  async deleteCreatives(userId: number, ids: number[]) {
    for (const id of ids) {
      try {
        await this.deleteCreative(userId, id);
      } catch (e) {
        this.logger.error(`Failed to delete creative ${id}: ${e.message}`);
      }
    }
    return { success: true, deleted: ids.length };
  }

  /**
   * Получить путь к файлу креатива
   */
  async getCreativeFilePath(userId: number, id: number): Promise<string> {
    const creative = await this.prisma.creative.findFirst({
      where: { id, userId },
    });

    if (!creative) {
      throw new NotFoundException('Креатив не найден');
    }

    const filePath = path.join(UPLOAD_DIR, creative.storagePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }

    return filePath;
  }

  /**
   * Получить буфер файла креатива (для загрузки в VK)
   */
  async getCreativeBuffer(userId: number, id: number): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
    width?: number;
    height?: number;
  }> {
    const creative = await this.prisma.creative.findFirst({
      where: { id, userId },
    });

    if (!creative) {
      throw new NotFoundException('Креатив не найден');
    }

    const filePath = path.join(UPLOAD_DIR, creative.storagePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Файл не найден');
    }

    const buffer = fs.readFileSync(filePath);
    return {
      buffer,
      mimeType: creative.mimeType,
      filename: creative.filename,
      width: creative.width ?? undefined,
      height: creative.height ?? undefined,
    };
  }

  // ===== FOLDERS =====

  /**
   * Получить все папки пользователя
   */
  async getFolders(userId: number) {
    return this.prisma.creativeFolder.findMany({
      where: { userId },
      include: {
        _count: {
          select: { creatives: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Создать папку
   */
  async createFolder(userId: number, name: string) {
    return this.prisma.creativeFolder.create({
      data: { userId, name },
      include: {
        _count: {
          select: { creatives: true },
        },
      },
    });
  }

  /**
   * Переименовать папку
   */
  async renameFolder(userId: number, id: number, name: string) {
    const folder = await this.prisma.creativeFolder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      throw new NotFoundException('Папка не найдена');
    }

    return this.prisma.creativeFolder.update({
      where: { id },
      data: { name },
      include: {
        _count: {
          select: { creatives: true },
        },
      },
    });
  }

  /**
   * Удалить папку (креативы перемещаются в корень)
   */
  async deleteFolder(userId: number, id: number) {
    const folder = await this.prisma.creativeFolder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      throw new NotFoundException('Папка не найдена');
    }

    // Перемещаем креативы в корень
    await this.prisma.creative.updateMany({
      where: { folderId: id, userId },
      data: { folderId: null },
    });

    // Удаляем папку
    await this.prisma.creativeFolder.delete({ where: { id } });

    return { success: true };
  }
}
