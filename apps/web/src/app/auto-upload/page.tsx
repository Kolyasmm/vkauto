'use client'

import { useState, useEffect, useMemo } from 'react'
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
  FileText,
  FolderOpen,
  Monitor,
  Smartphone,
  Search,
  RefreshCw,
} from 'lucide-react'

type Objective = 'socialactivity' | 'lead_form' | 'appinstalls'
type CreativeSource = 'vk' | 'library'

interface Creative {
  id: number
  type: string
  contentKey: string
  previewUrl: string
  width?: number
  height?: number
}

interface LibraryCreative {
  id: number
  name: string
  filename: string
  mimeType: string
  fileSize: number
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

  // Источник креативов (VK кабинет или Библиотека)
  const [creativeSource, setCreativeSource] = useState<CreativeSource>('vk')

  // Основные поля
  const [campaignName, setCampaignName] = useState('')
  const [dailyBudget, setDailyBudget] = useState(500)
  const [selectedLogoId, setSelectedLogoId] = useState<number | null>(null) // Логотип (один)
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<number[]>([]) // Картинки/видео (много)

  // Для библиотеки (ID креативов и их VK-версии после загрузки)
  const [selectedLibraryLogoId, setSelectedLibraryLogoId] = useState<number | null>(null)
  const [selectedLibraryCreativeIds, setSelectedLibraryCreativeIds] = useState<number[]>([])
  const [uploadingToVk, setUploadingToVk] = useState(false)

  // Поля для "Сообщения"
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [callToAction, setCallToAction] = useState('read_more')
  // URL или shortname группы VK (например: zaymptichka или https://vk.com/zaymptichka)
  const [vkGroupUrl, setVkGroupUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vk_group_url') || ''
    }
    return ''
  })

  // Поля для лид-формы
  const [selectedLeadFormId, setSelectedLeadFormId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lead_form_id') || ''
    }
    return ''
  })
  const [shortDescription, setShortDescription] = useState('')
  const [longDescription, setLongDescription] = useState('')
  const [leadFormButtonText, setLeadFormButtonText] = useState('Получить')

  // Поля для мобильного приложения (appinstalls)
  const [appTrackerUrl, setAppTrackerUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_tracker_url') || ''
    }
    return ''
  })
  const [appBundleId, setAppBundleId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_bundle_id') || ''
    }
    return ''
  })
  const [appShortDescription, setAppShortDescription] = useState('')
  const [appLongDescription, setAppLongDescription] = useState('')
  const [appCtaText, setAppCtaText] = useState('Установить')

  // Сохраняем ID лид-формы в localStorage при изменении
  const handleLeadFormIdChange = (value: string) => {
    setSelectedLeadFormId(value)
    if (typeof window !== 'undefined' && value) {
      localStorage.setItem('lead_form_id', value)
    }
  }

  // Сохраняем данные приложения в localStorage при изменении
  const handleAppTrackerUrlChange = (value: string) => {
    setAppTrackerUrl(value)
    if (typeof window !== 'undefined' && value) {
      localStorage.setItem('app_tracker_url', value)
    }
  }

  const handleAppBundleIdChange = (value: string) => {
    setAppBundleId(value)
    if (typeof window !== 'undefined' && value) {
      localStorage.setItem('app_bundle_id', value)
    }
  }

  // Дата начала показа (для запланированных кампаний)
  const [startDate, setStartDate] = useState<string>('') // формат YYYY-MM-DD

  // Новые поля: сегменты, интересы, названия, рекламодатель
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
  const [selectedInterestIds, setSelectedInterestIds] = useState<number[]>([])
  const [selectedSocDemInterestIds, setSelectedSocDemInterestIds] = useState<number[]>([])
  const [interestSearch, setInterestSearch] = useState('')
  const [socDemSearch, setSocDemSearch] = useState('')
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

  // Плейсменты (площадки размещения)
  // Реальные площадки VK Ads для показа рекламы
  const AVAILABLE_PADS = [
    { id: 1010345, name: 'ВКонтакте лента' },
    { id: 1265106, name: 'Клипы ВКонтакте' },
    { id: 2243453, name: 'Рекламная сеть VK' },
  ]
  const [selectedPads, setSelectedPads] = useState<number[]>([1010345, 1265106, 2243453])  // Дефолт: все площадки

  // Результат
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null)

  // Хелпер для получения URL креатива с токеном
  const getLibraryCreativeUrl = (creativeId: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
    return `/api/creatives/${creativeId}/file?token=${token || ''}`
  }

  // Загрузка креативов из VK кабинета
  const { data: creatives = [], isLoading: creativesLoading, refetch: refetchCreatives, isFetching: isCreativesFetching } = useQuery({
    queryKey: ['auto-upload-creatives', currentAccount?.id, objective],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/creatives/${currentAccount.id}?objective=${objective}`)
      return res.data as Creative[]
    },
    enabled: !!currentAccount?.id && creativeSource === 'vk',
    staleTime: 30000, // 30 секунд - данные считаются свежими
    gcTime: 60000, // 1 минута - время хранения в кэше
  })

  // Загрузка креативов из библиотеки
  const { data: libraryCreatives = [], isLoading: libraryCreativesLoading } = useQuery({
    queryKey: ['library-creatives'],
    queryFn: async () => {
      const res = await api.get('/creatives')
      return res.data as LibraryCreative[]
    },
    enabled: creativeSource === 'library',
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

  // Загрузка соц-дем интересов
  const { data: interestsSocDem = [] } = useQuery({
    queryKey: ['auto-upload-interests-soc-dem', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/interests-soc-dem/${currentAccount.id}`)
      return res.data as Array<{ id: number; name: string; children?: Array<{ id: number; name: string }> }>
    },
    enabled: !!currentAccount?.id,
  })

  // Фильтрация интересов по поиску
  const filteredInterests = useMemo(() => {
    if (!interestSearch.trim()) return interests
    const query = interestSearch.toLowerCase()
    return interests
      .map(interest => {
        // Если родительский интерес совпадает - показываем все его дочерние
        if (interest.name.toLowerCase().includes(query)) {
          return interest
        }
        // Иначе фильтруем дочерние
        const filteredChildren = interest.children?.filter(
          child => child.name.toLowerCase().includes(query)
        )
        if (filteredChildren && filteredChildren.length > 0) {
          return { ...interest, children: filteredChildren }
        }
        return null
      })
      .filter(Boolean) as typeof interests
  }, [interests, interestSearch])

  // Фильтрация соц-дем интересов по поиску
  const filteredSocDemInterests = useMemo(() => {
    if (!socDemSearch.trim()) return interestsSocDem
    const query = socDemSearch.toLowerCase()
    return interestsSocDem
      .map(interest => {
        if (interest.name.toLowerCase().includes(query)) {
          return interest
        }
        const filteredChildren = interest.children?.filter(
          child => child.name.toLowerCase().includes(query)
        )
        if (filteredChildren && filteredChildren.length > 0) {
          return { ...interest, children: filteredChildren }
        }
        return null
      })
      .filter(Boolean) as typeof interestsSocDem
  }, [interestsSocDem, socDemSearch])

  // Загрузка лид-форм из кабинета
  const { data: leadForms = [], isLoading: leadFormsLoading } = useQuery({
    queryKey: ['auto-upload-lead-forms', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/auto-upload/lead-forms/${currentAccount.id}`)
      return res.data as Array<{ id: string; name: string; status: number }>
    },
    enabled: !!currentAccount?.id && objective === 'lead_form',
  })

  // Сохраняем URL группы в localStorage при изменении
  const handleVkGroupUrlChange = (value: string) => {
    setVkGroupUrl(value)
    if (typeof window !== 'undefined' && value) {
      localStorage.setItem('vk_group_url', value)
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

  // Toggle соц-дем интереса для таргетинга
  const toggleSocDemInterest = (interestId: number) => {
    setSelectedSocDemInterestIds(prev => {
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

  // Функция toggle креатива из библиотеки
  const toggleLibraryCreative = (creativeId: number) => {
    setSelectedLibraryCreativeIds(prev => {
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
      // Проверки в зависимости от источника
      // Для lead_form логотип НЕ нужен - берётся из самой лид-формы
      const needsLogo = objective !== 'lead_form'
      if (creativeSource === 'vk') {
        if (!currentAccount?.id || selectedCreativeIds.length === 0) {
          throw new Error('Выберите аккаунт и хотя бы один креатив')
        }
        if (needsLogo && !selectedLogoId) {
          throw new Error('Выберите логотип (256x256)')
        }
      } else {
        if (!currentAccount?.id || selectedLibraryCreativeIds.length === 0) {
          throw new Error('Выберите аккаунт и хотя бы один креатив из библиотеки')
        }
        if (needsLogo && !selectedLibraryLogoId) {
          throw new Error('Выберите логотип из библиотеки')
        }
      }

      let finalLogoId: number = 0  // Для lead_form не используется, 0 как fallback
      let finalCreativeIds: number[]
      let creativeContentKeys: string[]

      if (creativeSource === 'library') {
        // Сначала загружаем креативы из библиотеки в VK
        setUploadingToVk(true)
        try {
          // Загружаем логотип (только если это НЕ lead_form)
          // asIcon: true говорит серверу ресайзить до 256x256
          if (needsLogo && selectedLibraryLogoId) {
            const logoUploadRes = await api.post(
              `/auto-upload/upload-library-creatives/${currentAccount!.id}`,
              { libraryCreativeIds: [selectedLibraryLogoId], asIcon: true }
            )
            const uploadedLogo = logoUploadRes.data[0]
            finalLogoId = uploadedLogo.vkContentId
          }

          // Загружаем остальные креативы
          const creativesUploadRes = await api.post(
            `/auto-upload/upload-library-creatives/${currentAccount!.id}`,
            { libraryCreativeIds: selectedLibraryCreativeIds }
          )

          finalCreativeIds = creativesUploadRes.data.map((c: any) => c.vkContentId)
          creativeContentKeys = creativesUploadRes.data.map((c: any) => c.contentKey)
        } finally {
          setUploadingToVk(false)
        }
      } else {
        // VK кабинет - используем как есть
        finalLogoId = needsLogo ? selectedLogoId! : 0
        finalCreativeIds = selectedCreativeIds

        // Собираем contentKey для каждого выбранного креатива (в том же порядке)
        creativeContentKeys = selectedCreativeIds.map(id => {
          const creative = creatives.find(c => c.id === id)
          return creative?.contentKey || 'video_portrait_9_16_30s'
        })
      }

      const payload: any = {
        vkAccountId: currentAccount.id,
        campaignName,
        objective,
        dailyBudget,
        packageId: existingSettings?.packageId,
        geoRegions: existingSettings?.geoRegions,
        urlId: existingSettings?.urlId,
        creativeIds: finalCreativeIds, // Картинки/видео для создания групп
        creativeContentKeys, // Типы контента для каждого креатива
        // Новые поля
        segmentIds: selectedSegmentIds.length > 0 ? selectedSegmentIds : undefined,
        interestIds: selectedInterestIds.length > 0 ? selectedInterestIds : undefined,
        socDemInterestIds: selectedSocDemInterestIds.length > 0 ? selectedSocDemInterestIds : undefined,
        adGroupName: adGroupName.trim() || undefined,
        advertiserName: advertiserName.trim() || undefined,
        advertiserInn: advertiserInn.trim() || undefined,
        // Дата начала показа (для запланированных кампаний)
        dateStart: startDate || undefined,
        // Площадки размещения
        pads: selectedPads.length > 0 ? selectedPads : undefined,
        autoPlacement: selectedPads.length === 0,  // Если площадки не выбраны - автоплейсмент
      }

      if (objective === 'socialactivity') {
        payload.vkGroupUrl = vkGroupUrl || null
        payload.messagesBanner = {
          creativeId: finalLogoId,
          title,
          description,
          callToAction,
        }
      } else if (objective === 'lead_form') {
        // Лид-форма (package 3215)
        // Логотип берётся АВТОМАТИЧЕСКИ из самой лид-формы, НЕ передаём его!
        payload.leadFormId = selectedLeadFormId
        payload.leadFormBanner = {
          // creativeId НЕ передаём - логотип из лид-формы
          imageCreativeId: finalCreativeIds[0],  // image_600x600 (первый выбранный креатив)
          title,
          shortDescription,  // text_90
          longDescription,   // text_220, text_long
          buttonText: leadFormButtonText || 'Получить',  // title_30_additional
          callToAction,  // cta_leadads
        }
      } else if (objective === 'appinstalls') {
        // Мобильное приложение
        payload.appTrackerUrl = appTrackerUrl
        payload.appBundleId = appBundleId
        payload.appInstallsBanner = {
          iconCreativeId: finalLogoId,
          imageCreativeId: finalCreativeIds[0], // Первый выбранный креатив как изображение
          title,
          shortDescription: appShortDescription,
          longDescription: appLongDescription,
          ctaText: appCtaText,
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

  // Сброс полей при смене objective или источника креативов
  useEffect(() => {
    setSelectedLogoId(null)
    setSelectedCreativeIds([])
    setSelectedLibraryLogoId(null)
    setSelectedLibraryCreativeIds([])
    setTitle('')
    setDescription('')
    setShortDescription('')
    setLongDescription('')
    setLeadFormButtonText('Получить')
    setAppShortDescription('')
    setAppLongDescription('')
    setResult(null)
  }, [objective, creativeSource])

  const handleCreate = () => {
    // Для lead_form логотип НЕ нужен - берётся из самой лид-формы
    const needsLogo = objective !== 'lead_form'

    // Проверка креативов в зависимости от источника
    if (creativeSource === 'vk') {
      if (needsLogo && !selectedLogoId) {
        setResult({ success: false, message: 'Выберите логотип (256x256)' })
        return
      }
      if (selectedCreativeIds.length === 0) {
        setResult({ success: false, message: 'Выберите хотя бы один креатив (картинку/видео)' })
        return
      }
    } else {
      if (needsLogo && !selectedLibraryLogoId) {
        setResult({ success: false, message: 'Выберите логотип из библиотеки' })
        return
      }
      if (selectedLibraryCreativeIds.length === 0) {
        setResult({ success: false, message: 'Выберите хотя бы один креатив из библиотеки' })
        return
      }
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
      if (!vkGroupUrl.trim()) {
        setResult({ success: false, message: 'Введите URL или shortname группы VK' })
        return
      }
    }

    if (objective === 'lead_form') {
      if (!selectedLeadFormId) {
        setResult({ success: false, message: 'Введите ID лид-формы' })
        return
      }
      if (!shortDescription.trim()) {
        setResult({ success: false, message: 'Введите короткое описание' })
        return
      }
      if (!longDescription.trim()) {
        setResult({ success: false, message: 'Введите длинное описание' })
        return
      }
    }

    if (objective === 'appinstalls') {
      if (!appTrackerUrl.trim()) {
        setResult({ success: false, message: 'Введите URL трекера' })
        return
      }
      // Bundle ID опционален - VK определяет из трекера
      if (!appShortDescription.trim()) {
        setResult({ success: false, message: 'Введите короткий текст объявления' })
        return
      }
      if (!appLongDescription.trim()) {
        setResult({ success: false, message: 'Введите длинный текст объявления' })
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
                  Сообщения
                </p>
                <p className="text-sm text-gray-400">socialactivity</p>
              </div>
            </button>

            <button
              onClick={() => setObjective('lead_form')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                objective === 'lead_form'
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <FileText className={`w-8 h-8 ${objective === 'lead_form' ? 'text-green-400' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-medium ${objective === 'lead_form' ? 'text-green-400' : 'text-white'}`}>
                  Лид-форма
                </p>
                <p className="text-sm text-gray-400">lead_form</p>
              </div>
            </button>

            <button
              onClick={() => setObjective('appinstalls')}
              className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                objective === 'appinstalls'
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <Smartphone className={`w-8 h-8 ${objective === 'appinstalls' ? 'text-purple-400' : 'text-gray-400'}`} />
              <div className="text-left">
                <p className={`font-medium ${objective === 'appinstalls' ? 'text-purple-400' : 'text-white'}`}>
                  Приложение
                </p>
                <p className="text-sm text-gray-400">appinstalls</p>
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
              {/* Поиск по интересам */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Поиск интересов..."
                  value={interestSearch}
                  onChange={(e) => setInterestSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500"
                />
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                {filteredInterests.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">Ничего не найдено</p>
                ) : filteredInterests.map((interest) => (
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

          {/* Выбор соц-дем интересов для таргетинга */}
          {interestsSocDem.length > 0 && (
            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-2">
                Соц.дем интересы <span className="text-gray-500">({selectedSocDemInterestIds.length} выбрано)</span>
              </label>
              {/* Поиск по соц-дем интересам */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Поиск соц.дем интересов..."
                  value={socDemSearch}
                  onChange={(e) => setSocDemSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500"
                />
              </div>
              <div className="bg-gray-700/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                {filteredSocDemInterests.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">Ничего не найдено</p>
                ) : filteredSocDemInterests.map((interest) => (
                  <div key={interest.id}>
                    <label className="flex items-center gap-2 py-2 hover:bg-gray-600/30 rounded px-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSocDemInterestIds.includes(interest.id)}
                        onChange={() => toggleSocDemInterest(interest.id)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-yellow-600 focus:ring-yellow-500"
                      />
                      <span className="text-sm text-white font-medium">{interest.name}</span>
                    </label>
                    {/* Подкатегории соц-дем интересов */}
                    {interest.children && interest.children.length > 0 && (
                      <div className="ml-6">
                        {interest.children.map((child) => (
                          <label
                            key={child.id}
                            className="flex items-center gap-2 py-1.5 hover:bg-gray-600/30 rounded px-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSocDemInterestIds.includes(child.id)}
                              onChange={() => toggleSocDemInterest(child.id)}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-yellow-600 focus:ring-yellow-500"
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
                Соц-дем интересы: доход, занятость и т.д.
              </p>
            </div>
          )}

          {/* Выбор площадок размещения (pads) */}
          <div className="mt-4">
            <label className="block text-sm text-gray-400 mb-2">
              Площадки размещения <span className="text-gray-500">({selectedPads.length} выбрано)</span>
            </label>
            <div className="bg-gray-700/30 rounded-lg p-3">
              {AVAILABLE_PADS.map((pad) => (
                <label
                  key={pad.id}
                  className="flex items-center gap-2 py-2 hover:bg-gray-600/30 rounded px-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPads.includes(pad.id)}
                    onChange={() => {
                      setSelectedPads(prev =>
                        prev.includes(pad.id)
                          ? prev.filter(id => id !== pad.id)
                          : [...prev, pad.id]
                      )
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-white">{pad.name}</span>
                  <span className="text-xs text-gray-500">({pad.id})</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Выберите площадки для показа рекламы. Если ничего не выбрано - используется автоплейсмент.
            </p>
          </div>
        </div>

        {/* Выбор креатива */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              Креативы
            </h2>

            {/* Переключатель источника и кнопка обновления */}
            <div className="flex items-center gap-2">
              {/* Кнопка обновления для VK кабинета */}
              {creativeSource === 'vk' && (
                <button
                  onClick={() => refetchCreatives()}
                  disabled={isCreativesFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 hover:text-white disabled:text-gray-500 rounded-lg transition-colors"
                  title="Обновить список креативов"
                >
                  <RefreshCw className={`w-4 h-4 ${isCreativesFetching ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Обновить</span>
                </button>
              )}

              {/* Переключатель источника */}
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  onClick={() => setCreativeSource('vk')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    creativeSource === 'vk'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  VK кабинет
                </button>
                <button
                  onClick={() => setCreativeSource('library')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    creativeSource === 'library'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Библиотека
                </button>
              </div>
            </div>
          </div>

          {/* VK кабинет */}
          {creativeSource === 'vk' && (creativesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="ml-2 text-gray-400">Загрузка креативов...</span>
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="mb-3">Креативы не найдены. Загрузите креативы в VK Ads.</p>
              <button
                onClick={() => refetchCreatives()}
                disabled={isCreativesFetching}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isCreativesFetching ? 'animate-spin' : ''}`} />
                Обновить список
              </button>
              <p className="text-xs text-gray-500 mt-3">
                Недавно загруженные креативы могут появиться с задержкой в несколько минут
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ЛОГОТИП - одиночный выбор (НЕ нужен для lead_form - берётся из лид-формы) */}
              {objective !== 'lead_form' && creatives.filter(c => c.contentKey === 'icon_256x256').length > 0 && (
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
                    {objective === 'lead_form' ? '1' : '2'}. Выберите креативы (картинки/видео) * <span className="text-gray-400">({selectedCreativeIds.length}/10)</span>
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

              {/* Видео (НЕ для lead_form - package 3215 не поддерживает видео!) */}
              {objective !== 'lead_form' && creatives.filter(c => c.type === 'video' || c.contentKey.includes('video')).length > 0 && (
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
          ))}

          {/* Библиотека креативов */}
          {creativeSource === 'library' && (libraryCreativesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-400" />
              <span className="ml-2 text-gray-400">Загрузка креативов из библиотеки...</span>
            </div>
          ) : libraryCreatives.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Креативы не найдены в библиотеке.</p>
              <a href="/creatives" className="text-green-400 hover:text-green-300 underline mt-2 inline-block">
                Перейти в библиотеку и загрузить креативы
              </a>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ЛОГОТИП из библиотеки (НЕ нужен для lead_form - берётся из лид-формы) */}
              {objective !== 'lead_form' && (
              <div className="bg-gray-700/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">1. Выберите логотип *</h3>
                  {selectedLibraryLogoId && (
                    <span className="text-xs text-green-400">Выбран ID: {selectedLibraryLogoId}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">Выберите квадратное изображение для логотипа (256x256)</p>
                <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {libraryCreatives.filter(c => c.mimeType.startsWith('image/')).map((creative) => {
                    const isSelected = selectedLibraryLogoId === creative.id
                    return (
                      <button
                        key={creative.id}
                        onClick={() => setSelectedLibraryLogoId(creative.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-green-500 ring-2 ring-green-500/50'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <img
                          src={getLibraryCreativeUrl(creative.id)}
                          alt={creative.name}
                          className="w-full h-full object-cover"
                        />
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

              {/* КРЕАТИВЫ из библиотеки - мульти-выбор */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">
                    {objective === 'lead_form' ? '1' : '2'}. Выберите креативы (картинки/видео) * <span className="text-gray-400">({selectedLibraryCreativeIds.length}/10)</span>
                  </h3>
                  {selectedLibraryCreativeIds.length > 0 && (
                    <button
                      onClick={() => setSelectedLibraryCreativeIds([])}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">Каждый выбранный креатив создаст отдельную группу объявлений</p>

                {/* Картинки из библиотеки */}
                {libraryCreatives.filter(c => c.mimeType.startsWith('image/')).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-3">Картинки</h4>
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                      {libraryCreatives.filter(c => c.mimeType.startsWith('image/')).map((creative) => {
                        const isSelected = selectedLibraryCreativeIds.includes(creative.id)
                        const selectionIndex = selectedLibraryCreativeIds.indexOf(creative.id)
                        return (
                          <button
                            key={creative.id}
                            onClick={() => toggleLibraryCreative(creative.id)}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-500 ring-2 ring-blue-500/50'
                                : 'border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            <img
                              src={getLibraryCreativeUrl(creative.id)}
                              alt={creative.name}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                  {selectionIndex + 1}
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-gray-300 px-1 py-0.5 truncate">
                              {creative.name}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Видео из библиотеки (НЕ для lead_form - package 3215 не поддерживает видео!) */}
                {objective !== 'lead_form' && libraryCreatives.filter(c => c.mimeType.startsWith('video/')).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-3">Видео</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                      {libraryCreatives.filter(c => c.mimeType.startsWith('video/')).map((creative) => {
                        const isSelected = selectedLibraryCreativeIds.includes(creative.id)
                        const selectionIndex = selectedLibraryCreativeIds.indexOf(creative.id)
                        return (
                          <button
                            key={creative.id}
                            onClick={() => toggleLibraryCreative(creative.id)}
                            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-500 ring-2 ring-blue-500/50'
                                : 'border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              <span className="text-2xl">🎬</span>
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                  {selectionIndex + 1}
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-gray-300 px-1 py-0.5 truncate">
                              {creative.name}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Выбранные креативы */}
                {selectedLibraryCreativeIds.length > 0 && (
                  <div className="text-sm text-green-400 mt-4">
                    Выбрано {selectedLibraryCreativeIds.length} креатив(ов) — будет создано {selectedLibraryCreativeIds.length} групп объявлений
                  </div>
                )}
              </div>

              {/* Предупреждение о загрузке */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-sm text-yellow-400">
                  ⚡ Креативы из библиотеки будут автоматически загружены в VK перед созданием кампании
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Форма баннера */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">
            {objective === 'socialactivity' ? 'Объявление (Сообщения)' :
             objective === 'lead_form' ? 'Объявление (Лид-форма)' :
             'Объявление (Приложение)'}
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

          {objective === 'socialactivity' && (
            /* Форма для Сообщений */
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Группа VK (URL или shortname) *</label>
                <input
                  type="text"
                  value={vkGroupUrl}
                  onChange={(e) => handleVkGroupUrlChange(e.target.value)}
                  placeholder="zaymptichka или https://vk.com/zaymptichka"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Введите shortname группы (например: <strong>zaymptichka</strong>) или полный URL (например: <strong>https://vk.com/zaymptichka</strong>)
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
          )}

          {objective === 'lead_form' && (
            /* Форма для Лид-формы (package 3215) */
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Лид-форма *</label>
                {leadFormsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Загрузка лид-форм...
                  </div>
                ) : leadForms.length > 0 ? (
                  <select
                    value={selectedLeadFormId}
                    onChange={(e) => handleLeadFormIdChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Выберите лид-форму</option>
                    {leadForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name} (ID: {form.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={selectedLeadFormId}
                      onChange={(e) => handleLeadFormIdChange(e.target.value)}
                      placeholder="Введите ID лид-формы"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    />
                    <p className="text-xs text-yellow-400 mt-1">
                      Лид-формы не найдены. Создайте форму в VK Ads → Лид-формы
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Короткое описание * <span className="text-gray-500">({shortDescription.length}/90)</span>
                </label>
                <textarea
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value.slice(0, 90))}
                  placeholder="Короткое описание (до 90 символов)"
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
                  placeholder="Длинное описание (до 220 символов)"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Текст кнопки <span className="text-gray-500">(до 30 символов)</span>
                </label>
                <input
                  type="text"
                  value={leadFormButtonText}
                  onChange={(e) => setLeadFormButtonText(e.target.value.slice(0, 30))}
                  placeholder="Получить"
                  maxLength={30}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </>
          )}

          {objective === 'appinstalls' && (
            /* Форма для Мобильного приложения */
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">URL трекера (AppsFlyer, Adjust и т.д.) *</label>
                <input
                  type="text"
                  value={appTrackerUrl}
                  onChange={(e) => handleAppTrackerUrlChange(e.target.value)}
                  placeholder="https://app.appsflyer.com/com.app.id?pid=vk&c={{campaign_name}}"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ссылка из трекера с параметрами атрибуции. Макросы: {'{{campaign_name}}, {{banner_id}}, {{site_id}}'}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Bundle ID приложения <span className="text-gray-500">(опционально)</span>
                </label>
                <input
                  type="text"
                  value={appBundleId}
                  onChange={(e) => handleAppBundleIdChange(e.target.value)}
                  placeholder="com.example.app"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Необязательно — VK определяет из ссылки трекера. Формат: com.example.app (Android) или id1234567890 (iOS)
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Короткий текст * <span className="text-gray-500">({appShortDescription.length}/90)</span>
                </label>
                <textarea
                  value={appShortDescription}
                  onChange={(e) => setAppShortDescription(e.target.value.slice(0, 90))}
                  placeholder="Короткий текст объявления (до 90 символов)"
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Длинный текст * <span className="text-gray-500">({appLongDescription.length}/220)</span>
                </label>
                <textarea
                  value={appLongDescription}
                  onChange={(e) => setAppLongDescription(e.target.value.slice(0, 220))}
                  placeholder="Длинный текст объявления (до 220 символов)"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Текст кнопки CTA</label>
                <input
                  type="text"
                  value={appCtaText}
                  onChange={(e) => setAppCtaText(e.target.value.slice(0, 30))}
                  placeholder="Установить"
                  maxLength={30}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </>
          )}

          {/* Надпись на кнопке - только для messages и lead_form */}
          {objective !== 'appinstalls' && (
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
          )}
        </div>

        {/* Кнопка создания */}
        <div className="flex items-center gap-4 mb-4 sm:mb-6">
          <button
            onClick={handleCreate}
            disabled={
              createMutation.isPending ||
              uploadingToVk ||
              !campaignName ||
              (creativeSource === 'vk'
                ? (objective !== 'lead_form' && !selectedLogoId) || selectedCreativeIds.length === 0
                : (objective !== 'lead_form' && !selectedLibraryLogoId) || selectedLibraryCreativeIds.length === 0)
            }
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {uploadingToVk ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Загрузка в VK...
              </>
            ) : createMutation.isPending ? (
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
