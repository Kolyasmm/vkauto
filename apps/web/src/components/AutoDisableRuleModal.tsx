'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import api from '@/lib/api'
import { useVkAccount } from '@/contexts/VkAccountContext'

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
}

interface AutoDisableRuleModalProps {
  rule?: AutoDisableRule | null
  onClose: () => void
  onSuccess: () => void
}

const metricTypes = [
  { value: 'cpc', label: 'CPC (стоимость клика)', unit: '₽', defaultThreshold: 75 },
  { value: 'ctr', label: 'CTR (кликабельность)', unit: '%', defaultThreshold: 0.5 },
  { value: 'cpl', label: 'CPL (стоимость лида)', unit: '₽', defaultThreshold: 200 },
  { value: 'conversions', label: 'Конверсии', unit: '', defaultThreshold: 1 },
]

const operators = [
  { value: 'gte', label: '≥ больше или равно' },
  { value: 'lt', label: '< меньше' },
]

const periods = [
  { value: 1, label: 'За 1 день' },
  { value: 3, label: 'За 3 дня' },
  { value: 7, label: 'За 7 дней' },
]

export default function AutoDisableRuleModal({ rule, onClose, onSuccess }: AutoDisableRuleModalProps) {
  const { currentAccount } = useVkAccount()

  const [formData, setFormData] = useState({
    name: '',
    metricType: 'cpc',
    operator: 'gte',
    threshold: 75,
    periodDays: 1,
    minSpent: 200,
    isActive: true,
  })

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name,
        metricType: rule.metricType,
        operator: rule.operator,
        threshold: rule.threshold,
        periodDays: rule.periodDays,
        minSpent: rule.minSpent,
        isActive: rule.isActive,
      })
    }
  }, [rule])

  const mutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const payload = {
        ...data,
        vkAccountId: currentAccount?.id,
      }
      if (rule) {
        return api.put(`/auto-disable/${rule.id}`, payload)
      }
      return api.post('/auto-disable', payload)
    },
    onSuccess,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const handleMetricChange = (metricType: string) => {
    const metric = metricTypes.find(m => m.value === metricType)
    setFormData({
      ...formData,
      metricType,
      threshold: metric?.defaultThreshold || 0,
      // Меняем оператор в зависимости от метрики
      operator: metricType === 'conversions' || metricType === 'ctr' ? 'lt' : 'gte',
    })
  }

  const selectedMetric = metricTypes.find(m => m.value === formData.metricType)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {rule ? 'Редактировать правило' : 'Новое правило автоотключения'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Account indicator */}
          {currentAccount && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Правило для аккаунта: <span className="font-medium text-gray-900">{currentAccount.name}</span>
              </p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Название правила
            </label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Отключить дорогие клики"
              required
            />
          </div>

          {/* Metric Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Метрика
            </label>
            <select
              className="input"
              value={formData.metricType}
              onChange={(e) => handleMetricChange(e.target.value)}
            >
              {metricTypes.map((metric) => (
                <option key={metric.value} value={metric.value}>
                  {metric.label}
                </option>
              ))}
            </select>
          </div>

          {/* Operator and Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Условие
              </label>
              <select
                className="input"
                value={formData.operator}
                onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
              >
                {operators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Порог {selectedMetric?.unit}
              </label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={formData.threshold}
                onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Период анализа
            </label>
            <div className="flex gap-2">
              {periods.map((period) => (
                <button
                  key={period.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, periodDays: period.value })}
                  className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                    formData.periodDays === period.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          {/* Min Spent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Минимальный расход для срабатывания (₽)
            </label>
            <input
              type="number"
              step="1"
              className="input"
              value={formData.minSpent}
              onChange={(e) => setFormData({ ...formData, minSpent: parseFloat(e.target.value) || 0 })}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Правило сработает только если объявление потратило минимум эту сумму
            </p>
          </div>

          {/* Active Toggle - only show when editing */}
          {rule ? (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Активно</p>
                <p className="text-sm text-gray-500">Правило проверяется каждые 10 минут</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  formData.isActive ? 'bg-primary-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    formData.isActive ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                Правило будет сразу активно и начнет проверяться каждые 10 минут после создания.
              </p>
            </div>
          )}

          {/* Rule Preview */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Правило:</strong> Если {selectedMetric?.label} {formData.operator === 'gte' ? '≥' : '<'} {formData.threshold}{selectedMetric?.unit} за {periods.find(p => p.value === formData.periodDays)?.label.toLowerCase()} и расход ≥ {formData.minSpent}₽, то объявление будет отключено.
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline flex-1">
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary flex-1"
            >
              {mutation.isPending ? 'Сохранение...' : rule ? 'Сохранить' : 'Создать'}
            </button>
          </div>

          {mutation.isError && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              Ошибка при сохранении правила. Проверьте данные и попробуйте снова.
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
