import { BadRequestException } from '@nestjs/common';
import { PickedSelection } from '../picker/popularity-picker.service';
import { AiLaunchObjective } from '../dto/quick-launch.dto';

interface AssembleParams {
  objective: AiLaunchObjective;
  campaignName: string;
  dailyBudget: number;
  selection: PickedSelection;
  // urlId сообщества (создаётся через VkLauncherClient.createUrl ДО assembly)
  urlId?: number;
}

const DEFAULT_AGE_LIST = (from = 21, to = 50): number[] => {
  const out: number[] = [];
  for (let a = from; a <= to; a++) out.push(a);
  return out;
};

const DEFAULT_FULLTIME = (fromHour = 8, toHour = 23) => {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const hours: number[] = [];
  for (let h = fromHour; h <= toHour; h++) hours.push(h);
  const ft: Record<string, any> = { flags: ['cross_timezone', 'use_holidays_moving'] };
  for (const d of days) ft[d] = hours;
  return ft;
};

function buildTargetings(selection: PickedSelection): Record<string, any> {
  // Если есть сохранённый profile — используем его как базу (но подменяем расписание/возраст на дефолты если их там нет)
  const base = selection.audience?.profile && typeof selection.audience.profile === 'object'
    ? { ...(selection.audience.profile as Record<string, any>) }
    : {};

  if (!base.age) base.age = { age_list: DEFAULT_AGE_LIST() };
  else if (!base.age.age_list && Array.isArray((base as any).age_list)) {
    base.age = { age_list: (base as any).age_list };
  }
  if (!base.geo) base.geo = { regions: [1] };
  if (!base.fulltime) base.fulltime = DEFAULT_FULLTIME();
  return base;
}

export function assembleAdPlanPayload(params: AssembleParams): Record<string, any> {
  const { objective, campaignName, dailyBudget, selection, urlId } = params;

  switch (objective) {
    case AiLaunchObjective.MESSAGES:
      return assembleMessages(campaignName, dailyBudget, selection, urlId!);
    case AiLaunchObjective.LEAD_FORM:
      return assembleLeadForm(campaignName, dailyBudget, selection);
    case AiLaunchObjective.APP_INSTALLS:
      return assembleAppInstalls(campaignName, dailyBudget, selection);
    default:
      throw new BadRequestException(`Неизвестный objective: ${objective}`);
  }
}

function assembleMessages(
  campaignName: string,
  dailyBudget: number,
  s: PickedSelection,
  urlId: number,
): Record<string, any> {
  if (!s.community || !s.title || !s.description || !s.icon || !s.image) {
    throw new BadRequestException('Picker не дал полный набор для socialactivity');
  }
  const isVideo = s.image.contentKey.startsWith('video_');
  const content: Record<string, any> = {
    icon_256x256: { id: Number(s.icon.vkContentId) },
  };
  if (isVideo) {
    content.video_portrait_9_16_30s = { id: Number(s.image.vkContentId) };
    content.video_portrait_9_16_180s = { id: Number(s.image.vkContentId) };
  } else {
    content[s.image.contentKey] = { id: Number(s.image.vkContentId) };
  }

  const textblocks: Record<string, any> = {
    title_40_vkads: { text: clamp(s.title.body, 40) },
    text_2000: { text: clamp(s.description.body, 2000) },
    cta_community_vk: { text: s.cta?.value || 'learnMore' },
  };

  const packageId = s.package?.vkPackageId ?? 3127;
  const objective = 'socialengagement';

  return {
    name: campaignName,
    status: 'blocked',
    objective,
    ad_object_id: String(urlId),
    ad_object_type: 'url',
    ad_groups: [
      {
        name: 'ai/default',
        package_id: packageId,
        objective,
        budget_limit_day: dailyBudget,
        autobidding_mode: 'max_goals',
        targetings: buildTargetings(s),
        age_restrictions: '18+',
        banners: [
          {
            content,
            textblocks,
            urls: { primary: { id: urlId } },
          },
        ],
        enable_utm: true,
        utm: 'ref_source={{banner_id}}&ref=ai_launch',
      },
    ],
  };
}

function assembleLeadForm(
  campaignName: string,
  dailyBudget: number,
  s: PickedSelection,
): Record<string, any> {
  if (!s.leadForm || !s.title || !s.description || !s.cta || !s.icon || !s.image) {
    throw new BadRequestException('Picker не дал полный набор для lead_form');
  }

  const content: Record<string, any> = {
    icon_256x256: { id: Number(s.icon.vkContentId) },
    [s.image.contentKey]: { id: Number(s.image.vkContentId) },
  };

  const textblocks: Record<string, any> = {
    title_40_vkads: { text: clamp(s.title.body, 40) },
    text_90: { text: clamp(s.description.body, 90) },
    text_220: { text: clamp(s.cta.value, 220) },
    cta_leadads: { text: 'get' },
  };

  return {
    name: campaignName,
    status: 'blocked',
    objective: 'lead_ads',
    ad_object_id: String(s.leadForm.vkLeadFormId),
    ad_object_type: 'lead_form',
    ad_groups: [
      {
        name: 'ai/default',
        package_id: 3215,
        objective: 'lead_ads',
        budget_limit_day: dailyBudget,
        autobidding_mode: 'max_goals',
        targetings: buildTargetings(s),
        age_restrictions: '18+',
        banners: [{ content, textblocks }],
        enable_utm: true,
        utm: 'ref_source={{banner_id}}&ref=ai_launch',
      },
    ],
  };
}

function assembleAppInstalls(
  campaignName: string,
  dailyBudget: number,
  s: PickedSelection,
): Record<string, any> {
  if (!s.mobileApp || !s.title || !s.description || !s.cta || !s.icon || !s.image) {
    throw new BadRequestException('Picker не дал полный набор для appinstalls');
  }
  const content: Record<string, any> = {
    icon_256x256_app: { id: Number(s.icon.vkContentId) },
    [s.image.contentKey]: { id: Number(s.image.vkContentId) },
  };

  const textblocks: Record<string, any> = {
    title_40_vkads: { text: clamp(s.title.body, 40) },
    text_90: { text: clamp(s.description.body, 90) },
    text_220: { text: clamp(s.cta.value, 220) },
    cta_apps_full: { text: 'install' },
  };

  return {
    name: campaignName,
    status: 'blocked',
    objective: 'app_install',
    ad_object_id: String(s.mobileApp.vkMobileAppId),
    ad_object_type: 'mobile_app',
    ad_groups: [
      {
        name: 'ai/default',
        objective: 'app_install',
        budget_limit_day: dailyBudget,
        autobidding_mode: 'max_installs',
        targetings: buildTargetings(s),
        age_restrictions: '18+',
        banners: [{ content, textblocks }],
        enable_utm: true,
        utm: 'ref_source={{banner_id}}&ref=ai_launch',
      },
    ],
  };
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
