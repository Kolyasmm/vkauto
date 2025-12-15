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
  ChevronDown,
  ChevronRight,
  Search,
  Settings2,
  Users,
  Heart,
  Wallet,
  Type,
  Pencil,
  Check,
  X,
} from 'lucide-react'

interface AdGroup {
  id: number
  name: string
  status: string
  budget_limit_day?: string
  targetings?: any
}

interface Campaign {
  id: number
  name: string
  status: string
  adGroups: AdGroup[]
}

interface Audience {
  id: number
  name: string
  count?: number
  usedInGroups?: number
  type?: string
  hasCustomName?: boolean
}

interface Interest {
  id: number
  name: string
  parent_id?: number
  usedInGroups?: number
}

interface BulkEditResult {
  results: Array<{
    adGroupId: number
    adGroupName?: string
    campaignName?: string
    success: boolean
    error?: string
  }>
  totalGroups: number
  successCount: number
  failCount: number
}

export default function BulkEditPage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()

  // Состояния
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<number>>(new Set())
  const [selectedAdGroups, setSelectedAdGroups] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [lastResult, setLastResult] = useState<BulkEditResult | null>(null)

  // Параметры редактирования
  const [editMode, setEditMode] = useState<'audiences' | 'interests' | 'budget' | 'name'>('audiences')
  const [selectedAudiences, setSelectedAudiences] = useState<number[]>([])
  const [selectedInterests, setSelectedInterests] = useState<number[]>([])
  const [budgetLimitDay, setBudgetLimitDay] = useState<string>('')
  const [newName, setNewName] = useState<string>('')
  const [audienceMode, setAudienceMode] = useState<'replace' | 'add' | 'remove'>('replace')
  const [interestsMode, setInterestsMode] = useState<'replace' | 'add' | 'remove'>('replace')

  // Редактирование названий сегментов
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
  const [editingSegmentName, setEditingSegmentName] = useState('')

  // Загрузка кампаний с группами
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['bulk-edit-campaigns', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/bulk-edit/campaigns/${currentAccount.id}`)
      return res.data as Campaign[]
    },
    enabled: !!currentAccount?.id,
  })

  // Загрузка аудиторий
  const { data: audiences = [], isLoading: audiencesLoading } = useQuery({
    queryKey: ['bulk-edit-audiences', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/bulk-edit/audiences/${currentAccount.id}`)
      return res.data as Audience[]
    },
    enabled: !!currentAccount?.id,
  })

  // Загрузка интересов
  const { data: interests = [], isLoading: interestsLoading } = useQuery({
    queryKey: ['bulk-edit-interests', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/bulk-edit/interests/${currentAccount.id}`)
      return res.data as Interest[]
    },
    enabled: !!currentAccount?.id,
  })

  // Фильтрация кампаний по поиску
  const filteredCampaigns = useMemo(() => {
    if (!searchQuery.trim()) return campaigns
    const query = searchQuery.toLowerCase()
    return campaigns
      .map(campaign => ({
        ...campaign,
        adGroups: campaign.adGroups.filter(
          ag => ag.name.toLowerCase().includes(query) || campaign.name.toLowerCase().includes(query)
        ),
      }))
      .filter(campaign => campaign.adGroups.length > 0 || campaign.name.toLowerCase().includes(query))
  }, [campaigns, searchQuery])

  // Подсчет всех групп
  const totalAdGroups = useMemo(() => {
    return campaigns.reduce((sum, c) => sum + c.adGroups.length, 0)
  }, [campaigns])

  // Toggle кампании
  const toggleCampaign = (campaignId: number) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      if (next.has(campaignId)) {
        next.delete(campaignId)
      } else {
        next.add(campaignId)
      }
      return next
    })
  }

  // Выбрать/снять выбор группы
  const toggleAdGroup = (adGroupId: number) => {
    setSelectedAdGroups(prev => {
      const next = new Set(prev)
      if (next.has(adGroupId)) {
        next.delete(adGroupId)
      } else {
        next.add(adGroupId)
      }
      return next
    })
  }

  // Выбрать все группы кампании
  const selectAllInCampaign = (campaign: Campaign) => {
    setSelectedAdGroups(prev => {
      const next = new Set(prev)
      const allSelected = campaign.adGroups.every(ag => prev.has(ag.id))
      if (allSelected) {
        campaign.adGroups.forEach(ag => next.delete(ag.id))
      } else {
        campaign.adGroups.forEach(ag => next.add(ag.id))
      }
      return next
    })
  }

  // Выбрать все группы
  const selectAll = () => {
    if (selectedAdGroups.size === totalAdGroups) {
      setSelectedAdGroups(new Set())
    } else {
      const allIds = campaigns.flatMap(c => c.adGroups.map(ag => ag.id))
      setSelectedAdGroups(new Set(allIds))
    }
  }

  // Мутация для сохранения названия сегмента
  const updateSegmentNameMutation = useMutation({
    mutationFn: async ({ segmentId, name }: { segmentId: number; name: string }) => {
      await api.put(`/bulk-edit/segment-label/${currentAccount!.id}/${segmentId}`, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulk-edit-audiences'] })
      setEditingSegmentId(null)
      setEditingSegmentName('')
    },
  })

  // Мутация для обновления
  const updateMutation = useMutation({
    mutationFn: async () => {
      const changes: any = {}

      if (editMode === 'audiences' && selectedAudiences.length > 0) {
        changes.audiences = selectedAudiences
        changes.audienceMode = audienceMode
      }

      if (editMode === 'interests' && selectedInterests.length > 0) {
        changes.interests = selectedInterests
        changes.interestsMode = interestsMode
      }

      if (editMode === 'budget' && budgetLimitDay) {
        changes.budgetLimitDay = parseFloat(budgetLimitDay)
      }

      if (editMode === 'name' && newName.trim()) {
        changes.name = newName.trim()
      }

      const res = await api.post('/bulk-edit/update', {
        vkAccountId: currentAccount!.id,
        adGroupIds: Array.from(selectedAdGroups),
        changes,
      })
      return res.data as BulkEditResult
    },
    onSuccess: (data) => {
      setLastResult(data)
      queryClient.invalidateQueries({ queryKey: ['bulk-edit-campaigns'] })
    },
  })

  // Проверка возможности применить
  const canApply = useMemo(() => {
    if (selectedAdGroups.size === 0) return false

    if (editMode === 'audiences' && selectedAudiences.length === 0) return false
    if (editMode === 'interests' && selectedInterests.length === 0) return false
    if (editMode === 'budget' && (!budgetLimitDay || parseFloat(budgetLimitDay) <= 0)) return false
    if (editMode === 'name' && !newName.trim()) return false

    return true
  }, [selectedAdGroups, editMode, selectedAudiences, selectedInterests, budgetLimitDay, newName])

  // Обработка применения изменений
  const handleApply = () => {
    if (!canApply) return
    updateMutation.mutate()
  }

  if (!currentAccount) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Выберите VK аккаунт
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Массовое редактирование</h1>
          <p className="text-gray-500 mt-1">
            Редактируйте аудитории, интересы и бюджет сразу для нескольких групп объявлений
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Левая колонка - выбор групп */}
          <div className="lg:col-span-2">
            <div className="card">
              {/* Поиск и массовый выбор */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-4 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Поиск по названию..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={selectAll}
                    className="px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    {selectedAdGroups.size === totalAdGroups ? 'Снять все' : 'Выбрать все'}
                  </button>
                </div>
                <div className="text-sm text-gray-500">
                  Выбрано: <span className="font-medium text-gray-900">{selectedAdGroups.size}</span> из {totalAdGroups} групп
                </div>
              </div>

              {/* Список кампаний и групп */}
              <div className="max-h-[500px] overflow-y-auto">
                {campaignsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                    <span className="ml-2 text-gray-500">Загрузка кампаний...</span>
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    {searchQuery ? 'Ничего не найдено' : 'Нет кампаний'}
                  </div>
                ) : (
                  filteredCampaigns.map((campaign) => {
                    const isExpanded = expandedCampaigns.has(campaign.id)
                    const selectedInCampaign = campaign.adGroups.filter(ag => selectedAdGroups.has(ag.id)).length
                    const allSelected = campaign.adGroups.length > 0 && selectedInCampaign === campaign.adGroups.length

                    return (
                      <div key={campaign.id} className="border-b border-gray-100 last:border-b-0">
                        {/* Заголовок кампании */}
                        <div
                          className="flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleCampaign(campaign.id)}
                        >
                          <button className="text-gray-400">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </button>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => {
                              e.stopPropagation()
                              selectAllInCampaign(campaign)
                            }}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{campaign.name}</div>
                            <div className="text-sm text-gray-500">
                              {campaign.adGroups.length} групп
                              {selectedInCampaign > 0 && (
                                <span className="text-primary-600 ml-2">
                                  ({selectedInCampaign} выбрано)
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            campaign.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {campaign.status === 'active' ? 'Активна' : campaign.status}
                          </span>
                        </div>

                        {/* Группы объявлений */}
                        {isExpanded && (
                          <div className="bg-gray-50 border-t border-gray-100">
                            {campaign.adGroups.map((adGroup) => (
                              <label
                                key={adGroup.id}
                                className="flex items-center gap-3 px-4 py-3 pl-14 hover:bg-gray-100 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedAdGroups.has(adGroup.id)}
                                  onChange={() => toggleAdGroup(adGroup.id)}
                                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-900 truncate">{adGroup.name}</div>
                                  {adGroup.budget_limit_day && (
                                    <div className="text-xs text-gray-500">
                                      Бюджет: {parseInt(adGroup.budget_limit_day)} руб/день
                                    </div>
                                  )}
                                </div>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  adGroup.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {adGroup.status === 'active' ? 'Активна' : adGroup.status}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Правая колонка - настройки редактирования */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Что изменить?</h3>

              {/* Выбор типа редактирования */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                <button
                  onClick={() => setEditMode('audiences')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-colors ${
                    editMode === 'audiences'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Аудитории</span>
                </button>
                <button
                  onClick={() => setEditMode('interests')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-colors ${
                    editMode === 'interests'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Heart className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Интересы</span>
                </button>
                <button
                  onClick={() => setEditMode('budget')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-colors ${
                    editMode === 'budget'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Wallet className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Бюджет</span>
                </button>
                <button
                  onClick={() => setEditMode('name')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-colors ${
                    editMode === 'name'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Type className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">Название</span>
                </button>
              </div>

              {/* Настройки аудиторий */}
              {editMode === 'audiences' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Режим
                    </label>
                    <select
                      value={audienceMode}
                      onChange={(e) => setAudienceMode(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="replace">Заменить</option>
                      <option value="add">Добавить</option>
                      <option value="remove">Удалить</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Аудитории ретаргетинга
                    </label>
                    {audiencesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                      </div>
                    ) : audiences.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        Нет доступных аудиторий
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        {audiences.map((audience) => (
                          <div
                            key={audience.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAudiences.includes(audience.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAudiences([...selectedAudiences, audience.id])
                                } else {
                                  setSelectedAudiences(selectedAudiences.filter(id => id !== audience.id))
                                }
                              }}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                            />
                            {editingSegmentId === audience.id ? (
                              <div className="flex items-center gap-1 flex-1">
                                <input
                                  type="text"
                                  value={editingSegmentName}
                                  onChange={(e) => setEditingSegmentName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && editingSegmentName.trim()) {
                                      updateSegmentNameMutation.mutate({ segmentId: audience.id, name: editingSegmentName.trim() })
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingSegmentId(null)
                                      setEditingSegmentName('')
                                    }
                                  }}
                                  className="flex-1 text-sm px-2 py-1 border border-primary-300 rounded focus:ring-1 focus:ring-primary-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    if (editingSegmentName.trim()) {
                                      updateSegmentNameMutation.mutate({ segmentId: audience.id, name: editingSegmentName.trim() })
                                    }
                                  }}
                                  disabled={!editingSegmentName.trim() || updateSegmentNameMutation.isPending}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                                >
                                  {updateSegmentNameMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSegmentId(null)
                                    setEditingSegmentName('')
                                  }}
                                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span
                                  className={`text-sm truncate cursor-pointer flex-1 ${
                                    audience.hasCustomName ? 'text-gray-900' : 'text-gray-500 italic'
                                  }`}
                                  onClick={() => {
                                    setEditingSegmentId(audience.id)
                                    setEditingSegmentName(audience.hasCustomName ? audience.name : '')
                                  }}
                                  title="Нажмите, чтобы задать название"
                                >
                                  {audience.name}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingSegmentId(audience.id)
                                    setEditingSegmentName(audience.hasCustomName ? audience.name : '')
                                  }}
                                  className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Переименовать"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {audience.usedInGroups !== undefined && (
                                  <span className="text-xs text-gray-500">
                                    в {audience.usedInGroups} гр.
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedAudiences.length > 0 && (
                      <div className="text-sm text-primary-600 mt-2">
                        Выбрано: {selectedAudiences.length}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Настройки интересов */}
              {editMode === 'interests' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Режим
                    </label>
                    <select
                      value={interestsMode}
                      onChange={(e) => setInterestsMode(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="replace">Заменить</option>
                      <option value="add">Добавить</option>
                      <option value="remove">Удалить</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Интересы
                    </label>
                    {interestsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                      </div>
                    ) : interests.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        Нет доступных интересов
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        {interests.map((interest) => (
                          <label
                            key={interest.id}
                            className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                              interest.parent_id ? 'pl-6' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedInterests.includes(interest.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedInterests([...selectedInterests, interest.id])
                                } else {
                                  setSelectedInterests(selectedInterests.filter(id => id !== interest.id))
                                }
                              }}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-900 truncate">{interest.name}</span>
                            {interest.usedInGroups !== undefined && (
                              <span className="text-xs text-gray-500 ml-auto">
                                в {interest.usedInGroups} группах
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                    {selectedInterests.length > 0 && (
                      <div className="text-sm text-primary-600 mt-2">
                        Выбрано: {selectedInterests.length}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Настройки бюджета */}
              {editMode === 'budget' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Дневной бюджет (руб.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={budgetLimitDay}
                      onChange={(e) => setBudgetLimitDay(e.target.value)}
                      placeholder="Например: 500"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Новый дневной бюджет будет установлен для всех выбранных групп
                    </p>
                  </div>
                </div>
              )}

              {/* Настройки названия */}
              {editMode === 'name' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Новое название
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Например: {name} - копия"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-700 mb-2">Доступные переменные:</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        <li><code className="bg-gray-200 px-1 rounded">{'{name}'}</code> — текущее название группы</li>
                        <li><code className="bg-gray-200 px-1 rounded">{'{id}'}</code> — ID группы объявлений</li>
                        <li><code className="bg-gray-200 px-1 rounded">{'{n}'}</code> — порядковый номер (1, 2, 3...)</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">
                        Примеры: <code className="bg-gray-200 px-1 rounded">{'{name}'} NEW</code>, <code className="bg-gray-200 px-1 rounded">Группа {'{n}'}</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Кнопка применить */}
              <button
                onClick={handleApply}
                disabled={!canApply || updateMutation.isPending}
                className="w-full mt-6 btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Применение...
                  </>
                ) : (
                  <>
                    <Settings2 className="w-4 h-4 mr-2" />
                    Применить к {selectedAdGroups.size} группам
                  </>
                )}
              </button>

              {updateMutation.isError && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  Ошибка: {(updateMutation.error as any)?.message || 'Что-то пошло не так'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Результат последнего обновления */}
        {lastResult && (
          <div className="mt-6 card p-6">
            <h3 className="text-lg font-medium mb-4">Результат обновления</h3>

            <div className="flex items-center gap-6 mb-4">
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-5 h-5 mr-2" />
                <span>Успешно: {lastResult.successCount}</span>
              </div>
              {lastResult.failCount > 0 && (
                <div className="flex items-center text-red-600">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>Ошибки: {lastResult.failCount}</span>
                </div>
              )}
            </div>

            {lastResult.failCount > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Группы с ошибками:</h4>
                {lastResult.results
                  .filter(r => !r.success)
                  .map((result) => (
                    <div
                      key={result.adGroupId}
                      className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
                    >
                      <div className="font-medium text-red-800">
                        {result.adGroupName || `Группа ${result.adGroupId}`}
                        {result.campaignName && (
                          <span className="text-red-600 font-normal"> ({result.campaignName})</span>
                        )}
                      </div>
                      <div className="text-red-700 mt-1">{result.error}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
