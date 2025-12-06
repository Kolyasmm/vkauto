import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVkAccountDto } from './dto/create-vk-account.dto';
import { UpdateVkAccountDto } from './dto/update-vk-account.dto';
import axios from 'axios';

@Injectable()
export class VkAccountsService {
  private readonly logger = new Logger(VkAccountsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Проверить валидность токена VK Ads API
   */
  async validateToken(accessToken: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await axios.get('https://ads.vk.com/api/v2/user.json', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });

      if (response.data?.error) {
        return { valid: false, error: response.data.error.message };
      }

      return { valid: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Создать новый VK аккаунт
   */
  async create(userId: number, dto: CreateVkAccountDto) {
    // Проверяем токен перед сохранением
    const validation = await this.validateToken(dto.accessToken);
    if (!validation.valid) {
      throw new BadRequestException(`Невалидный токен VK Ads API: ${validation.error}`);
    }

    return this.prisma.vkAccount.create({
      data: {
        userId,
        name: dto.name,
        accessToken: dto.accessToken,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rules: true } },
      },
    });
  }

  /**
   * Получить все VK аккаунты пользователя
   */
  async findAll(userId: number) {
    return this.prisma.vkAccount.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        telegramChatId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rules: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Получить VK аккаунт по ID
   */
  async findOne(id: number, userId: number) {
    const account = await this.prisma.vkAccount.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        telegramChatId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rules: true } },
      },
    });

    if (!account) {
      throw new NotFoundException(`VK аккаунт с ID ${id} не найден`);
    }

    return account;
  }

  /**
   * Получить VK аккаунт с токеном (для внутреннего использования)
   */
  async findOneWithToken(id: number) {
    const account = await this.prisma.vkAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException(`VK аккаунт с ID ${id} не найден`);
    }

    return account;
  }

  /**
   * Обновить VK аккаунт
   */
  async update(id: number, userId: number, dto: UpdateVkAccountDto) {
    await this.findOne(id, userId);

    // Если обновляется токен - проверяем его
    if (dto.accessToken) {
      const validation = await this.validateToken(dto.accessToken);
      if (!validation.valid) {
        throw new BadRequestException(`Невалидный токен VK Ads API: ${validation.error}`);
      }
    }

    return this.prisma.vkAccount.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        telegramChatId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { rules: true } },
      },
    });
  }

  /**
   * Удалить VK аккаунт
   */
  async remove(id: number, userId: number) {
    const account = await this.findOne(id, userId);

    // Проверяем, нет ли связанных правил
    const rulesCount = await this.prisma.rule.count({
      where: { vkAccountId: id },
    });

    if (rulesCount > 0) {
      throw new BadRequestException(
        `Невозможно удалить аккаунт: с ним связано ${rulesCount} правил. Сначала удалите или переназначьте правила.`
      );
    }

    await this.prisma.vkAccount.delete({
      where: { id },
    });

    return { message: 'VK аккаунт успешно удалён' };
  }
}
