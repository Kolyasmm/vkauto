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

// Новая логика: "если потрачено >= X И метрика соответствует условию"
const metricTypes = [
  { value: 'clicks', label: 'Клики', unit: '', defaultThreshold: 0, defaultOperator: 'eq' },
  { value: 'goals', label: 'Результаты (лиды)', unit: '', defaultThreshold: 0, defaultOperator: 'eq' },
  { value: 'ctr', label: 'CTR', unit: '%', defaultThreshold: 0.1, defaultOperator: 'lt' },
  { value: 'cpl', label: 'CPL (цена за результат)', unit: '₽', defaultThreshold: 300, defaultOperator: 'gt' },
]

const operators = [
  { value: 'eq', label: '=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
]

const periods = [
  { value: 1, label: 'За сегодня' },
  { value: 3, label: 'За 3 дня' },
  { value: 7, label: 'За 7 дней' },
]

// Пресеты правил на основе запроса таргетолога
const presets = [
  { name: 'Потрачено 75₽, кликов 0', minSpent: 75, metricType: 'clicks', operator: 'eq', threshold: 0 },
  { name: 'Потрачено 160₽, кликов < 2', minSpent: 160, metricType: 'clicks', operator: 'lt', threshold: 2 },
  { name: 'Потрачено 250₽, результатов 0', minSpent: 250, metricType: 'goals', operator: 'eq', threshold: 0 },
  { name: 'Потрачено 350₽, результатов < 2', minSpent: 350, metricType: 'goals', operator: 'lt', threshold: 2 },
  { name: 'Потрачено 650₽, результатов < 3', minSpent: 650, metricType: 'goals', operator: 'lt', threshold: 3 },
  { name: 'Потрачено 100₽, CTR < 0.1%', minSpent: 100, metricType: 'ctr', operator: 'lt', threshold: 0.1 },
  { name: 'CPL > 300₽ при 500₽ расхода', minSpent: 500, metricType: 'cpl', operator: 'gt', threshold: 300 },
  { name: 'CPL > 200₽ при 400₽ расхода', minSpent: 400, metricType: 'cpl', operator: 'gt', threshold: 200 },
]

export default function AutoDisableRuleModal({ rule, onClose, onSuccess }: AutoDisableRuleModalProps) {
  const { currentAccount } = useVkAccount()

  const [formData, setFormData] = useState({
    name: '',
    metricType: 'clicks',
    operator: 'eq',
    threshold: 0,
    periodDays: 1,
    minSpent: 75,
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
        name: data.name,
        metricType: data.metricType,
        operator: data.operator,
        threshold: Number(data.threshold),
        periodDays: Number(data.periodDays),
        minSpent: Number(data.minSpent),
        isActive: data.isActive,
        // При редактировании НЕ отправляем vkAccountId (не меняем привязку к аккаунту)
        // При создании привязываем к текущему аккаунту
        ...(rule ? {} : { vkAccountId: currentAccount?.id }),
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

  const applyPreset = (preset: typeof presets[0]) => {
    setFormData({
      ...formData,
      name: preset.name,
      minSpent: preset.minSpent,
      metricType: preset.metricType,
      operator: preset.operator,
      threshold: preset.threshold,
    })
  }

  const selectedMetric = metricTypes.find(m => m.value === formData.metricType)
  const selectedOperator = operators.find(o => o.value === formData.operator)

  // Генерируем понятное описание правила
  const getRuleDescription = () => {
    const metric = metricTypes.find(m => m.value === formData.metricType)
    const op = operators.find(o => o.value === formData.operator)
    const period = periods.find(p => p.value === formData.periodDays)

    return `Если потрачено ≥ ${formData.minSpent}₽ И ${metric?.label.toLowerCase()} ${op?.label} ${formData.threshold}${metric?.unit} (${period?.label.toLowerCase()}), то группа будет отключена`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {/* Presets - only show when creating new rule */}
          {!rule && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Быстрые пресеты
              </label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="text-left p-3 text-sm border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
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
              placeholder="Например: Отключить без кликов при 75₽"
              required
            />
          </div>

          {/* Main condition: minSpent */}
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <label className="block text-sm font-medium text-orange-800 mb-2">
              Главное условие: минимальный расход (₽)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              className="input"
              value={formData.minSpent}
              onChange={(e) => setFormData({ ...formData, minSpent: parseFloat(e.target.value) || 0 })}
              required
            />
            <p className="text-xs text-orange-700 mt-1">
              Правило сработает только если группа потратила ≥ этой суммы
            </p>
          </div>

          {/* Metric condition */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <label className="block text-sm font-medium text-blue-800 mb-3">
              Дополнительное условие: метрика
            </label>

            <div className="grid grid-cols-3 gap-3">
              {/* Metric Type */}
              <div>
                <label className="block text-xs text-blue-700 mb-1">Метрика</label>
                <select
                  className="input"
                  value={formData.metricType}
                  onChange={(e) => {
                    const metric = metricTypes.find(m => m.value === e.target.value)
                    setFormData({
                      ...formData,
                      metricType: e.target.value,
                      threshold: metric?.defaultThreshold || 0,
                      operator: metric?.defaultOperator || 'eq'
                    })
                  }}
                >
                  {metricTypes.map((metric) => (
                    <option key={metric.value} value={metric.value}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator */}
              <div>
                <label className="block text-xs text-blue-700 mb-1">Условие</label>
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

              {/* Threshold */}
              <div>
                <label className="block text-xs text-blue-700 mb-1">Значение {selectedMetric?.unit}</label>
                <input
                  type="number"
                  step={formData.metricType === 'ctr' ? '0.01' : '1'}
                  min="0"
                  className="input"
                  value={formData.threshold}
                  onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
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

          {/* Active Toggle - only show when editing */}
          {rule && (
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
          )}

          {/* Rule Preview */}
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800 mb-1">Правило:</p>
            <p className="text-sm text-green-700">
              {getRuleDescription()}
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
              Ошибка при сохранении: {(mutation.error as any)?.response?.data?.message || 'Проверьте данные и попробуйте снова.'}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
