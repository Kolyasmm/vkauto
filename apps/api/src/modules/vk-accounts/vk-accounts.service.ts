import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVkAccountDto } from './dto/create-vk-account.dto';
import { UpdateVkAccountDto } from './dto/update-vk-account.dto';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class VkAccountsService {
  private readonly logger = new Logger(VkAccountsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Создать хеш токена для проверки дубликатов
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

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

    const tokenHash = this.hashToken(dto.accessToken);

    // Проверяем, не привязан ли уже этот токен
    const existingAccount = await this.prisma.vkAccount.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { email: true } },
      },
    });

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        throw new ConflictException('Этот кабинет уже привязан к вашему аккаунту');
      }
      throw new ConflictException(
        `Этот кабинет уже привязан к другому пользователю. Попросите владельца (${existingAccount.user.email}) предоставить вам доступ через настройки кабинета.`
      );
    }

    return this.prisma.vkAccount.create({
      data: {
        userId,
        name: dto.name,
        accessToken: dto.accessToken,
        tokenHash,
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
   * Получить все VK аккаунты пользователя (включая расшаренные)
   */
  async findAll(userId: number) {
    // Собственные аккаунты
    const ownAccounts = await this.prisma.vkAccount.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        telegramChatId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        _count: { select: { rules: true, sharedWith: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Расшаренные аккаунты
    const sharedAccounts = await this.prisma.vkAccountShare.findMany({
      where: { sharedWithUserId: userId },
      include: {
        vkAccount: {
          select: {
            id: true,
            name: true,
            telegramChatId: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: { select: { email: true } },
            _count: { select: { rules: true } },
          },
        },
      },
    });

    return [
      ...ownAccounts.map((acc) => ({
        ...acc,
        isOwner: true,
        isShared: false,
        sharedCount: acc._count.sharedWith,
      })),
      ...sharedAccounts.map((share) => ({
        ...share.vkAccount,
        isOwner: false,
        isShared: true,
        canEdit: share.canEdit,
        ownerEmail: share.vkAccount.user.email,
      })),
    ];
  }

  /**
   * Получить VK аккаунт по ID (проверка доступа: владелец или расшарен)
   */
  async findOne(id: number, userId: number) {
    // Сначала проверяем, владелец ли пользователь
    const account = await this.prisma.vkAccount.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        telegramChatId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        _count: { select: { rules: true, sharedWith: true } },
      },
    });

    if (account) {
      return { ...account, isOwner: true };
    }

    // Проверяем, есть ли доступ через шаринг
    const share = await this.prisma.vkAccountShare.findUnique({
      where: {
        vkAccountId_sharedWithUserId: { vkAccountId: id, sharedWithUserId: userId },
      },
      include: {
        vkAccount: {
          select: {
            id: true,
            name: true,
            telegramChatId: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: { select: { email: true } },
            _count: { select: { rules: true } },
          },
        },
      },
    });

    if (share) {
      return {
        ...share.vkAccount,
        isOwner: false,
        canEdit: share.canEdit,
        ownerEmail: share.vkAccount.user.email,
      };
    }

    throw new NotFoundException(`VK аккаунт с ID ${id} не найден или нет доступа`);
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
   * Обновить VK аккаунт (только владелец)
   */
  async update(id: number, userId: number, dto: UpdateVkAccountDto) {
    const account = await this.prisma.vkAccount.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`VK аккаунт с ID ${id} не найден или вы не являетесь владельцем`);
    }

    // Если обновляется токен - проверяем его и хеш
    let tokenHash = account.tokenHash;
    if (dto.accessToken) {
      const validation = await this.validateToken(dto.accessToken);
      if (!validation.valid) {
        throw new BadRequestException(`Невалидный токен VK Ads API: ${validation.error}`);
      }
      tokenHash = this.hashToken(dto.accessToken);

      // Проверяем, не занят ли новый токен
      const existingWithHash = await this.prisma.vkAccount.findFirst({
        where: { tokenHash, id: { not: id } },
      });
      if (existingWithHash) {
        throw new ConflictException('Этот токен уже используется другим аккаунтом');
      }
    }

    return this.prisma.vkAccount.update({
      where: { id },
      data: {
        ...dto,
        tokenHash: dto.accessToken ? tokenHash : undefined,
      },
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
   * Удалить VK аккаунт (только владелец)
   */
  async remove(id: number, userId: number) {
    const account = await this.prisma.vkAccount.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`VK аккаунт с ID ${id} не найден или вы не являетесь владельцем`);
    }

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

  // ========== SHARING ==========

  /**
   * Предоставить доступ к аккаунту другому пользователю
   */
  async shareAccount(vkAccountId: number, ownerId: number, shareWithEmail: string, canEdit: boolean = false) {
    // Проверяем, что это аккаунт владельца
    const account = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException('VK аккаунт не найден или вы не являетесь владельцем');
    }

    // Находим пользователя по email
    const targetUser = await this.prisma.user.findUnique({
      where: { email: shareWithEmail },
    });

    if (!targetUser) {
      throw new NotFoundException(`Пользователь с email ${shareWithEmail} не найден`);
    }

    if (targetUser.id === ownerId) {
      throw new BadRequestException('Нельзя предоставить доступ самому себе');
    }

    // Проверяем, не расшарен ли уже
    const existingShare = await this.prisma.vkAccountShare.findUnique({
      where: {
        vkAccountId_sharedWithUserId: { vkAccountId, sharedWithUserId: targetUser.id },
      },
    });

    if (existingShare) {
      throw new ConflictException('Доступ уже предоставлен этому пользователю');
    }

    await this.prisma.vkAccountShare.create({
      data: {
        vkAccountId,
        sharedWithUserId: targetUser.id,
        canEdit,
      },
    });

    return { message: `Доступ предоставлен пользователю ${shareWithEmail}` };
  }

  /**
   * Отозвать доступ к аккаунту
   */
  async revokeAccess(vkAccountId: number, ownerId: number, revokeFromUserId: number) {
    // Проверяем, что это аккаунт владельца
    const account = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException('VK аккаунт не найден или вы не являетесь владельцем');
    }

    const deleted = await this.prisma.vkAccountShare.deleteMany({
      where: { vkAccountId, sharedWithUserId: revokeFromUserId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Доступ не найден');
    }

    return { message: 'Доступ отозван' };
  }

  /**
   * Получить список пользователей, с которыми расшарен аккаунт
   */
  async getSharedUsers(vkAccountId: number, ownerId: number) {
    // Проверяем, что это аккаунт владельца
    const account = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException('VK аккаунт не найден или вы не являетесь владельцем');
    }

    const shares = await this.prisma.vkAccountShare.findMany({
      where: { vkAccountId },
      include: {
        sharedWithUser: {
          select: { id: true, email: true },
        },
      },
    });

    return shares.map((share) => ({
      userId: share.sharedWithUser.id,
      email: share.sharedWithUser.email,
      canEdit: share.canEdit,
      sharedAt: share.createdAt,
    }));
  }

  /**
   * Обновить права доступа
   */
  async updateSharePermissions(vkAccountId: number, ownerId: number, targetUserId: number, canEdit: boolean) {
    // Проверяем, что это аккаунт владельца
    const account = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException('VK аккаунт не найден или вы не являетесь владельцем');
    }

    const updated = await this.prisma.vkAccountShare.updateMany({
      where: { vkAccountId, sharedWithUserId: targetUserId },
      data: { canEdit },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Доступ не найден');
    }

    return { message: 'Права обновлены' };
  }
}
