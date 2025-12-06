'use client'

import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Rule, RuleExecution } from '@/types'
import { Play, Pause, TrendingUp, Copy, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function Dashboard() {
  const { data: rules } = useQuery<Rule[]>({
    queryKey: ['rules'],
    queryFn: async () => {
      const response = await api.get('/rules')
      return response.data
    },
  })

  const activeRules = rules?.filter(r => r.isActive) || []
  const totalExecutions = rules?.reduce((sum, r) => sum + (r.executions?.length || 0), 0) || 0
  const todayExecutions = rules?.reduce((sum, r) => {
    const today = new Date().toDateString()
    const todayExecs = r.executions?.filter(e =>
      new Date(e.executedAt).toDateString() === today
    ) || []
    return sum + todayExecs.length
  }, 0) || 0

  const totalCopiesCreated = rules?.reduce((sum, r) => {
    return sum + (r.executions?.reduce((s, e) => s + e.copiesCreated, 0) || 0)
  }, 0) || 0

  return (
    <Layout>
      <div className="max-w-7xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Активных правил</p>
                <p className="text-3xl font-bold text-gray-900">{activeRules.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <Play className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Запусков сегодня</p>
                <p className="text-3xl font-bold text-gray-900">{todayExecutions}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Всего запусков</p>
                <p className="text-3xl font-bold text-gray-900">{totalExecutions}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Создано копий</p>
                <p className="text-3xl font-bold text-gray-900">{totalCopiesCreated}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Copy className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Активные правила */}
        <div className="card mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Активные правила
          </h2>

          {activeRules.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Нет активных правил. Создайте новое правило в разделе &quot;Правила&quot;
            </p>
          ) : (
            <div className="space-y-4">
              {activeRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">{rule.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      CPL ≤ {rule.cplThreshold}₽ • Мин. {rule.minLeads} лидов • {rule.copiesCount} копий
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="badge badge-success">Активно</span>
                    <p className="text-sm text-gray-600 mt-1">
                      Запуск в {rule.runTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Последние выполнения */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Последние выполнения
          </h2>

          {!rules || rules.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Нет выполнений
            </p>
          ) : (
            <div className="space-y-3">
              {rules
                .flatMap(r => r.executions?.map(e => ({ ...e, ruleName: r.name })) || [])
                .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
                .slice(0, 5)
                .map((execution: any) => (
                  <div
                    key={execution.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {execution.ruleName}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Проверено: {execution.groupsChecked} • Подошли: {execution.groupsMatched} • Создано: {execution.copiesCreated}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`badge ${
                          execution.status === 'success'
                            ? 'badge-success'
                            : execution.status === 'partial'
                            ? 'badge-warning'
                            : 'badge-error'
                        }`}
                      >
                        {execution.status === 'success' ? 'Успешно' : execution.status === 'partial' ? 'Частично' : 'Ошибка'}
                      </span>
                      <p className="text-sm text-gray-600 mt-1">
                        {format(new Date(execution.executedAt), 'd MMM HH:mm', { locale: ru })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
