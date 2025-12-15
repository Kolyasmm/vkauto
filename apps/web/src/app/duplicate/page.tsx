'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import { Copy, Loader2, CheckCircle, AlertCircle, Lock, Plus, Minus, Trash2 } from 'lucide-react'

interface Campaign {
  id: number
  name: string
  status: string
  objective?: string
  adGroupsCount: number
  bannersCount: number
}

interface SelectedCampaign {
  campaignId: number
  copies: number
  newName: string
}

interface BatchResult {
  campaignResults: Array<{
    originalCampaignId: number
    originalName?: string
    copies: number
    results: Array<{ copyNumber: number; campaignId?: number; error?: string }>
    successCount: number
    failCount: number
  }>
  totalCampaigns: number
  totalSuccess: number
  totalFail: number
}

export default function DuplicatePage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()

  // Проверка доступа
  const { data: accessData, isLoading: accessLoading } = useQuery({
    queryKey: ['duplicate-access'],
    queryFn: async () => {
      const res = await api.get('/duplicate/access')
      return res.data
    },
  })

  // Получение списка кампаний
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns-for-duplicate', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return []
      const res = await api.get(`/duplicate/campaigns/${currentAccount.id}`)
      return res.data as Campaign[]
    },
    enabled: !!currentAccount?.id && accessData?.hasAccess,
  })

  // Состояние - массив выбранных кампаний
  const [selectedCampaigns, setSelectedCampaigns] = useState<SelectedCampaign[]>([])
  const [lastResult, setLastResult] = useState<BatchResult | null>(null)

  // Добавить кампанию в список
  const addCampaign = (campaignId: number) => {
    if (selectedCampaigns.find(c => c.campaignId === campaignId)) return
    setSelectedCampaigns([...selectedCampaigns, { campaignId, copies: 1, newName: '' }])
  }

  // Удалить кампанию из списка
  const removeCampaign = (campaignId: number) => {
    setSelectedCampaigns(selectedCampaigns.filter(c => c.campaignId !== campaignId))
  }

  // Обновить количество копий
  const updateCopies = (campaignId: number, copies: number) => {
    setSelectedCampaigns(selectedCampaigns.map(c =>
      c.campaignId === campaignId ? { ...c, copies: Math.min(10, Math.max(1, copies)) } : c
    ))
  }

  // Обновить имя
  const updateName = (campaignId: number, newName: string) => {
    setSelectedCampaigns(selectedCampaigns.map(c =>
      c.campaignId === campaignId ? { ...c, newName } : c
    ))
  }

  // Мутация для массового дублирования
  const duplicateMutation = useMutation({
    mutationFn: async (data: { vkAccountId: number; campaigns: SelectedCampaign[] }) => {
      const res = await api.post('/duplicate/execute-batch', {
        vkAccountId: data.vkAccountId,
        campaigns: data.campaigns.map(c => ({
          campaignId: c.campaignId,
          copies: c.copies,
          newName: c.newName.trim() || undefined,
        })),
      })
      return res.data as BatchResult
    },
    onSuccess: (data) => {
      setLastResult(data)
      setSelectedCampaigns([])
      queryClient.invalidateQueries({ queryKey: ['campaigns-for-duplicate'] })
    },
    onError: (error: any) => {
      alert(`Ошибка: ${error.response?.data?.message || error.message}`)
    },
  })

  // Отправка формы
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentAccount?.id || selectedCampaigns.length === 0) {
      alert('Выберите хотя бы одну кампанию')
      return
    }

    duplicateMutation.mutate({
      vkAccountId: currentAccount.id,
      campaigns: selectedCampaigns,
    })
  }

  // Получить информацию о кампании по ID
  const getCampaignInfo = (id: number) => campaigns.find(c => c.id === id)

  // Подсчет общего количества копий
  const totalCopies = selectedCampaigns.reduce((sum, c) => sum + c.copies, 0)

  // Доступные для выбора кампании (не выбранные)
  const availableCampaigns = campaigns.filter(c => !selectedCampaigns.find(s => s.campaignId === c.id))

  // Если нет доступа
  if (accessLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </Layout>
    )
  }

  if (!accessData?.hasAccess) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Lock className="w-16 h-16 mb-4 opacity-50" />
          <h2 className="text-xl font-medium mb-2">Доступ ограничен</h2>
          <p>Функция дублирования кампаний доступна только администраторам</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Дублирование РК</h1>
          <p className="text-gray-500 mt-1">
            Копируйте несколько кампаний со всеми группами объявлений и баннерами
          </p>
        </div>

        {/* Форма */}
        <div className="card p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Добавление кампании */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Добавить кампанию для дублирования
              </label>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  <span className="ml-2 text-gray-500">Загрузка кампаний...</span>
                </div>
              ) : availableCampaigns.length === 0 && selectedCampaigns.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  Нет доступных кампаний
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addCampaign(Number(e.target.value))
                        e.target.value = ''
                      }
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={availableCampaigns.length === 0}
                  >
                    <option value="">
                      {availableCampaigns.length === 0
                        ? 'Все кампании добавлены'
                        : '-- Выберите кампанию для добавления --'}
                    </option>
                    {availableCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.adGroupsCount} групп, {campaign.bannersCount} объявлений)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Список выбранных кампаний */}
            {selectedCampaigns.length > 0 && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Выбранные кампании ({selectedCampaigns.length})
                </label>
                {selectedCampaigns.map((selected) => {
                  const campaign = getCampaignInfo(selected.campaignId)
                  return (
                    <div
                      key={selected.campaignId}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {campaign?.name || `ID: ${selected.campaignId}`}
                          </h4>
                          {campaign && (
                            <p className="text-sm text-gray-500">
                              {campaign.adGroupsCount} групп, {campaign.bannersCount} объявлений
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCampaign(selected.campaignId)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4">
                        {/* Количество копий */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Копий:</span>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => updateCopies(selected.campaignId, selected.copies - 1)}
                              className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                              disabled={selected.copies <= 1}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={selected.copies}
                              onChange={(e) => updateCopies(selected.campaignId, Number(e.target.value))}
                              className="w-12 text-center px-1 py-1 border border-gray-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => updateCopies(selected.campaignId, selected.copies + 1)}
                              className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                              disabled={selected.copies >= 10}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Новое название */}
                        <div className="flex-1 min-w-[200px]">
                          <input
                            type="text"
                            value={selected.newName}
                            onChange={(e) => updateName(selected.campaignId, e.target.value)}
                            placeholder="Новое название (опционально)"
                            className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Итого */}
            {selectedCampaigns.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Итого будет создано:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>Кампаний для дублирования: <strong>{selectedCampaigns.length}</strong></li>
                  <li>Всего новых копий: <strong>{totalCopies}</strong></li>
                </ul>
              </div>
            )}

            {/* Кнопка */}
            <button
              type="submit"
              disabled={duplicateMutation.isPending || selectedCampaigns.length === 0}
              className="btn btn-primary w-full"
            >
              {duplicateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Дублирование...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Дублировать ({totalCopies} {totalCopies === 1 ? 'копия' : totalCopies < 5 ? 'копии' : 'копий'})
                </>
              )}
            </button>
          </form>
        </div>

        {/* Результат последнего дублирования */}
        {lastResult && (
          <div className="card p-6">
            <h3 className="text-lg font-medium mb-4">Результат дублирования</h3>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-5 h-5 mr-1" />
                <span>Успешно: {lastResult.totalSuccess}</span>
              </div>
              {lastResult.totalFail > 0 && (
                <div className="flex items-center text-red-600">
                  <AlertCircle className="w-5 h-5 mr-1" />
                  <span>Ошибки: {lastResult.totalFail}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {lastResult.campaignResults.map((campaignResult) => (
                <div key={campaignResult.originalCampaignId} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">
                    {campaignResult.originalName || `Кампания ${campaignResult.originalCampaignId}`}
                  </h4>
                  <div className="space-y-2">
                    {campaignResult.results.map((result) => (
                      <div
                        key={result.copyNumber}
                        className={`p-2 rounded ${
                          result.campaignId
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span>Копия {result.copyNumber}</span>
                          {result.campaignId ? (
                            <span className="text-green-700">ID: {result.campaignId}</span>
                          ) : (
                            <span className="text-red-700">{result.error}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
