'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Rule } from '@/types'
import { Plus, Edit, Trash2, Play, Pause, TestTube, Loader2, CheckCircle, XCircle } from 'lucide-react'
import RuleModal from '@/components/RuleModal'
import { useVkAccount } from '@/contexts/VkAccountContext'

type ExecutionLog = {
  timestamp: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

type RunStatus = {
  ruleId: number
  status: 'running' | 'success' | 'error'
  message?: string
  logs?: ExecutionLog[]
}

export default function RulesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const queryClient = useQueryClient()
  const { currentAccount } = useVkAccount()

  const { data: rules, isLoading } = useQuery<Rule[]>({
    queryKey: ['rules', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/rules?vkAccountId=${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules', currentAccount?.id] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.put(`/rules/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules', currentAccount?.id] })
    },
  })

  const runMutation = useMutation({
    mutationFn: (id: number) => {
      setRunStatus({ ruleId: id, status: 'running', logs: [] })
      return api.post(`/rules/${id}/run`)
    },
    onSuccess: (data, ruleId) => {
      queryClient.invalidateQueries({ queryKey: ['rules', currentAccount?.id] })
      const result = data.data
      setRunStatus({
        ruleId,
        status: result.status === 'failed' ? 'error' : 'success',
        message: result.status === 'failed'
          ? result.errorMessage || 'Ошибка выполнения'
          : `Создано ${result.copiesCreated} копий из ${result.groupsMatched} подходящих групп`,
        logs: result.logs || []
      })
    },
    onError: (error: any, ruleId) => {
      setRunStatus({
        ruleId,
        status: 'error',
        message: error.response?.data?.message || 'Ошибка выполнения',
        logs: error.response?.data?.logs || []
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => api.post(`/rules/${id}/test`),
    onSuccess: (data) => {
      const result = data.data
      if (result.checkType === 'leadstech') {
        alert(
          `Тест завершен! (LeadsTech)\n\n` +
          `Проверено объявлений: ${result.totalBannersChecked}\n` +
          `Прибыльных объявлений: ${result.profitableBanners}\n` +
          `Уникальных групп для копирования: ${result.uniqueGroups}\n` +
          `Будет создано копий групп: ${result.wouldCreateCopies}`
        )
      } else {
        alert(
          `Тест завершен! (CPL)\n\n` +
          `Проверено групп: ${result.totalGroupsChecked}\n` +
          `Подходят под правило: ${result.matchingGroups}\n` +
          `Будет создано копий: ${result.wouldCreateCopies}`
        )
      }
    },
  })

  return (
    <Layout>
      <div className="max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Правила автодублирования</h1>
          <button
            onClick={() => {
              setEditingRule(null)
              setIsModalOpen(true)
            }}
            className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span className="sm:inline">Создать правило</span>
          </button>
        </div>

        {!currentAccount ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">
              Выберите VK аккаунт для просмотра правил
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">
              У вас пока нет правил автодублирования
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
            >
              Создать первое правило
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            {rules.map((rule) => (
              <div key={rule.id} className="card p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 sm:mb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                        {rule.name}
                      </h3>
                      <span
                        className={`badge text-xs ${
                          rule.isActive ? 'badge-success' : 'badge-error'
                        }`}
                      >
                        {rule.isActive ? 'Активно' : 'Неактивно'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Запуск каждый день в {rule.runTime}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <button
                      onClick={() => testMutation.mutate(rule.id)}
                      disabled={testMutation.isPending}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Тестировать"
                    >
                      <TestTube className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => runMutation.mutate(rule.id)}
                      disabled={runStatus?.ruleId === rule.id && runStatus?.status === 'running'}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Запустить сейчас"
                    >
                      {runStatus?.ruleId === rule.id && runStatus?.status === 'running' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setEditingRule(rule)
                        setIsModalOpen(true)
                      }}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Редактировать"
                    >
                      <Edit className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() =>
                        toggleMutation.mutate({
                          id: rule.id,
                          isActive: !rule.isActive,
                        })
                      }
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title={rule.isActive ? 'Отключить' : 'Включить'}
                    >
                      {rule.isActive ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('Вы уверены, что хотите удалить это правило?')) {
                          deleteMutation.mutate(rule.id)
                        }
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  {rule.profitabilityCheck === 'leadstech' ? (
                    <>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Проверка</p>
                        <p className="text-sm sm:text-lg font-semibold text-green-600">
                          LeadsTech
                        </p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Период</p>
                        <p className="text-sm sm:text-lg font-semibold text-gray-900">
                          {rule.periodDays === 1 ? '1 день' : `${rule.periodDays} дней`}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Порог CPL</p>
                        <p className="text-sm sm:text-lg font-semibold text-gray-900">
                          ≤ {rule.cplThreshold}₽
                        </p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Мин. лидов</p>
                        <p className="text-sm sm:text-lg font-semibold text-gray-900">
                          {rule.minLeads}
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Копий</p>
                    <p className="text-sm sm:text-lg font-semibold text-gray-900">
                      {rule.copiesCount}
                    </p>
                  </div>
                </div>

                {/* Run status notification with logs */}
                {runStatus?.ruleId === rule.id && (
                  <div className="mt-4 rounded-lg border overflow-hidden">
                    {/* Header */}
                    <div className={`p-3 flex items-center justify-between ${
                      runStatus.status === 'running' ? 'bg-blue-50 text-blue-700 border-b border-blue-100' :
                      runStatus.status === 'success' ? 'bg-green-50 text-green-700 border-b border-green-100' :
                      'bg-red-50 text-red-700 border-b border-red-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        {runStatus.status === 'running' && (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="font-medium">Выполняется...</span>
                          </>
                        )}
                        {runStatus.status === 'success' && (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span className="font-medium">{runStatus.message}</span>
                          </>
                        )}
                        {runStatus.status === 'error' && (
                          <>
                            <XCircle className="w-4 h-4" />
                            <span className="font-medium">{runStatus.message}</span>
                          </>
                        )}
                      </div>
                      {runStatus.status !== 'running' && (
                        <button
                          onClick={() => setRunStatus(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Logs */}
                    {runStatus.logs && runStatus.logs.length > 0 && (
                      <div className="bg-gray-900 text-gray-100 p-3 max-h-64 overflow-y-auto font-mono text-xs">
                        {runStatus.logs.map((log, idx) => (
                          <div key={idx} className={`py-0.5 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            'text-gray-300'
                          }`}>
                            <span className="text-gray-500 mr-2">
                              {new Date(log.timestamp).toLocaleTimeString('ru-RU')}
                            </span>
                            {log.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {rule.executions && rule.executions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-2">
                      Последнее выполнение:{' '}
                      {new Date(rule.executions[0].executedAt).toLocaleString('ru-RU')}
                    </p>
                    <p className="text-sm text-gray-900">
                      Создано {rule.executions[0].copiesCreated} копий из{' '}
                      {rule.executions[0].groupsMatched} подходящих групп
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isModalOpen && (
          <RuleModal
            rule={editingRule}
            onClose={() => {
              setIsModalOpen(false)
              setEditingRule(null)
            }}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['rules'] })
              setIsModalOpen(false)
              setEditingRule(null)
            }}
          />
        )}
      </div>
    </Layout>
  )
}
