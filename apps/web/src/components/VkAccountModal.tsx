'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface VkAccountModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function VkAccountModal({ onClose, onSuccess }: VkAccountModalProps) {
  const [name, setName] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [tokenError, setTokenError] = useState('')
  const queryClient = useQueryClient()

  const validateMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await api.post('/vk-accounts/validate-token', { accessToken: token })
      return response.data
    },
    onMutate: () => {
      setTokenStatus('validating')
      setTokenError('')
    },
    onSuccess: (data) => {
      if (data.valid) {
        setTokenStatus('valid')
      } else {
        setTokenStatus('invalid')
        setTokenError(data.error || 'Невалидный токен')
      }
    },
    onError: (error: any) => {
      setTokenStatus('invalid')
      setTokenError(error.response?.data?.message || 'Ошибка проверки токена')
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/vk-accounts', { name, accessToken })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vk-accounts'] })
      onSuccess()
    },
  })

  const handleValidateToken = () => {
    if (accessToken.trim()) {
      validateMutation.mutate(accessToken.trim())
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tokenStatus === 'valid') {
      createMutation.mutate()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Добавить VK аккаунт
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Название аккаунта
            </label>
            <input
              type="text"
              required
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Основной или Клиент 1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Название для удобной идентификации аккаунта
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API токен VK Ads
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                required
                className="input flex-1"
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value)
                  setTokenStatus('idle')
                }}
                placeholder="Вставьте токен из VK Ads API"
              />
              <button
                type="button"
                onClick={handleValidateToken}
                disabled={!accessToken.trim() || validateMutation.isPending}
                className="btn btn-secondary whitespace-nowrap"
              >
                {validateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Проверить'
                )}
              </button>
            </div>

            {tokenStatus === 'valid' && (
              <div className="flex items-center gap-2 mt-2 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                Токен валиден
              </div>
            )}

            {tokenStatus === 'invalid' && (
              <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {tokenError}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              Получите токен в{' '}
              <a
                href="https://ads.vk.com/hq/settings/access"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                настройках VK Рекламы
              </a>
            </p>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={tokenStatus !== 'valid' || createMutation.isPending}
              className="btn btn-primary flex-1"
            >
              {createMutation.isPending ? 'Сохранение...' : 'Добавить аккаунт'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Отмена
            </button>
          </div>

          {createMutation.isError && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              Ошибка при сохранении аккаунта. Проверьте данные и попробуйте снова.
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
