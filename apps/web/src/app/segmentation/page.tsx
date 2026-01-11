'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  Users,
  Target,
  Pencil,
  Check,
  X,
  Search,
} from 'lucide-react'

interface Campaign {
  id: number
  name: string
  status: string
  adGroups: Array<{
    id: number
    name: string
    status: string
  }>
}

interface Audience {
  id: number
  name: string
  hasCustomName: boolean
}

interface Interest {
  id: number
  name: string
  hasCustomName: boolean
}

interface SegmentationResult {
  success: boolean
  createdGroups: Array<{
    id: number
    name: string
    audienceId: number
    audienceName: string
  }>
  errors: string[]
  totalCreated: number
  totalRequested: number
}

export default function SegmentationPage() {
  const { currentAccount } = useVkAccount()

  const [selectedAdGroupId, setSelectedAdGroupId] = useState<number | null>(null)
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<number[]>([])
  const [selectedInterestId, setSelectedInterestId] = useState<number | null>(null)
  const [selectedSocDemInterestId, setSelectedSocDemInterestId] = useState<number | null>(null)
  const [result, setResult] = useState<SegmentationResult | null>(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null)
  const [editingInterestId, setEditingInterestId] = useState<number | null>(null)
  const [editingInterestName, setEditingInterestName] = useState('')
  const [interestSearch, setInterestSearch] = useState('')
  const [socDemSearch, setSocDemSearch] = useState('')

  // Reset state when account changes
  useEffect(() => {
    setSelectedAdGroupId(null)
    setSelectedAudienceIds([])
    setSelectedInterestId(null)
    setSelectedSocDemInterestId(null)
    setResult(null)
    setExpandedCampaignId(null)
  }, [currentAccount?.id])

  // Загрузка кампаний с группами
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ['segmentationCampaigns', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/segmentation/campaigns/${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  // Загрузка аудиторий
  const { data: audiences = [], isLoading: isLoadingAudiences } = useQuery<Audience[]>({
    queryKey: ['segmentationAudiences', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/segmentation/audiences/${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  // Загрузка интересов
  const { data: interests = [], isLoading: isLoadingInterests, refetch: refetchInterests } = useQuery<Interest[]>({
    queryKey: ['segmentationInterests', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/segmentation/interests/${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  // Загрузка соц-дем интересов
  const { data: interestsSocDem = [], isLoading: isLoadingSocDem } = useQuery<Interest[]>({
    queryKey: ['segmentationInterestsSocDem', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/segmentation/interests-soc-dem/${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  // Фильтрация интересов по поиску
  const filteredInterests = useMemo(() => {
    if (!interestSearch.trim()) return interests
    const query = interestSearch.toLowerCase()
    return interests.filter(interest => interest.name.toLowerCase().includes(query))
  }, [interests, interestSearch])

  // Фильтрация соц-дем интересов по поиску
  const filteredSocDemInterests = useMemo(() => {
    if (!socDemSearch.trim()) return interestsSocDem
    const query = socDemSearch.toLowerCase()
    return interestsSocDem.filter(interest => interest.name.toLowerCase().includes(query))
  }, [interestsSocDem, socDemSearch])

  // Мутация для обновления названия интереса
  const updateInterestMutation = useMutation({
    mutationFn: async ({ interestId, name }: { interestId: number; name: string }) => {
      if (!currentAccount) throw new Error('Выберите аккаунт')
      await api.put(`/segmentation/interest-label/${currentAccount.id}/${interestId}`, { name })
    },
    onSuccess: () => {
      setEditingInterestId(null)
      setEditingInterestName('')
      refetchInterests()
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка при обновлении названия')
    },
  })

  const startEditingInterest = (interest: Interest) => {
    setEditingInterestId(interest.id)
    setEditingInterestName(interest.name)
  }

  const saveInterestName = () => {
    if (editingInterestId && editingInterestName.trim()) {
      updateInterestMutation.mutate({
        interestId: editingInterestId,
        name: editingInterestName.trim(),
      })
    }
  }

  const cancelEditingInterest = () => {
    setEditingInterestId(null)
    setEditingInterestName('')
  }

  // Мутация выполнения сегментирования
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount || !selectedAdGroupId || selectedAudienceIds.length === 0) {
        throw new Error('Выберите группу и аудитории')
      }
      const response = await api.post('/segmentation/execute', {
        vkAccountId: currentAccount.id,
        sourceAdGroupId: selectedAdGroupId,
        audienceIds: selectedAudienceIds,
        interestId: selectedInterestId || undefined,
        socDemInterestId: selectedSocDemInterestId || undefined,
      })
      return response.data
    },
    onSuccess: (data) => {
      setResult(data)
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка при сегментировании')
    },
  })

  const toggleAudience = (id: number) => {
    setSelectedAudienceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setResult(null)
  }

  const selectAllAudiences = () => {
    setSelectedAudienceIds(audiences.map(a => a.id))
    setResult(null)
  }

  const clearAudiences = () => {
    setSelectedAudienceIds([])
    setResult(null)
  }

  const handleExecute = () => {
    if (!selectedAdGroupId) {
      alert('Выберите группу объявлений')
      return
    }
    if (selectedAudienceIds.length === 0) {
      alert('Выберите хотя бы одну аудиторию')
      return
    }
    executeMutation.mutate()
  }

  // Найти выбранную группу
  const selectedGroup = campaigns
    .flatMap(c => c.adGroups)
    .find(g => g.id === selectedAdGroupId)

  // Найти выбранный интерес
  const selectedInterest = interests.find(i => i.id === selectedInterestId)

  if (!currentAccount) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Выберите VK аккаунт для сегментирования</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Сегментирование</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Создание копий группы с разными аудиториями
          </p>
        </div>

        {/* Шаг 1: Выбор группы-источника */}
        <div className="card p-3 sm:p-4 mb-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm">1</span>
            Выберите группу объявлений
          </h2>

          {isLoadingCampaigns ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет кампаний с группами объявлений</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {campaigns.map(campaign => (
                <div key={campaign.id} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setExpandedCampaignId(
                      expandedCampaignId === campaign.id ? null : campaign.id
                    )}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="font-medium text-sm truncate">{campaign.name}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedCampaignId === campaign.id ? 'rotate-180' : ''}`} />
                  </button>

                  {expandedCampaignId === campaign.id && (
                    <div className="border-t border-gray-200 bg-gray-50 p-2">
                      {campaign.adGroups.length === 0 ? (
                        <p className="text-xs text-gray-500 px-2">Нет групп</p>
                      ) : (
                        <div className="space-y-1">
                          {campaign.adGroups.map(group => (
                            <button
                              key={group.id}
                              onClick={() => {
                                setSelectedAdGroupId(group.id)
                                setResult(null)
                              }}
                              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                selectedAdGroupId === group.id
                                  ? 'bg-primary-100 text-primary-800 font-medium'
                                  : 'hover:bg-white'
                              }`}
                            >
                              {group.name}
                              <span className="text-xs text-gray-400 ml-2">ID: {group.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedGroup && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Выбрано:</span>
              </div>
              <p className="text-green-800 text-sm mt-1">{selectedGroup.name}</p>
            </div>
          )}
        </div>

        {/* Шаг 2: Выбор аудиторий */}
        <div className="card p-3 sm:p-4 mb-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm">2</span>
            Выберите аудитории
            {selectedAudienceIds.length > 0 && (
              <span className="text-sm font-normal text-gray-500">
                ({selectedAudienceIds.length} выбрано)
              </span>
            )}
          </h2>

          {isLoadingAudiences ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : audiences.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет доступных аудиторий</p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={selectAllAudiences}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Выбрать все
                </button>
                <button
                  onClick={clearAudiences}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Очистить
                </button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {audiences.map(audience => (
                  <label
                    key={audience.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAudienceIds.includes(audience.id)}
                      onChange={() => toggleAudience(audience.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm flex-1 truncate">{audience.name}</span>
                    {!audience.hasCustomName && (
                      <span className="text-xs text-gray-400">(ID)</span>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Шаг 3: Выбор интереса (опционально) */}
        <div className="card p-3 sm:p-4 mb-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm">3</span>
            Интерес (опционально)
          </h2>

          {isLoadingInterests ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : interests.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет доступных интересов</p>
          ) : (
            <div className="space-y-2">
              {/* Поиск по интересам */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск интересов..."
                  value={interestSearch}
                  onChange={(e) => setInterestSearch(e.target.value)}
                  className="input w-full pl-9 text-sm"
                />
              </div>
              {/* Выбор интереса */}
              <div className="relative">
                <select
                  value={selectedInterestId || ''}
                  onChange={(e) => {
                    setSelectedInterestId(e.target.value ? parseInt(e.target.value) : null)
                    setResult(null)
                  }}
                  className="input w-full pr-10"
                >
                  <option value="">Без интереса</option>
                  {filteredInterests.map(interest => (
                    <option key={interest.id} value={interest.id}>
                      {interest.name}
                    </option>
                  ))}
                </select>
                <Target className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {filteredInterests.length === 0 && interestSearch && (
                <p className="text-xs text-gray-500">Ничего не найдено</p>
              )}

              {/* Список интересов для редактирования */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Переименовать интересы:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {filteredInterests.map(interest => (
                    <div key={interest.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group">
                      {editingInterestId === interest.id ? (
                        <>
                          <input
                            type="text"
                            value={editingInterestName}
                            onChange={(e) => setEditingInterestName(e.target.value)}
                            className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInterestName()
                              if (e.key === 'Escape') cancelEditingInterest()
                            }}
                          />
                          <button
                            onClick={saveInterestName}
                            disabled={updateInterestMutation.isPending}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            {updateInterestMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={cancelEditingInterest}
                            className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="flex-1 text-sm truncate">{interest.name}</span>
                          {!interest.hasCustomName && (
                            <span className="text-xs text-gray-400">(ID)</span>
                          )}
                          <button
                            onClick={() => startEditingInterest(interest)}
                            className="p-1 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Переименовать"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Шаг 4: Выбор соц-дем интереса (опционально) */}
        <div className="card p-3 sm:p-4 mb-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm">4</span>
            Соц.дем интерес (опционально)
          </h2>

          {isLoadingSocDem ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : interestsSocDem.length === 0 ? (
            <p className="text-gray-500 text-sm">Нет доступных соц-дем интересов</p>
          ) : (
            <div className="space-y-2">
              {/* Поиск по соц-дем интересам */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск соц.дем интересов..."
                  value={socDemSearch}
                  onChange={(e) => setSocDemSearch(e.target.value)}
                  className="input w-full pl-9 text-sm"
                />
              </div>
              <div className="relative">
                <select
                  value={selectedSocDemInterestId || ''}
                  onChange={(e) => {
                    setSelectedSocDemInterestId(e.target.value ? parseInt(e.target.value) : null)
                    setResult(null)
                  }}
                  className="input w-full pr-10"
                >
                  <option value="">Без соц-дем интереса</option>
                  {filteredSocDemInterests.map(interest => (
                    <option key={interest.id} value={interest.id}>
                      {interest.name}
                    </option>
                  ))}
                </select>
                <Target className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {filteredSocDemInterests.length === 0 && socDemSearch && (
                <p className="text-xs text-gray-500">Ничего не найдено</p>
              )}
              <p className="text-xs text-gray-500">Доход, занятость и другие соц-дем характеристики</p>
            </div>
          )}
        </div>

        {/* Превью и кнопка выполнения */}
        {selectedAdGroupId && selectedAudienceIds.length > 0 && (
          <div className="card p-3 sm:p-4 mb-4">
            <h2 className="text-base sm:text-lg font-semibold mb-3">Превью</h2>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <p className="text-sm text-blue-800">
                <strong>Будет создано:</strong> {selectedAudienceIds.length} групп
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Каждая группа получит одну аудиторию{selectedInterest ? ` + интерес "${selectedInterest.name}"` : ''}.
              </p>
              <p className="text-xs text-blue-700 mt-1">
                <strong>Время:</strong> ~{Math.ceil(selectedAudienceIds.length * 6 / 60)} мин.
              </p>
            </div>

            <div className="mb-4 max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Будут созданы группы:</p>
              <div className="space-y-1">
                {selectedAudienceIds.slice(0, 5).map(id => {
                  const audience = audiences.find(a => a.id === id)
                  const name = selectedInterest
                    ? `${audience?.name || id} + ${selectedInterest.name}`
                    : audience?.name || `Аудитория ${id}`
                  return (
                    <div key={id} className="text-xs text-gray-600 px-2 py-1 bg-gray-100 rounded">
                      {name}
                    </div>
                  )
                })}
                {selectedAudienceIds.length > 5 && (
                  <p className="text-xs text-gray-400">...и ещё {selectedAudienceIds.length - 5}</p>
                )}
              </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {executeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              Сегментировать ({selectedAudienceIds.length} групп)
            </button>
          </div>
        )}

        {/* Результат */}
        {result && (
          <div className={`card p-3 sm:p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <h3 className="font-semibold">
                {result.success ? 'Сегментирование завершено' : 'Ошибка'}
              </h3>
            </div>

            <p className="text-sm mb-3">
              Создано {result.totalCreated} из {result.totalRequested} групп
            </p>

            {result.createdGroups.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-2">Созданные группы:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.createdGroups.map(group => (
                    <div key={group.id} className="text-xs bg-white px-2 py-1.5 rounded border">
                      <span className="font-medium">{group.name}</span>
                      <span className="text-gray-400 ml-2">ID: {group.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs text-red-600 font-medium mb-1">Ошибки:</p>
                <ul className="text-xs text-red-500 space-y-1">
                  {result.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
