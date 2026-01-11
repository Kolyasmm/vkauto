/**
 * Стратегии автозалива по целям (objectives)
 *
 * Каждая стратегия изолирована в отдельном файле.
 * При добавлении новой цели - создайте новый файл стратегии,
 * не трогая код существующих стратегий.
 *
 * Пример добавления новой цели:
 * 1. Скопируйте ближайшую по логике стратегию (например social-activity.strategy.ts)
 * 2. Переименуйте класс и файл
 * 3. Измените PACKAGE_ID, OBJECTIVE и логику buildAdGroups
 * 4. Добавьте экспорт в этот index.ts
 */

export { BaseCampaignStrategy } from './base.strategy';
export type { CampaignResult, BaseStrategyConfig } from './base.strategy';

export { SocialActivityStrategy } from './social-activity.strategy';
export type { SocialActivityDto } from './social-activity.strategy';

export { LeadFormStrategy } from './lead-form.strategy';
export type { LeadFormDto } from './lead-form.strategy';

export { AppInstallsStrategy } from './app-installs.strategy';
export type { AppInstallsDto } from './app-installs.strategy';
