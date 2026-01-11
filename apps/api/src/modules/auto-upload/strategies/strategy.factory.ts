import { BadRequestException } from '@nestjs/common';
import { BaseCampaignStrategy } from './base.strategy';
import { SocialActivityStrategy } from './social-activity.strategy';
import { LeadFormStrategy } from './lead-form.strategy';
import { AppInstallsStrategy } from './app-installs.strategy';

/**
 * Фабрика стратегий автозалива
 *
 * Выбирает нужную стратегию по objective и инициализирует её.
 * При добавлении новой цели - добавьте case в switch.
 */
export class CampaignStrategyFactory {
  /**
   * Получить стратегию по типу цели
   */
  static getStrategy(objective: string): BaseCampaignStrategy {
    switch (objective) {
      case 'socialactivity':
        return new SocialActivityStrategy();

      case 'lead_form':
        return new LeadFormStrategy();

      case 'appinstalls':
        return new AppInstallsStrategy();

      default:
        throw new BadRequestException(`Неизвестный тип цели: ${objective}`);
    }
  }

  /**
   * Получить маппинг objective на VK API objective и package_id
   */
  static getObjectiveConfig(objective: string): { vkObjective: string; packageId: number } {
    const mapping: Record<string, { vkObjective: string; packageId: number }> = {
      'socialactivity': { vkObjective: 'socialengagement', packageId: 3127 },
      'lead_form': { vkObjective: 'leadads', packageId: 3215 },
      'appinstalls': { vkObjective: 'appinstalls', packageId: 2861 },
    };

    const config = mapping[objective];
    if (!config) {
      throw new BadRequestException(`Неизвестный тип цели: ${objective}`);
    }

    return config;
  }
}
