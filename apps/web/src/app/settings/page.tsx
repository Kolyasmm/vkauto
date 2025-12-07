'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { Settings as SettingsIcon, Bell, Database, Send, Loader2, CheckCircle, Users, Trash2, X, UserPlus } from 'lucide-react'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import { SharedUser } from '@/types'

export default function SettingsPage() {
  const { currentAccount, refetchAccounts } = useVkAccount()
  const [telegramChatId, setTelegramChatId] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareCanEdit, setShareCanEdit] = useState(false)

  useEffect(() => {
    setTelegramChatId(currentAccount?.telegramChatId || '')
  }, [currentAccount])

  // Fetch shared users for current account
  const { data: sharedUsers = [], refetch: refetchSharedUsers } = useQuery<SharedUser[]>({
    queryKey: ['shared-users', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount || currentAccount.isOwner === false) return []
      const response = await api.get(`/vk-accounts/${currentAccount.id}/shared-users`)
      return response.data
    },
    enabled: !!currentAccount && currentAccount.isOwner !== false,
  })

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

  // Share account mutation
  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!currentAccount) return
      await api.post(`/vk-accounts/${currentAccount.id}/share`, {
        email: shareEmail,
        canEdit: shareCanEdit,
      })
    },
    onSuccess: () => {
      setShareEmail('')
      setShareCanEdit(false)
      refetchSharedUsers()
      refetchAccounts()
      alert('Доступ предоставлен!')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка предоставления доступа')
    }
  })

  // Revoke access mutation
  const revokeMutation = useMutation({
    mutationFn: async (userId: number) => {
      if (!currentAccount) return
      await api.delete(`/vk-accounts/${currentAccount.id}/share/${userId}`)
    },
    onSuccess: () => {
      refetchSharedUsers()
      refetchAccounts()
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка отзыва доступа')
    }
  })

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, canEdit }: { userId: number; canEdit: boolean }) => {
      if (!currentAccount) return
      await api.put(`/vk-accounts/${currentAccount.id}/share/${userId}`, { canEdit })
    },
    onSuccess: () => {
      refetchSharedUsers()
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Ошибка обновления прав')
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

          {/* Account Sharing Settings */}
          {currentAccount && currentAccount.isOwner !== false && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Доступ к аккаунту
                </h2>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Предоставьте доступ к аккаунту <span className="font-medium text-gray-900">{currentAccount.name}</span> другим пользователям
                  </p>
                </div>

                {/* Add share form */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email пользователя
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        className="input flex-1"
                        placeholder="user@example.com"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                      />
                      <button
                        onClick={() => shareMutation.mutate()}
                        disabled={shareMutation.isPending || !shareEmail}
                        className="btn-primary flex items-center gap-2"
                      >
                        {shareMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        Добавить
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={shareCanEdit}
                      onChange={(e) => setShareCanEdit(e.target.checked)}
                    />
                    <span className="text-sm text-gray-600">Разрешить редактирование правил</span>
                  </label>
                </div>

                {/* Shared users list */}
                {sharedUsers.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Пользователи с доступом:</h3>
                    <div className="space-y-2">
                      {sharedUsers.map((user) => (
                        <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{user.email}</span>
                            <span className="ml-2 text-xs text-gray-500">
                              {user.canEdit ? '(может редактировать)' : '(только просмотр)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updatePermissionsMutation.mutate({
                                userId: user.userId,
                                canEdit: !user.canEdit
                              })}
                              disabled={updatePermissionsMutation.isPending}
                              className="text-xs text-primary-600 hover:text-primary-700"
                            >
                              {user.canEdit ? 'Убрать редактирование' : 'Разрешить редактирование'}
                            </button>
                            <button
                              onClick={() => revokeMutation.mutate(user.userId)}
                              disabled={revokeMutation.isPending}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Отозвать доступ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-800">
                    <strong>Как это работает:</strong>
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-purple-800">
                    <li>Пользователь должен быть зарегистрирован в системе</li>
                    <li>После добавления аккаунт появится у пользователя в списке</li>
                    <li>Права &quot;редактирование&quot; позволяют создавать/изменять правила</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Shared account info */}
          {currentAccount && currentAccount.isShared && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Информация о доступе
                </h2>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Этот аккаунт предоставлен вам пользователем <span className="font-medium text-gray-900">{currentAccount.ownerEmail}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {currentAccount.canEdit ? 'Вы можете редактировать правила' : 'Только просмотр'}
                </p>
              </div>
            </div>
          )}

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
