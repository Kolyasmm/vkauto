'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface Banner {
  id: number
  name: string
  status: string
  moderationStatus: string
  adGroupId: number
  adGroupName: string
  title: string
  description: string
  descriptionFormat?: 'text_2000' | 'text_220' | 'text_90' | 'unknown'
  shortDescription?: string
}

interface Campaign {
  id: number
  name: string
  status: string
  banners: Banner[]
}

interface BulkBannerResult {
  results: Array<{
    bannerId: number
    bannerName?: string
    success: boolean
    error?: string
  }>
  totalBanners: number
  successCount: number
  failCount: number
}

export default function BulkBannersPage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()

  // Состояния
  const [selectedBanners, setSelectedBanners] = useState<Set<number>>(new Set())
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [lastResult, setLastResult] = useState<BulkBannerResult | null>(null)

  // Параметры редактирования
  const [newName, setNewName] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // Загрузка кампаний с баннерами
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['bulk-banners-campaigns', currentAccount?.id, statusFilter],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const res = await api.get(`/bulk-edit/campaigns-banners/${currentAccount.id}${params}`)
      return res.data as Campaign[]
    },
    enabled: !!currentAccount?.id,
  })

  // Фильтрация по поиску
  const filteredCampaigns = useMemo(() => {
    if (!searchQuery) return campaigns
    const query = searchQuery.toLowerCase()
    return campaigns
      .map((campaign) => ({
        ...campaign,
        banners: campaign.banners.filter(
          (b) =>
            b.name.toLowerCase().includes(query) ||
            b.title.toLowerCase().includes(query) ||
            b.adGroupName.toLowerCase().includes(query) ||
            campaign.name.toLowerCase().includes(query)
        ),
      }))
      .filter((c) => c.banners.length > 0)
  }, [campaigns, searchQuery])

  // Подсчёт баннеров
  const totalBanners = filteredCampaigns.reduce((sum, c) => sum + c.banners.length, 0)

  // Выбрать/снять все
  const toggleSelectAll = () => {
    if (selectedBanners.size === totalBanners) {
      setSelectedBanners(new Set())
    } else {
      const allIds = filteredCampaigns.flatMap((c) => c.banners.map((b) => b.id))
      setSelectedBanners(new Set(allIds))
    }
  }

  const toggleBanner = (id: number) => {
    const newSet = new Set(selectedBanners)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedBanners(newSet)
  }

  // Раскрытие/скрытие кампании
  const toggleCampaign = (campaignId: number) => {
    const newSet = new Set(expandedCampaigns)
    if (newSet.has(campaignId)) {
      newSet.delete(campaignId)
    } else {
      newSet.add(campaignId)
    }
    setExpandedCampaigns(newSet)
  }

  // Выбрать/снять все баннеры в кампании
  const toggleCampaignBanners = (bannerIds: number[]) => {
    const newSet = new Set(selectedBanners)
    const allSelected = bannerIds.every((id) => newSet.has(id))
    if (allSelected) {
      bannerIds.forEach((id) => newSet.delete(id))
    } else {
      bannerIds.forEach((id) => newSet.add(id))
    }
    setSelectedBanners(newSet)
  }

  // Мутация для обновления
  const updateMutation = useMutation({
    mutationFn: async () => {
      const changes: any = {}

      if (newName.trim()) {
        changes.name = newName
      }
      if (newTitle.trim()) {
        changes.title = newTitle
      }
      if (newDescription.trim()) {
        changes.description = newDescription
      }

      const res = await api.post('/bulk-edit/banners/update', {
        vkAccountId: currentAccount!.id,
        bannerIds: Array.from(selectedBanners),
        changes,
      })
      return res.data as BulkBannerResult
    },
    onSuccess: (data) => {
      setLastResult(data)
      queryClient.invalidateQueries({ queryKey: ['bulk-banners-campaigns'] })
      if (data.successCount > 0) {
        setSelectedBanners(new Set())
        setNewName('')
        setNewTitle('')
        setNewDescription('')
      }
    },
  })

  // Проверка: есть ли что обновлять
  const hasChanges = newName.trim().length > 0 || newTitle.trim().length > 0 || newDescription.trim().length > 0
  const canUpdate = selectedBanners.size > 0 && hasChanges

  if (!currentAccount) {
    return (
      <Layout>
        <div className="text-center py-12 text-gray-500">
          Выберите VK аккаунт для работы
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Массовое редактирование объявлений
            </h1>
            <p className="text-gray-500 mt-1">
              Изменение названий и текстов объявлений (баннеров)
            </p>
          </div>
        </div>

        {/* Результат последней операции */}
        {lastResult && (
          <div
            className={`card p-4 ${
              lastResult.failCount === 0
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {lastResult.failCount === 0 ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              )}
              <span className="font-medium">
                Обновлено: {lastResult.successCount} из {lastResult.totalBanners}
              </span>
              {lastResult.failCount > 0 && (
                <span className="text-yellow-700">
                  (ошибок: {lastResult.failCount})
                </span>
              )}
              <button
                onClick={() => setLastResult(null)}
                className="ml-auto text-sm text-gray-500 hover:text-gray-700"
              >
                Скрыть
              </button>
            </div>
            {lastResult.failCount > 0 && (
              <div className="mt-2 text-sm text-yellow-700">
                {lastResult.results
                  .filter((r) => !r.success)
                  .slice(0, 3)
                  .map((r) => (
                    <div key={r.bannerId}>
                      {r.bannerName || `#${r.bannerId}`}: {r.error}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка - список кампаний с баннерами */}
          <div className="lg:col-span-2 space-y-4">
            {/* Фильтры */}
            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Поиск по названию..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Все статусы</option>
                    <option value="active">Активные</option>
                    <option value="blocked">Остановленные</option>
                  </select>
                </div>
                <div className="text-sm text-gray-500">
                  {totalBanners} объявлений
                </div>
              </div>
            </div>

            {/* Выбрать все */}
            <div className="flex items-center gap-3 px-2">
              <input
                type="checkbox"
                checked={selectedBanners.size === totalBanners && totalBanners > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">
                {selectedBanners.size > 0
                  ? `Выбрано ${selectedBanners.size} из ${totalBanners}`
                  : 'Выбрать все'}
              </span>
            </div>

            {/* Список кампаний с баннерами */}
            {campaignsLoading ? (
              <div className="card p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="card p-8 text-center text-gray-500">
                Нет объявлений
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCampaigns.map((campaign) => {
                  const isExpanded = expandedCampaigns.has(campaign.id)
                  const bannerIds = campaign.banners.map((b) => b.id)
                  const selectedCount = bannerIds.filter((id) => selectedBanners.has(id)).length
                  const allSelected = selectedCount === bannerIds.length && bannerIds.length > 0

                  return (
                    <div key={campaign.id} className="card overflow-hidden">
                      {/* Заголовок кампании - кликабельный */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => toggleCampaign(campaign.id)}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCampaignBanners(bannerIds)
                          }}
                          className="flex-shrink-0"
                        >
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                          />
                        </button>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-gray-700 truncate">
                            {campaign.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {selectedCount > 0 && (
                            <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                              {selectedCount} выбр.
                            </span>
                          )}
                          <span className="text-sm text-gray-400">
                            {campaign.banners.length} объявл.
                          </span>
                        </div>
                      </div>

                      {/* Список баннеров - показываем только если раскрыто */}
                      {isExpanded && (
                        <div className="divide-y divide-gray-100">
                          {campaign.banners.map((banner) => (
                            <div
                              key={banner.id}
                              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={selectedBanners.has(banner.id)}
                                onChange={() => toggleBanner(banner.id)}
                                className="w-4 h-4 mt-1 text-primary-600 rounded focus:ring-primary-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {banner.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-xs rounded-full ${
                                      banner.status === 'active'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {banner.status === 'active' ? 'Активно' : 'Остановлено'}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Группа: {banner.adGroupName}
                                </div>
                                {banner.title && (
                                  <div className="text-xs text-gray-600 mt-1 truncate">
                                    <span className="text-gray-400">Заголовок:</span>{' '}
                                    {banner.title}
                                  </div>
                                )}
                                {banner.description && (
                                  <div className="text-xs text-gray-600 mt-0.5 truncate">
                                    <span className="text-gray-400">Описание:</span>{' '}
                                    {banner.description.substring(0, 100)}
                                    {banner.description.length > 100 && '...'}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Правая колонка - настройки редактирования */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Редактирование объявлений
              </h3>

              {/* Настройки редактирования */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Название объявления
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Шаблоны: {'{name}'} - текущее название, {'{id}'} - ID, {'{n}'} -
                    номер
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Заголовок (title)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    maxLength={40}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Макс. 40 символов
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Описание (text)
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Оставьте пустым, чтобы не менять"
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Лимит зависит от формата: 2000 (сообщения), 220/90 (приложения).
                    Текст автоматически обрежется.
                  </p>
                </div>
              </div>

              {/* Кнопка обновления */}
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!canUpdate || updateMutation.isPending}
                className="w-full mt-6 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Обновление...
                  </>
                ) : (
                  <>
                    Обновить {selectedBanners.size} объявлений
                  </>
                )}
              </button>

              {selectedBanners.size === 0 && (
                <p className="text-xs text-gray-500 text-center mt-2">
                  Выберите объявления для редактирования
                </p>
              )}

              {!hasChanges && selectedBanners.size > 0 && (
                <p className="text-xs text-gray-500 text-center mt-2">
                  Заполните хотя бы одно поле для изменения
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
