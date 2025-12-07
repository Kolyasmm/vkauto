'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Copy,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Trash2,
  Search,
  AlertTriangle,
  Clock,
  RefreshCw,
  List
} from 'lucide-react'

interface ScalingTask {
  id: number
  sourceAdGroupId: string
  sourceAdGroupName: string | null
  copiesCount: number
  copiesCreated: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  createdCopies: Array<{ id: number; name: string }> | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface VerifiedGroup {
  id: number
  name: string
  status: string
  packageId: number
}

interface BatchResult {
  success: boolean
  createdTasks: Array<{ id: number; adGroupId: number; adGroupName: string }>
  errors: Array<{ adGroupId: number; error: string }>
  totalTasks: number
  totalCopies: number
  message: string
  estimatedTime: string
}

const MAX_COPIES = 15
const WARNING_THRESHOLD = 10

type Mode = 'single' | 'batch'

export default function ScalingPage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('single')
  const [adGroupId, setAdGroupId] = useState('')
  const [batchIds, setBatchIds] = useState('')
  const [copiesCount, setCopiesCount] = useState(5)
  const [verifiedGroup, setVerifiedGroup] = useState<VerifiedGroup | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)

  // Reset verification when account changes
  useEffect(() => {
    setVerifiedGroup(null)
    setVerifyError(null)
    setAdGroupId('')
    setBatchIds('')
    setBatchResult(null)
  }, [currentAccount?.id])

  const { data: tasks = [], isLoading, refetch } = useQuery<ScalingTask[]>({
    queryKey: ['scalingTasks', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount) return []
      const response = await api.get(`/scaling?vkAccountId=${currentAccount.id}`)
      return response.data
    },
    enabled: !!currentAccount,
    refetchInterval: 5000, // Обновляем каждые 5 секунд для отслеживания прогресса
  })

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount || !adGroupId) return null
      const response = await api.get(`/scaling/verify/${currentAccount.id}/${adGroupId}`)
      return response.data
    },
    onSuccess: (data) => {
      setVerifiedGroup(data)
      setVerifyError(null)
    },
    onError: (error: any) => {
      setVerifiedGroup(null)
      setVerifyError(error.response?.data?.message || 'Группа объявлений не найдена')
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount || !verifiedGroup) return null
      const response = await api.post('/scaling', {
        vkAccountId: currentAccount.id,
        adGroupId: verifiedGroup.id,
        copiesCount,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scalingTasks'] })
      setVerifiedGroup(null)
      setAdGroupId('')
      setCopiesCount(5)
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка создания задачи')
    },
  })

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount || !batchIds.trim()) return null

      // Парсим ID из строки (через запятую, пробелы, переносы строк)
      const ids = batchIds
        .split(/[,\s\n]+/)
        .map(id => id.trim())
        .filter(id => id)
        .map(id => parseInt(id))
        .filter(id => !isNaN(id))

      if (ids.length === 0) {
        throw new Error('Не найдено ни одного валидного ID')
      }

      const response = await api.post('/scaling/batch', {
        vkAccountId: currentAccount.id,
        adGroupIds: ids,
        copiesCount,
      })
      return response.data
    },
    onSuccess: (data) => {
      setBatchResult(data)
      queryClient.invalidateQueries({ queryKey: ['scalingTasks'] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка создания задач')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/scaling/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scalingTasks'] })
    },
  })

  const handleVerify = () => {
    if (!adGroupId.trim()) return
    setIsVerifying(true)
    verifyMutation.mutate(undefined, {
      onSettled: () => setIsVerifying(false),
    })
  }

  const handleCreateTask = () => {
    if (!verifiedGroup) return
    createTaskMutation.mutate()
  }

  const handleCreateBatch = () => {
    if (!batchIds.trim()) return
    createBatchMutation.mutate()
  }

  const handleDelete = (id: number) => {
    if (confirm('Удалить эту задачу?')) {
      deleteMutation.mutate(id)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs"><Clock className="w-3 h-3" /> Ожидание</span>
      case 'running':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"><Loader2 className="w-3 h-3 animate-spin" /> Выполняется</span>
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs"><CheckCircle className="w-3 h-3" /> Завершено</span>
      case 'failed':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs"><XCircle className="w-3 h-3" /> Ошибка</span>
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Подсчет ID в batch режиме
  const parsedBatchIds = batchIds
    .split(/[,\s\n]+/)
    .map(id => id.trim())
    .filter(id => id && !isNaN(parseInt(id)))

  if (!currentAccount) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Выберите VK аккаунт для масштабирования объявлений</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Ручное масштабирование</h1>
          <p className="text-gray-500 mt-1">
            Создание копий групп объявлений с сохранением всех настроек
          </p>
        </div>

        {/* Переключатель режима */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode('single'); setBatchResult(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              mode === 'single'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Copy className="w-4 h-4" />
            Одна группа
          </button>
          <button
            onClick={() => { setMode('batch'); setVerifiedGroup(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              mode === 'batch'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <List className="w-4 h-4" />
            Пакетный режим
          </button>
        </div>

        {/* Форма создания */}
        <div className="card mb-8">
          {mode === 'single' ? (
            <>
              <h2 className="text-lg font-semibold mb-4">Создать копии группы</h2>

              {/* Шаг 1: Ввод ID группы */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ID группы объявлений
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={adGroupId}
                    onChange={(e) => {
                      setAdGroupId(e.target.value)
                      setVerifiedGroup(null)
                      setVerifyError(null)
                    }}
                    placeholder="Например: 123456789"
                    className="input flex-1"
                  />
                  <button
                    onClick={handleVerify}
                    disabled={!adGroupId.trim() || isVerifying}
                    className="btn-outline flex items-center gap-2"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Проверить
                  </button>
                </div>
                {verifyError && (
                  <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {verifyError}
                  </p>
                )}
              </div>

              {/* Шаг 2: Верифицированная группа */}
              {verifiedGroup && (
                <>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Группа найдена</span>
                    </div>
                    <p className="text-green-800 mt-1">
                      <strong>{verifiedGroup.name}</strong> (ID: {verifiedGroup.id})
                    </p>
                  </div>

                  {/* Шаг 3: Количество копий */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Количество копий (максимум {MAX_COPIES})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={MAX_COPIES}
                      value={copiesCount}
                      onChange={(e) => setCopiesCount(Math.min(MAX_COPIES, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="input w-32"
                    />
                  </div>

                  {/* Предупреждение для большого количества копий */}
                  {copiesCount > WARNING_THRESHOLD && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                      <div className="flex items-start gap-2 text-yellow-700">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Внимание!</p>
                          <p className="text-sm mt-1">
                            Создание {copiesCount} копий займет около {Math.ceil(copiesCount * 6 / 60)} минут.
                            При высокой нагрузке на API задача может выполниться не полностью.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Информация о времени */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>Ожидаемое время:</strong> ~{Math.ceil(copiesCount * 6)} секунд ({Math.ceil(copiesCount * 6 / 60)} мин.)
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Копии создаются с задержкой 6 секунд для соблюдения лимитов API.
                      Все настройки, баннеры и тексты будут скопированы.
                    </p>
                  </div>

                  <button
                    onClick={handleCreateTask}
                    disabled={createTaskMutation.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    {createTaskMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    Создать {copiesCount} {copiesCount === 1 ? 'копию' : copiesCount < 5 ? 'копии' : 'копий'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-4">Пакетное масштабирование</h2>
              <p className="text-gray-500 text-sm mb-4">
                Введите список ID групп объявлений через запятую, пробел или каждый ID на новой строке.
                Задачи будут выполняться последовательно.
              </p>

              {/* Ввод списка ID */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ID групп объявлений
                </label>
                <textarea
                  value={batchIds}
                  onChange={(e) => {
                    setBatchIds(e.target.value)
                    setBatchResult(null)
                  }}
                  placeholder="124065573, 123563207, 124487188&#10;или каждый ID на новой строке"
                  className="input min-h-[120px] resize-y"
                  rows={5}
                />
                {parsedBatchIds.length > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Найдено ID: {parsedBatchIds.length}
                  </p>
                )}
              </div>

              {/* Количество копий */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Количество копий для каждой группы (максимум {MAX_COPIES})
                </label>
                <input
                  type="number"
                  min={1}
                  max={MAX_COPIES}
                  value={copiesCount}
                  onChange={(e) => setCopiesCount(Math.min(MAX_COPIES, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="input w-32"
                />
              </div>

              {/* Информация о времени */}
              {parsedBatchIds.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Будет создано:</strong> {parsedBatchIds.length * copiesCount} копий из {parsedBatchIds.length} групп
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    <strong>Ожидаемое время:</strong> ~{Math.ceil(parsedBatchIds.length * copiesCount * 6 / 60)} минут
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    Задачи выполняются последовательно для соблюдения лимитов API.
                  </p>
                </div>
              )}

              {/* Результат пакетного создания */}
              {batchResult && (
                <div className={`p-4 rounded-lg mb-4 ${batchResult.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className={`w-5 h-5 ${batchResult.errors.length > 0 ? 'text-yellow-700' : 'text-green-700'}`} />
                    <span className={`font-medium ${batchResult.errors.length > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                      {batchResult.message}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">Ожидаемое время: {batchResult.estimatedTime}</p>

                  {batchResult.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-red-700">Ошибки:</p>
                      <ul className="text-sm text-red-600 mt-1">
                        {batchResult.errors.map((err, i) => (
                          <li key={i}>ID {err.adGroupId}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleCreateBatch}
                disabled={createBatchMutation.isPending || parsedBatchIds.length === 0}
                className="btn-primary flex items-center gap-2"
              >
                {createBatchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <List className="w-4 h-4" />
                )}
                Создать задачи ({parsedBatchIds.length} групп × {copiesCount} копий)
              </button>
            </>
          )}
        </div>

        {/* Список задач */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">История задач</h2>
          <button
            onClick={() => refetch()}
            className="text-gray-500 hover:text-gray-700 p-2"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="card text-center py-12">
            <Copy className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Нет задач масштабирования
            </h3>
            <p className="text-gray-500">
              Создайте первую задачу, указав ID группы объявлений
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(task.status)}
                      <span className="text-sm text-gray-500">
                        {formatDate(task.createdAt)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">
                      {task.sourceAdGroupName || `Группа ${task.sourceAdGroupId}`}
                    </h3>
                    <div className="text-sm text-gray-500 mt-1">
                      Создано {task.copiesCreated} из {task.copiesCount} копий
                    </div>

                    {/* Прогресс бар */}
                    {task.status === 'running' && (
                      <div className="mt-3">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-600 transition-all duration-500"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{task.progress}%</p>
                      </div>
                    )}

                    {/* Созданные копии */}
                    {task.createdCopies && task.createdCopies.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-1">Созданные копии:</p>
                        <div className="flex flex-wrap gap-1">
                          {task.createdCopies.slice(0, 5).map((copy) => (
                            <span
                              key={copy.id}
                              className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                            >
                              ID: {copy.id}
                            </span>
                          ))}
                          {task.createdCopies.length > 5 && (
                            <span className="text-xs text-gray-500">
                              +{task.createdCopies.length - 5} ещё
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Ошибка */}
                    {task.errorMessage && (
                      <p className="text-sm text-red-600 mt-2">{task.errorMessage}</p>
                    )}
                  </div>

                  {/* Кнопка удаления */}
                  {task.status !== 'running' && (
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-4"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
