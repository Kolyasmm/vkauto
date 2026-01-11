import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AutoUploadService } from './auto-upload.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Controller('auto-upload')
@UseGuards(JwtAuthGuard)
export class AutoUploadController {
  constructor(private readonly autoUploadService: AutoUploadService) {}

  /**
   * Получить креативы (логотипы/изображения) из кабинета VK
   */
  @Get('creatives/:vkAccountId')
  async getCreatives(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getCreatives(req.user.id, vkAccountId);
  }

  /**
   * Получить настройки из существующих групп (package_id, geo, urls)
   */
  @Get('settings/:vkAccountId')
  async getExistingSettings(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('objective') objective: string,
  ) {
    return this.autoUploadService.getExistingSettings(req.user.id, vkAccountId, objective);
  }

  /**
   * Получить доступные пакеты (форматы) для objective
   */
  @Get('packages/:vkAccountId')
  async getPackages(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('objective') objective: string,
  ) {
    return this.autoUploadService.getPackages(req.user.id, vkAccountId, objective);
  }

  /**
   * Получить URL-ссылки из кабинета
   */
  @Get('urls/:vkAccountId')
  async getUrls(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getUrls(req.user.id, vkAccountId);
  }

  /**
   * Получить группы ВКонтакте
   */
  @Get('groups/:vkAccountId')
  async getVkGroups(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getVkGroups(req.user.id, vkAccountId);
  }

  /**
   * Получить сегменты аудитории (ремаркетинг)
   */
  @Get('segments/:vkAccountId')
  async getSegments(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getSegments(req.user.id, vkAccountId);
  }

  /**
   * Получить обычные интересы для таргетинга (Авто, Финансы, и т.д.)
   */
  @Get('interests/:vkAccountId')
  async getInterests(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getInterests(req.user.id, vkAccountId);
  }

  /**
   * Получить соц-дем интересы для таргетинга (доход, занятость, и т.д.)
   */
  @Get('interests-soc-dem/:vkAccountId')
  async getInterestsSocDem(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getInterestsSocDem(req.user.id, vkAccountId);
  }

  /**
   * Получить лид-формы из кабинета
   */
  @Get('lead-forms/:vkAccountId')
  async getLeadForms(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.autoUploadService.getLeadForms(req.user.id, vkAccountId);
  }

  /**
   * Получить логотип сообщества VK и загрузить его в VK Ads
   * Автоматически скачивает аватар группы и загружает как креатив
   */
  @Post('group-logo/:vkAccountId')
  async getGroupLogo(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Body('vkGroupId') vkGroupId: number,
  ) {
    return this.autoUploadService.getGroupLogoAndUpload(
      req.user.id,
      vkAccountId,
      vkGroupId,
    );
  }

  /**
   * Загрузить креативы из библиотеки в VK
   * Принимает массив ID креативов из локальной библиотеки,
   * загружает их в VK и возвращает VK content IDs
   *
   * @param asIcon - если true, загружает как icon_256x256 (для логотипов)
   */
  @Post('upload-library-creatives/:vkAccountId')
  async uploadLibraryCreatives(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Body('libraryCreativeIds') libraryCreativeIds: number[],
    @Body('asIcon') asIcon?: boolean,
  ) {
    const targetContentKey = asIcon ? 'icon_256x256' : 'image_600x600';
    return this.autoUploadService.uploadLibraryCreativesToVk(
      req.user.id,
      vkAccountId,
      libraryCreativeIds,
      targetContentKey,
    );
  }

  /**
   * Создать кампанию с автоматическими настройками
   */
  @Post('create')
  async createCampaign(
    @Request() req,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.autoUploadService.createCampaign(req.user.id, dto);
  }
}
