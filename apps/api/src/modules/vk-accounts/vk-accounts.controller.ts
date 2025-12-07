import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { VkAccountsService } from './vk-accounts.service';
import { CreateVkAccountDto } from './dto/create-vk-account.dto';
import { UpdateVkAccountDto } from './dto/update-vk-account.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../../common/guards';

@Controller('vk-accounts')
@UseGuards(JwtAuthGuard)
export class VkAccountsController {
  constructor(
    private readonly vkAccountsService: VkAccountsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post()
  create(@Body() createDto: CreateVkAccountDto, @Request() req) {
    return this.vkAccountsService.create(req.user.id, createDto);
  }

  @Get()
  findAll(@Request() req) {
    return this.vkAccountsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.vkAccountsService.findOne(+id, req.user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateVkAccountDto,
    @Request() req,
  ) {
    return this.vkAccountsService.update(+id, req.user.id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.vkAccountsService.remove(+id, req.user.id);
  }

  @Post('validate-token')
  async validateToken(@Body() body: { accessToken: string }) {
    return this.vkAccountsService.validateToken(body.accessToken);
  }

  @Post(':id/test-telegram')
  async testTelegram(@Param('id') id: string, @Request() req) {
    const account = await this.vkAccountsService.findOne(+id, req.user.id);

    if (!account.telegramChatId) {
      throw new BadRequestException('Telegram Chat ID не настроен для этого аккаунта');
    }

    try {
      await this.notificationsService.sendTestMessage(account.telegramChatId);
      return { success: true, message: 'Тестовое сообщение отправлено' };
    } catch (error) {
      throw new BadRequestException('Ошибка отправки сообщения: ' + error.message);
    }
  }

  // ========== SHARING ENDPOINTS ==========

  /**
   * Получить список пользователей, с которыми расшарен аккаунт
   */
  @Get(':id/shared-users')
  getSharedUsers(@Param('id') id: string, @Request() req) {
    return this.vkAccountsService.getSharedUsers(+id, req.user.id);
  }

  /**
   * Предоставить доступ к аккаунту другому пользователю
   */
  @Post(':id/share')
  shareAccount(
    @Param('id') id: string,
    @Body() body: { email: string; canEdit?: boolean },
    @Request() req,
  ) {
    return this.vkAccountsService.shareAccount(+id, req.user.id, body.email, body.canEdit ?? false);
  }

  /**
   * Обновить права доступа пользователя
   */
  @Put(':id/share/:userId')
  updateSharePermissions(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { canEdit: boolean },
    @Request() req,
  ) {
    return this.vkAccountsService.updateSharePermissions(+id, req.user.id, +userId, body.canEdit);
  }

  /**
   * Отозвать доступ у пользователя
   */
  @Delete(':id/share/:userId')
  revokeAccess(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.vkAccountsService.revokeAccess(+id, req.user.id, +userId);
  }
}
