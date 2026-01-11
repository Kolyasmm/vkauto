'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Rule } from '@/types'
import { X } from 'lucide-react'
import { useVkAccount } from '@/contexts/VkAccountContext'

interface RuleModalProps {
  rule?: Rule | null
  onClose: () => void
  onSuccess: () => void
}

export default function RuleModal({ rule, onClose, onSuccess }: RuleModalProps) {
  const { currentAccount } = useVkAccount()

  const [formData, setFormData] = useState({
    name: '',
    cplThreshold: 200,
    minLeads: 3,
    copiesCount: 3,
    copyBudget: '' as string | number,
    profitabilityCheck: 'cpl' as 'cpl' | 'leadstech',
    periodDays: 1,
    runTime: '09:00',
    isActive: true,
  })

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name,
        cplThreshold: Number(rule.cplThreshold),
        minLeads: rule.minLeads,
        copiesCount: rule.copiesCount,
        copyBudget: rule.copyBudget ?? '',
        profitabilityCheck: rule.profitabilityCheck || 'cpl',
        periodDays: rule.periodDays || 1,
        runTime: rule.runTime,
        isActive: rule.isActive,
      })
    }
  }, [rule])

  const mutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const payload = {
        ...data,
        copyBudget: data.copyBudget === '' ? null : Number(data.copyBudget),
        // При редактировании НЕ отправляем vkAccountId (не меняем привязку к аккаунту)
        // При создании привязываем к текущему аккаунту
        ...(rule ? {} : { vkAccountId: currentAccount?.id }),
      }
      if (rule) {
        return api.put(`/rules/${rule.id}`, payload)
      }
      return api.post('/rules', payload)
    },
    onSuccess,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {rule ? 'Редактировать правило' : 'Новое правило'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Current account indicator */}
          {currentAccount && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Правило для аккаунта: <span className="font-medium text-gray-900">{currentAccount.name}</span>
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Название правила
            </label>
            <input
              type="text"
              required
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Например: Автодублирование успешных групп"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Тип проверки прибыльности
            </label>
            <div className="space-y-2">
              <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="profitabilityCheck"
                  value="cpl"
                  checked={formData.profitabilityCheck === 'cpl'}
                  onChange={(e) => setFormData({ ...formData, profitabilityCheck: 'cpl' })}
                  className="w-4 h-4 mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">По CPL из VK Ads</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Проверка по стоимости лида и количеству лидов из статистики VK
                  </span>
                </div>
              </label>
              <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="profitabilityCheck"
                  value="leadstech"
                  checked={formData.profitabilityCheck === 'leadstech'}
                  onChange={(e) => setFormData({ ...formData, profitabilityCheck: 'leadstech' })}
                  className="w-4 h-4 mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">По реальной прибыльности (LeadsTech)</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Проверка реального дохода через LeadsTech (доход &gt; расход)
                  </span>
                </div>
              </label>
            </div>
          </div>

          {formData.profitabilityCheck === 'cpl' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Максимальный CPL (Р)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  className="input"
                  value={formData.cplThreshold}
                  onChange={(e) =>
                    setFormData({ ...formData, cplThreshold: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Группы с CPL выше этого значения не будут дублироваться
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Минимум лидов
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  className="input"
                  value={formData.minLeads}
                  onChange={(e) =>
                    setFormData({ ...formData, minLeads: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Минимальное количество лидов за вчера
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Период проверки прибыльности
              </label>
              <select
                className="input"
                value={formData.periodDays}
                onChange={(e) =>
                  setFormData({ ...formData, periodDays: Number(e.target.value) })
                }
              >
                <option value={1}>1 день (вчера)</option>
                <option value={3}>3 дня</option>
                <option value={7}>7 дней</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                За какой период проверять прибыльность через LeadsTech
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Количество копий
              </label>
              <input
                type="number"
                required
                min="1"
                max="10"
                className="input"
                value={formData.copiesCount}
                onChange={(e) =>
                  setFormData({ ...formData, copiesCount: Number(e.target.value) })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Сколько копий создавать для каждой успешной группы
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Бюджет копий (Р/день)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="input"
                value={formData.copyBudget}
                onChange={(e) =>
                  setFormData({ ...formData, copyBudget: e.target.value })
                }
                placeholder="Как у оригинала"
              />
              <p className="text-xs text-gray-500 mt-1">
                Оставьте пустым для копирования бюджета оригинала
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Время запуска (МСК)
              </label>
              <input
                type="time"
                required
                className="input"
                value={formData.runTime}
                onChange={(e) =>
                  setFormData({ ...formData, runTime: e.target.value })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Ежедневное время проверки и создания копий
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData({ ...formData, isActive: e.target.checked })
              }
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Правило активно (выполняется автоматически)
            </label>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? 'Сохранение...' : rule ? 'Обновить' : 'Создать'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Отмена
            </button>
          </div>

          {mutation.isError && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              Ошибка при сохранении правила: {(mutation.error as any)?.response?.data?.message || (mutation.error as any)?.message || 'Проверьте данные и попробуйте снова.'}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
