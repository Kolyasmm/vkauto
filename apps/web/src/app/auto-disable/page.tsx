'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Plus,
  Power,
  Trash2,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2
} from 'lucide-react'
import AutoDisableRuleModal from '@/components/AutoDisableRuleModal'

interface AutoDisableRule {
  id: number
  name: string
  metricType: string
  operator: string
  threshold: number
  periodDays: number
  minSpent: number
  runTime: string
  isActive: boolean
  vkAccount?: { id: number; name: string }
  executions?: Array<{
    id: number
    executedAt: string
    adsChecked: number
    adsDisabled: number
    status: string
  }>
}

const metricLabels: Record<string, string> = {
  cpc: 'CPC',
  ctr: 'CTR',
  cpl: 'CPL',
  conversions: 'Конверсии',
}

const metricUnits: Record<string, string> = {
  cpc: '₽',
  ctr: '%',
  cpl: '₽',
  conversions: '',
}

const operatorLabels: Record<string, string> = {
  gte: '≥',
  lte: '≤',
}

const periodLabels: Record<number, string> = {
  1: '1 день',
  3: '3 дня',
  7: '7 дней',
}

export default function AutoDisablePage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AutoDisableRule | null>(null)
  const [runningRuleId, setRunningRuleId] = useState<number | null>(null)

  const { data: rules = [], isLoading, error } = useQuery<AutoDisableRule[]>({
    queryKey: ['autoDisableRules', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/auto-disable?vkAccountId=${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/auto-disable/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoDisableRules'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.put(`/auto-disable/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoDisableRules'] })
    },
  })

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      setRunningRuleId(id)
      const response = await api.post(`/auto-disable/${id}/execute`)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['autoDisableRules'] })
      alert(
        `Проверено: ${data.adsChecked}, отключено: ${data.adsDisabled}`
      )
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка выполнения правила')
    },
    onSettled: () => {
      setRunningRuleId(null)
    },
  })

  const handleDelete = async (id: number) => {
    if (confirm('Удалить это правило?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleEdit = (rule: AutoDisableRule) => {
    setEditingRule(rule)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingRule(null)
  }

  if (!currentAccount) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Выберите VK аккаунт для управления правилами автоотключения</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Автоотключение</h1>
            <p className="text-gray-500 mt-1">
              Автоматическое отключение объявлений по метрикам
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Добавить правило
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : error ? (
          <div className="card bg-red-50 border-red-200">
            <p className="text-red-700">Ошибка загрузки правил</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="card text-center py-12">
            <Power className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Нет правил автоотключения
            </h3>
            <p className="text-gray-500 mb-6">
              Создайте первое правило для автоматического отключения объявлений
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Создать правило
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="card hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      className={`p-2 rounded-lg transition-colors ${
                        rule.isActive
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <Power className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="font-medium text-gray-900">{rule.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="bg-gray-100 px-2 py-0.5 rounded">
                          {metricLabels[rule.metricType]} {operatorLabels[rule.operator]} {rule.threshold}{metricUnits[rule.metricType]}
                        </span>
                        <span>Период: {periodLabels[rule.periodDays]}</span>
                        <span>Мин. расход: {rule.minSpent}₽</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rule.runTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {rule.executions && rule.executions.length > 0 && (
                      <div className="text-sm text-gray-500 mr-4">
                        Последний запуск:{' '}
                        <span className={rule.executions[0].status === 'success' ? 'text-green-600' : 'text-red-600'}>
                          {rule.executions[0].adsDisabled} отключено
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => executeMutation.mutate(rule.id)}
                      disabled={runningRuleId === rule.id}
                      className="btn-outline flex items-center gap-2"
                    >
                      {runningRuleId === rule.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      Запустить
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <AutoDisableRuleModal
          rule={editingRule}
          onClose={handleCloseModal}
          onSuccess={() => {
            handleCloseModal()
            queryClient.invalidateQueries({ queryKey: ['autoDisableRules'] })
          }}
        />
      )}
    </Layout>
  )
}
