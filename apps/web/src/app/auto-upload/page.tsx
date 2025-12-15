'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  MessageSquare,
  Smartphone,
} from 'lucide-react'

type Objective = 'socialactivity' | 'app_installs'

interface Creative {
  id: number
  type: string
  contentKey: string
  previewUrl: string
  width?: number
  height?: number
}

interface ExistingSettings {
  packageId: number
  objective: string
  geoRegions: number[]
  urlId?: number
}

const CALL_TO_ACTIONS = [
  { value: 'read_more', label: 'Подробнее' },
  { value: 'write', label: 'Написать' },
  { value: 'apply', label: 'Подать заявку' },
  { value: 'register', label: 'Зарегистрироваться' },
  { value: 'get', label: 'Получить' },
  { value: 'download', label: 'Скачать' },
  { value: 'install', label: 'Установить' },
  { value: 'open', label: 'Открыть' },
  { value: 'buy', label: 'Купить' },
  { value: 'order', label: 'Заказать' },
]

export default function AutoUploadPage() {
  const { currentAccount } = useVkAccount()

  // Выбор цели
  const [objective, setObjective] = useState<Objective>('socialactivity')

  // Основные поля
  const [campaignName, setCampaignName] = useState('')
  const [dailyBudget, setDailyBudget] = useState(500)
  const [selectedLogoId, setSelectedLogoId] = useState<number | null>(null) // Логотип (один)
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<number[]>([]) // Картинки/видео (много)

  // Поля для "Сообщения"
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [callToAction, setCallToAction] = useState('read_more')
  const [vkGroupId, setVkGroupId] = useState(() => {
    // Загружаем сохранённый ID группы из localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vk_group_id') || ''
    }
    return ''
  })

  // Поля для "Приложения"
  const [shortDescription, setShortDescription] = useState('')
  const [longDescription, setLongDescription] = useState('')
  const [buttonText, setButtonText] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')

  // Дата начала показа (для запланированных кампаний)
  const [startDate, setStartDate] = useState<string>('') // формат YYYY-MM-DD

  // Новые поля: сегменты, интересы, названия, рекламодатель
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
  const [selectedInterestIds, setSelectedInterestIds] = useState<number[]>([])
  const [adGroupName, setAdGroupName] = useState('')
  const [advertiserName, setAdvertiserName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('advertiser_name') || 'ООО "ЛИДСТЕХ"'
    }
    return 'ООО "ЛИДСТЕХ"'
  })
  const [advertiserInn, setAdvertiserInn] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('advertiser_inn') || '6316264152'
    }
    return '6316264152'
  })

  // Результат
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)

  // Загрузка креативов
  const { data: creatives = [], isLoading: creativesLoading } = useQuery({
    queryKey: ['auto-upload-creatives', currentAccount?.id, objective],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/creatives/${currentAccount.id}?objective=${objective}`)
      return res.data as Creative[]
    },
    enabled: !!currentAccount?.id,
  })

  // Загрузка существующих настроек
  const { data: existingSettings } = useQuery({
    queryKey: ['auto-upload-settings', currentAccount?.id, objective],
    queryFn: async () => {
      if (!currentAccount?.id) return null
      const res = await api.get(`/auto-upload/settings/${currentAccount.id}?objective=${objective}`)
      return res.data as ExistingSettings | null
    },
    enabled: !!currentAccount?.id,
  })

  // Загрузка сегментов аудитории
  const { data: segments = [] } = useQuery({
    queryKey: ['auto-upload-segments', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/segments/${currentAccount.id}`)
      return res.data as Array<{ id: number; name: string }>
    },
    enabled: !!currentAccount?.id,
  })

  // Загрузка интересов для таргетинга
  const { data: interests = [] } = useQuery({
    queryKey: ['auto-upload-interests', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/interests/${currentAccount.id}`)
      return res.data as Array<{ id: number; name: string; children?: Array<{ id: number; name: string }> }>
    },
    enabled: !!currentAccount?.id,
  })

  // Сохраняем ID группы в localStorage при изменении
  const handleVkGroupIdChange = (value: string) => {
    const numericValue = value.replace(/\D/g, '')
    setVkGroupId(numericValue)
    if (typeof window !== 'undefined' && numericValue) {
      localStorage.setItem('vk_group_id', numericValue)
    }
  }

  // Сохраняем рекламодателя в localStorage при изменении
  const handleAdvertiserNameChange = (value: string) => {
    setAdvertiserName(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem('advertiser_name', value)
    }
  }

  const handleAdvertiserInnChange = (value: string) => {
    setAdvertiserInn(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem('advertiser_inn', value)
    }
  }

  // Toggle сегмента аудитории
  const toggleSegment = (segmentId: number) => {
    setSelectedSegmentIds(prev => {
      if (prev.includes(segmentId)) {
        return prev.filter(id => id !== segmentId)
      }
      return [...prev, segmentId]
    })
  }

  // Toggle интереса для таргетинга
  const toggleInterest = (interestId: number) => {
    setSelectedInterestIds(prev => {
      if (prev.includes(interestId)) {
        return prev.filter(id => id !== interestId)
      }
      return [...prev, interestId]
    })
  }

  // Функция toggle креатива (мульти-выбор до 10)
  const toggleCreative = (creativeId: number) => {
    setSelectedCreativeIds(prev => {
      if (prev.includes(creativeId)) {
        return prev.filter(id => id !== creativeId)
      }
      if (prev.length >= 10) {
        return prev // максимум 10
      }
      return [...prev, creativeId]
    })
  }

  // Создание кампании
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount?.id || !selectedLogoId || selectedCreativeIds.length === 0) {
        throw new Error('Выберите аккаунт, логотип и хотя бы один креатив')
      }

      // Собираем contentKey для каждого выбранного креатива (в том же порядке)
      const creativeContentKeys = selectedCreativeIds.map(id => {
        const creative = creatives.find(c => c.id === id)
        return creative?.contentKey || 'video_portrait_9_16_30s'
      })

      const payload: any = {
        vkAccountId: currentAccount.id,
        campaignName,
        objective,
        dailyBudget,
        packageId: existingSettings?.packageId,
        geoRegions: existingSettings?.geoRegions,
        urlId: existingSettings?.urlId,
        creativeIds: selectedCreativeIds, // Картинки/видео для создания групп
        creativeContentKeys, // Типы контента для каждого креатива
        // Новые поля
        segmentIds: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
        interestIds: selectedInterestIds.length > 0 ? selectedInterestIds : undefined,
        adGroupName: adGroupName.trim() || undefined,
        advertiserName: advertiserName.trim() || undefined,
        advertiserInn: advertiserInn.trim() || undefined,
        // Дата начала показа (для запланированных кампаний)
        dateStart: startDate || undefined,
      }

      if (objective === 'socialactivity') {
        payload.vkGroupId = vkGroupId ? Number(vkGroupId) : null
        payload.messagesBanner = {
          creativeId: selectedLogoId,
          title,
          description,
          callToAction,
        }
      } else {
        payload.appInstallsBanner = {
          creativeId: selectedLogoId,
          title,
          shortDescription,
          longDescription,
          buttonText,
          trackingUrl,
          callToAction,
        }
      }

      const res = await api.post('/auto-upload/create', payload)
      return res.data
    },
    onSuccess: (data) => {
      setResult({
        success: true,
        message: `Кампания создана! ID: ${data.campaignId}, Групп: ${data.adGroupIds?.length || 1}, Баннеров: ${data.bannerIds?.length || 1}`,
        data,
      })
    },
    onError: (error: any) => {
      setResult({
        success: false,
        message: error.response?.data?.message || error.message || 'Ошибка создания кампании',
      })
    },
  })

  // Сброс полей при смене objective
  useEffect(() => {
    setSelectedLogoId(null)
    setSelectedCreativeIds([])
    setTitle('')
    setDescription('')
    setShortDescription('')
    setLongDescription('')
    setButtonText('')
    setTrackingUrl('')
    setResult(null)
  }, [objective])

  const handleCreate = () => {
    if (!selectedLogoId) {
      setResult({ success: false, message: 'Выберите логотип (256x256)' })
      return
    }
    if (selectedCreativeIds.length === 0) {
      setResult({ success: false, message: 'Выберите хотя бы один креатив (картинку/видео)' })
      return
    }
    if (!campaignName.trim()) {
      setResult({ success: false, message: 'Введите название кампании' })
      return
    }
    if (!title.trim()) {
      setResult({ success: false, message: 'Введите заголовок' })
      return
    }

    if (objective === 'socialactivity') {
      if (!description.trim()) {
        setResult({ success: false, message: 'Введите описание' })
        return
      }
      if (!vkGroupId.trim()) {
        setResult({ success: false, message: 'Введите ID группы VK' })
        return
      }
    }

    if (objective === 'app_installs') {
      if (!shortDescription.trim()) {
        setResult({ success: false, message: 'Введите короткое описание' })
        return
      }
      if (!longDescription.trim()) {
        setResult({ success: false, message: 'Введите длинное описание' })
        return
      }
      if (!trackingUrl.trim()) {
        setResult({ success: false, message: 'Введите трекинговую ссылку' })
        return
      }
    }

    createMutation.mutate()
  }

  if (!currentAccount) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-yellow-400">Выберите VK аккаунт для работы</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2">
          <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
          Автозалив кампаний
        </h1>

        {/* Выбор цели */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Цель рекламной кампании</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={() => setObjective('socialactivity')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                objective === 'socialactivity'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <MessageSquare className={`w-8 h-8 ${objective === 'socialactivity' ? 'text-blue-400' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-medium ${objective === 'socialactivity' ? 'text-blue-400' : 'text-white'}`}>
                  Отправка сообщений
                </p>
                <p className="text-sm text-gray-400">socialactivity</p>
              </div>
            </button>

            <button
              onClick={() => setObjective('app_installs')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                objective === 'app_installs'
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <Smartphone className={`w-8 h-8 ${objective === 'app_installs' ? 'text-green-400' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-medium ${objective === 'app_installs' ? 'text-green-400' : 'text-white'}`}>
                  Установка приложений
                </p>
                <p className="text-sm text-gray-400">app_installs</p>
              </div>
            </button>
          </div>
        </div>

        {/* Основные настройки */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Основные настройки</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Название кампании *</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Моя кампания"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Дневной бюджет группы (руб)</label>
              <input
                type="number"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                min={100}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </div>

          {/* Дата начала показа */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">
              Дата начала показа <span className="text-gray-500">(опционально)</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full sm:w-auto px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              {startDate
                ? `Кампания запустится ${new Date(startDate).toLocaleDateString('ru-RU')}`
                : 'Оставьте пустым для запуска сразу после создания'
              }
            </p>
          </div>

          {existingSettings && (
            <div className="text-sm text-gray-400 bg-gray-700/50 rounded-lg p-3">
              <p>Настройки определены автоматически:</p>
              <p>Формат: {existingSettings.packageId}, Гео: {existingSettings.geoRegions?.join(', ') || 'Россия'}</p>
            </div>
          )}
        </div>

        {/* Информация о рекламодателе */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Рекламодатель</h2>
          <p className="text-xs text-gray-400 mb-3 sm:mb-4">Данные сохраняются автоматически и используются во всех кампаниях</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Название организации</label>
              <input
                type="text"
                value={advertiserName}
                onChange={(e) => handleAdvertiserNameChange(e.target.value)}
                placeholder='ООО "ЛИДСТЕХ"'
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">ИНН</label>
              <input
                type="text"
                value={advertiserInn}
                onChange={(e) => handleAdvertiserInnChange(e.target.value)}
                placeholder="6316264152"
                maxLength={12}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          </div>
        </div>

        {/* Настройки групп объявлений */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Настройки групп объявлений</h2>

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">
              Название группы объявлений <span className="text-gray-500">(опционально)</span>
            </label>
            <input
              type="text"
              value={adGroupName}
              onChange={(e) => setAdGroupName(e.target.value)}
              placeholder="Оставьте пустым для автоназвания (группа 1, группа 2...)"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              При выборе нескольких креативов к названию автоматически добавится номер
            </p>
          </div>

          {/* Выбор сегментов аудитории */}
          {segments.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Сегменты аудитории <span className="text-gray-500">({selectedSegmentIds.length} выбрано)</span>
              </label>
              <div className="bg-gray-700/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                {segments.map((segment) => (
                  <label
                    key={segment.id}
                    className="flex items-center gap-2 py-2 hover:bg-gray-600/30 rounded px-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSegmentIds.includes(segment.id)}
                      onChange={() => toggleSegment(segment.id)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white">{segment.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Выбранные сегменты будут применены ко всем группам объявлений
              </p>
            </div>
          )}

          {/* Выбор интересов для таргетинга */}
          {interests.length > 0 && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Интересы <span className="text-gray-500">({selectedInterestIds.length} выбрано)</span>
              </label>
              <div className="bg-gray-700/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                {interests.map((interest) => (
                  <div key={interest.id}>
                    <label className="flex items-center gap-2 py-2 hover:bg-gray-600/30 rounded px-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInterestIds.includes(interest.id)}
                        onChange={() => toggleInterest(interest.id)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm text-white font-medium">{interest.name}</span>
                    </label>
                    {/* Подкатегории интересов */}
                    {interest.children && interest.children.length > 0 && (
                      <div className="ml-6">
                        {interest.children.map((child) => (
                          <label
                            key={child.id}
                            className="flex items-center gap-2 py-1.5 hover:bg-gray-600/30 rounded px-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedInterestIds.includes(child.id)}
                              onChange={() => toggleInterest(child.id)}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm text-gray-300">{child.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Выбранные интересы будут применены ко всем группам объявлений
              </p>
            </div>
          )}
        </div>

        {/* Выбор креатива */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            Креативы из кабинета
          </h2>

          {creativesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="ml-2 text-gray-400">Загрузка креативов...</span>
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Креативы не найдены. Загрузите креативы в VK Ads.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ЛОГОТИП - одиночный выбор */}
              {creatives.filter(c => c.contentKey === 'icon_256x256').length > 0 && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white">1. Выберите логотип (256x256) *</h3>
                    {selectedLogoId && (
                      <span className="text-xs text-green-400">Выбран ID: {selectedLogoId}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {creatives.filter(c => c.contentKey === 'icon_256x256').map((creative) => {
                      const isSelected = selectedLogoId === creative.id
                      return (
                        <button
                          key={creative.id}
                          onClick={() => setSelectedLogoId(creative.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-green-500 ring-2 ring-green-500/50'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          {creative.previewUrl ? (
                            <img src={creative.previewUrl} alt={`Logo ${creative.id}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                              <CheckCircle className="w-5 h-5 text-green-400" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* КРЕАТИВЫ - мульти-выбор картинок/видео */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">
                    2. Выберите креативы (картинки/видео) * <span className="text-gray-400">({selectedCreativeIds.length}/10)</span>
                  </h3>
                  {selectedCreativeIds.length > 0 && (
                    <button
                      onClick={() => setSelectedCreativeIds([])}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">Каждый выбранный креатив создаст отдельную группу объявлений</p>

              {/* Картинки (image_*) */}
              {creatives.filter(c => c.contentKey.startsWith('image_') || c.contentKey === 'image_1080x1080').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Картинки</h3>
                  <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                    {creatives.filter(c => c.contentKey.startsWith('image_') || c.type === 'image' && !c.contentKey.includes('icon')).map((creative) => {
                      const isSelected = selectedCreativeIds.includes(creative.id)
                      const selectionIndex = selectedCreativeIds.indexOf(creative.id)
                      return (
                        <button
                          key={creative.id}
                          onClick={() => toggleCreative(creative.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/50'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          {creative.previewUrl ? (
                            <img src={creative.previewUrl} alt={`Creative ${creative.id}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-gray-500" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                {selectionIndex + 1}
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-gray-300 px-1 py-0.5 truncate">
                            {creative.contentKey.replace('image_', '')}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Видео */}
              {creatives.filter(c => c.type === 'video' || c.contentKey.includes('video')).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Видео</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                    {creatives.filter(c => c.type === 'video' || c.contentKey.includes('video')).map((creative) => {
                      const isSelected = selectedCreativeIds.includes(creative.id)
                      const selectionIndex = selectedCreativeIds.indexOf(creative.id)
                      return (
                        <button
                          key={creative.id}
                          onClick={() => toggleCreative(creative.id)}
                          className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/50'
                              : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          {creative.previewUrl ? (
                            <img src={creative.previewUrl} alt={`Video ${creative.id}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              <span className="text-2xl">🎬</span>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                {selectionIndex + 1}
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-gray-300 px-1 py-0.5 truncate">
                            {creative.contentKey.replace('video_', '')}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Выбранные креативы */}
              {selectedCreativeIds.length > 0 && (
                <div className="text-sm text-green-400 mt-2">
                  Выбрано {selectedCreativeIds.length} креатив(ов) — будет создано {selectedCreativeIds.length} групп объявлений
                </div>
              )}
              </div>
            </div>
          )}
        </div>

        {/* Форма баннера */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">
            {objective === 'socialactivity' ? 'Объявление (Сообщения)' : 'Объявление (Приложения)'}
          </h2>

          {/* Общий заголовок */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">
              Заголовок * <span className="text-gray-500">({title.length}/40)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 40))}
              placeholder="Заголовок объявления"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>

          {objective === 'socialactivity' ? (
            /* Форма для Сообщений */
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">ID группы VK *</label>
                <input
                  type="text"
                  value={vkGroupId}
                  onChange={(e) => handleVkGroupIdChange(e.target.value)}
                  placeholder="Например: 218588658"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ID группы можно найти в URL: vk.com/club<strong>123456789</strong> или в настройках группы
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Описание * <span className="text-gray-500">({description.length}/2000)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                  placeholder="Описание объявления"
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>
            </>
          ) : (
            /* Форма для Приложений */
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Короткое описание * <span className="text-gray-500">({shortDescription.length}/90)</span>
                </label>
                <textarea
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value.slice(0, 90))}
                  placeholder="Короткое описание"
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Длинное описание * <span className="text-gray-500">({longDescription.length}/220)</span>
                </label>
                <textarea
                  value={longDescription}
                  onChange={(e) => setLongDescription(e.target.value.slice(0, 220))}
                  placeholder="Длинное описание"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Текст рядом с кнопкой <span className="text-gray-500">({buttonText.length}/30)</span>
                </label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value.slice(0, 30))}
                  placeholder="Текст рядом с кнопкой"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Трекинговая ссылка *</label>
                <input
                  type="url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://app.appsflyer.com/..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </>
          )}

          {/* Надпись на кнопке */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Надпись на кнопке</label>
            <select
              value={callToAction}
              onChange={(e) => setCallToAction(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              {CALL_TO_ACTIONS.map((cta) => (
                <option key={cta.value} value={cta.value}>
                  {cta.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Кнопка создания */}
        <div className="flex items-center gap-4 mb-4 sm:mb-6">
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending || !selectedLogoId || selectedCreativeIds.length === 0 || !campaignName}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Создание...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Создать кампанию
              </>
            )}
          </button>
        </div>

        {/* Результат */}
        {result && (
          <div
            className={`rounded-lg p-4 ${
              result.success
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-red-500/10 border border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              <p className={result.success ? 'text-green-400' : 'text-red-400'}>{result.message}</p>
            </div>
          </div>
        )}

        {/* Инфо о дефолтных настройках */}
        <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 mt-4 sm:mt-6 text-xs sm:text-sm text-gray-400">
          <p className="font-medium text-gray-300 mb-2">Автоматические настройки:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Возраст: 21-50 лет</li>
            <li>Гео: Россия (или из существующих групп)</li>
            <li>Возрастная маркировка: 18+</li>
            <li>Название группы: дефолт</li>
            <li>UTM метки (для сообщений): ref_source=banner_id&ref=vkads</li>
            <li>Время показа: 8:00-23:00 ежедневно</li>
            <li>Формат: определяется автоматически по цели</li>
          </ul>
        </div>
      </div>
    </Layout>
  )
}
