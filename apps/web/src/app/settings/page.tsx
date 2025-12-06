'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { Settings as SettingsIcon, Bell, Database, Send, Loader2, CheckCircle } from 'lucide-react'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'

export default function SettingsPage() {
  const { currentAccount, refetchAccounts } = useVkAccount()
  const [telegramChatId, setTelegramChatId] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setTelegramChatId(currentAccount?.telegramChatId || '')
  }, [currentAccount])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount) return
      await api.put(`/vk-accounts/${currentAccount.id}`, {
        telegramChatId: telegramChatId || null
      })
    },
    onSuccess: () => {
      refetchAccounts()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount) return
      await api.post(`/vk-accounts/${currentAccount.id}/test-telegram`)
    },
    onSuccess: () => {
      alert('Тестовое сообщение отправлено!')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка отправки сообщения')
    }
  })

  return (
    <Layout>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Настройки</h1>

        <div className="space-y-6">
          {/* Telegram Settings */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bell className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Telegram уведомления
              </h2>
            </div>

            {currentAccount ? (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Настройки для аккаунта: <span className="font-medium text-gray-900">{currentAccount.name}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ваш Telegram Chat ID
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      className="input flex-1"
                      placeholder="Например: 123456789"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                    />
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="btn-primary flex items-center gap-2"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : saveSuccess ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : null}
                      Сохранить
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Чтобы узнать свой Chat ID, напишите боту @userinfobot в Telegram
                  </p>
                </div>

                {telegramChatId && (
                  <button
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                    className="btn-outline flex items-center gap-2"
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Отправить тестовое сообщение
                  </button>
                )}

                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Как настроить:</strong>
                  </p>
                  <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-blue-800">
                    <li>Найдите бота @userinfobot в Telegram</li>
                    <li>Напишите ему /start - он пришлёт ваш Chat ID</li>
                    <li>Скопируйте ID и вставьте в поле выше</li>
                    <li>Сохраните и отправьте тестовое сообщение</li>
                  </ol>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">
                Выберите VK аккаунт для настройки Telegram уведомлений
              </p>
            )}
          </div>

          {/* VK API Settings */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary-100 rounded-lg">
                <SettingsIcon className="w-5 h-5 text-primary-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">VK API</h2>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                VK токены настраиваются при добавлении аккаунтов. Выберите аккаунт в меню слева для управления.
              </p>
            </div>
          </div>

          {/* Database Settings */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Database className="w-5 h-5 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">База данных</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">PostgreSQL</span>
                <span className="badge badge-success">Подключено</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Redis</span>
                <span className="badge badge-success">Подключено</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
