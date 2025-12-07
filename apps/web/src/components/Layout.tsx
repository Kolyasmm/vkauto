'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  FileText,
  Play,
  LogOut,
  Users,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  Power,
  Copy
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useVkAccount } from '@/contexts/VkAccountContext'
import VkAccountModal from '@/components/VkAccountModal'
import api from '@/lib/api'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Правила', href: '/rules', icon: Play },
  { name: 'Автоотключение', href: '/auto-disable', icon: Power },
  { name: 'Масштабирование', href: '/scaling', icon: Copy },
  { name: 'История', href: '/history', icon: FileText },
  { name: 'Настройки', href: '/settings', icon: Settings },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { accounts, currentAccount, setCurrentAccount, isLoading, refetchAccounts } = useVkAccount()
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null)

  const handleDeleteAccount = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm('Вы уверены, что хотите удалить этот аккаунт? Все связанные правила также будут удалены.')) {
      return
    }

    setDeletingAccountId(accountId)
    try {
      await api.delete(`/vk-accounts/${accountId}`)

      // Если удаляем текущий аккаунт, сбрасываем выбор
      if (currentAccount?.id === accountId) {
        const remainingAccounts = accounts.filter(a => a.id !== accountId)
        setCurrentAccount(remainingAccounts[0] || null)
      }

      refetchAccounts()
    } catch (error) {
      console.error('Error deleting account:', error)
      alert('Ошибка при удалении аккаунта')
    } finally {
      setDeletingAccountId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <h1 className="text-xl font-bold text-primary-600">
              VK Automation
            </h1>
          </div>

          {/* Account Selector */}
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="relative">
              <button
                onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <Users className="w-5 h-5 mr-3 text-gray-500" />
                  <span className="truncate">
                    {isLoading ? 'Загрузка...' : currentAccount?.name || 'Выберите аккаунт'}
                  </span>
                </div>
                <ChevronDown className={clsx('w-4 h-4 transition-transform', isAccountDropdownOpen && 'rotate-180')} />
              </button>

              {isAccountDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  {accounts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      Нет аккаунтов
                    </div>
                  ) : (
                    accounts.map((account) => (
                      <div
                        key={account.id}
                        className={clsx(
                          'flex items-center w-full px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors group',
                          currentAccount?.id === account.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                        )}
                      >
                        <button
                          onClick={() => {
                            setCurrentAccount(account)
                            setIsAccountDropdownOpen(false)
                          }}
                          className="flex-1 text-left truncate"
                        >
                          <span>{account.name}</span>
                          {account.isShared && (
                            <span className="ml-1 text-xs text-gray-400">
                              (от {account.ownerEmail})
                            </span>
                          )}
                        </button>
                        {account._count && (
                          <span className="text-xs text-gray-400 mr-2">
                            {account._count.rules} правил
                          </span>
                        )}
                        {account.isOwner !== false && (
                          <button
                            onClick={(e) => handleDeleteAccount(account.id, e)}
                            disabled={deletingAccountId === account.id}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                            title="Удалить аккаунт"
                          >
                            {deletingAccountId === account.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                  <div className="border-t border-gray-200">
                    <button
                      onClick={() => {
                        setIsAccountDropdownOpen(false)
                        setIsAccountModalOpen(true)
                      }}
                      className="flex items-center w-full px-4 py-3 text-sm text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить аккаунт
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={clsx(
                    'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-200">
            {user && (
              <div className="px-4 py-2 mb-2 text-sm text-gray-600">
                {user.email}
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Выйти
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">{children}</main>
      </div>

      {/* Account Modal */}
      {isAccountModalOpen && (
        <VkAccountModal
          onClose={() => setIsAccountModalOpen(false)}
          onSuccess={() => setIsAccountModalOpen(false)}
        />
      )}
    </div>
  )
}
