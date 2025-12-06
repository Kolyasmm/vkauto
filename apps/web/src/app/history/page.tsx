'use client'

import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import api from '@/lib/api'
import { Rule } from '@/types'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export default function HistoryPage() {
  const { data: rules, isLoading } = useQuery<Rule[]>({
    queryKey: ['rules'],
    queryFn: async () => {
      const response = await api.get('/rules')
      return response.data
    },
  })

  const allExecutions = rules
    ?.flatMap((r) =>
      r.executions?.map((e) => ({ ...e, ruleName: r.name, ruleId: r.id })) || []
    )
    .sort(
      (a, b) =>
        new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
    ) || []

  return (
    <Layout>
      <div className="max-w-7xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          История выполнений
        </h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : allExecutions.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">Нет выполнений</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allExecutions.map((execution: any) => (
              <div key={execution.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {execution.ruleName}
                      </h3>
                      <span
                        className={`badge ${
                          execution.status === 'success'
                            ? 'badge-success'
                            : execution.status === 'partial'
                            ? 'badge-warning'
                            : 'badge-error'
                        }`}
                      >
                        {execution.status === 'success'
                          ? 'Успешно'
                          : execution.status === 'partial'
                          ? 'Частично'
                          : 'Ошибка'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {format(
                        new Date(execution.executedAt),
                        'd MMMM yyyy, HH:mm',
                        { locale: ru }
                      )}
                    </p>
                  </div>

                  <div>
                    {execution.status === 'success' ? (
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    ) : execution.status === 'partial' ? (
                      <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    ) : (
                      <XCircle className="w-8 h-8 text-red-500" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg mb-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">
                      Проверено групп
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {execution.groupsChecked}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Подошли</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {execution.groupsMatched}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Создано копий</p>
                    <p className="text-2xl font-bold text-primary-600">
                      {execution.copiesCreated}
                    </p>
                  </div>
                </div>

                {execution.details?.successfulGroups?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Успешные группы:
                    </h4>
                    <div className="space-y-2">
                      {execution.details.successfulGroups.map((group: any) => (
                        <div
                          key={group.originalId}
                          className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm"
                        >
                          <p className="text-gray-900">
                            <strong>ID {group.originalId}</strong>: {group.leads}{' '}
                            лидов, CPL {group.cpl}₽ → {group.copiedIds.length}{' '}
                            копий
                          </p>
                          <p className="text-gray-600 text-xs mt-1">
                            Копии: {group.copiedIds.join(', ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {execution.details?.failedGroups?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Ошибки:
                    </h4>
                    <div className="space-y-2">
                      {execution.details.failedGroups.map((group: any) => (
                        <div
                          key={group.originalId}
                          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
                        >
                          <p className="text-gray-900">
                            <strong>ID {group.originalId}</strong>
                          </p>
                          <p className="text-red-600 text-xs mt-1">
                            {group.error}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {execution.errorMessage && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    <p className="text-red-800">{execution.errorMessage}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
