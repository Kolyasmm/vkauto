import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Res,
  ParseIntPipe,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreativesService } from './creatives.service';

@Controller('creatives')
export class CreativesController {
  constructor(
    private creativesService: CreativesService,
    private jwtService: JwtService,
  ) {}

  /**
   * Получить все креативы
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getCreatives(
    @Request() req,
    @Query('folderId') folderId?: string,
  ) {
    const folderIdNum = folderId ? parseInt(folderId, 10) : undefined;
    return this.creativesService.getCreatives(req.user.id, folderIdNum);
  }

  /**
   * Получить файл креатива (для отображения)
   * Поддерживает авторизацию через:
   * - Bearer token в заголовке Authorization
   * - token в query параметре
   */
  @Get(':id/file')
  async getCreativeFile(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('token') queryToken: string,
    @Res() res: Response,
  ) {
    let userId: number;

    // Пробуем получить токен из заголовка или query
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || queryToken;

    if (!token) {
      throw new UnauthorizedException('Токен не предоставлен');
    }

    try {
      const payload = this.jwtService.verify(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }

    const filePath = await this.creativesService.getCreativeFilePath(userId, id);
    return res.sendFile(filePath);
  }

  /**
   * Получить креатив по ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getCreative(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.creativesService.getCreative(req.user.id, id);
  }

  /**
   * Загрузить один креатив
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
      fileFilter: (req, file, cb) => {
        // Разрешаем изображения и видео
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(new Error('Only images and videos are allowed'), false);
        }
      },
    }),
  )
  async uploadCreative(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
    @Body('name') name?: string,
  ) {
    const folderIdNum = folderId ? parseInt(folderId, 10) : undefined;
    return this.creativesService.uploadCreative(req.user.id, file, folderIdNum, name);
  }

  /**
   * Загрузить несколько креативов
   */
  @Post('upload-multiple')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per file
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
          cb(null, true);
        } else {
          cb(new Error('Only images and videos are allowed'), false);
        }
      },
    }),
  )
  async uploadCreatives(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folderId') folderId?: string,
  ) {
    const folderIdNum = folderId ? parseInt(folderId, 10) : undefined;
    return this.creativesService.uploadCreatives(req.user.id, files, folderIdNum);
  }

  /**
   * Обновить креатив
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateCreative(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string; folderId?: number | null },
  ) {
    return this.creativesService.updateCreative(req.user.id, id, body);
  }

  /**
   * Удалить креатив
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteCreative(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.creativesService.deleteCreative(req.user.id, id);
  }

  /**
   * Удалить несколько креативов
   */
  @Post('delete-multiple')
  @UseGuards(JwtAuthGuard)
  async deleteCreatives(
    @Request() req,
    @Body('ids') ids: number[],
  ) {
    return this.creativesService.deleteCreatives(req.user.id, ids);
  }

  // ===== FOLDERS =====

  /**
   * Получить все папки
   */
  @Get('folders/list')
  @UseGuards(JwtAuthGuard)
  async getFolders(@Request() req) {
    return this.creativesService.getFolders(req.user.id);
  }

  /**
   * Создать папку
   */
  @Post('folders')
  @UseGuards(JwtAuthGuard)
  async createFolder(
    @Request() req,
    @Body('name') name: string,
  ) {
    return this.creativesService.createFolder(req.user.id, name);
  }

  /**
   * Переименовать папку
   */
  @Put('folders/:id')
  @UseGuards(JwtAuthGuard)
  async renameFolder(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
  ) {
    return this.creativesService.renameFolder(req.user.id, id, name);
  }

  /**
   * Удалить папку
   */
  @Delete('folders/:id')
  @UseGuards(JwtAuthGuard)
  async deleteFolder(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.creativesService.deleteFolder(req.user.id, id);
  }
}
