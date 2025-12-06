'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { VkAccount } from '@/types'
import { useAuth } from './AuthContext'

interface VkAccountContextType {
  accounts: VkAccount[]
  currentAccount: VkAccount | null
  setCurrentAccount: (account: VkAccount | null) => void
  isLoading: boolean
  refetchAccounts: () => void
}

const VkAccountContext = createContext<VkAccountContextType | undefined>(undefined)

export function VkAccountProvider({ children }: { children: ReactNode }) {
  const [currentAccount, setCurrentAccountState] = useState<VkAccount | null>(null)
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const { data: accounts = [], isLoading, refetch } = useQuery<VkAccount[]>({
    queryKey: ['vk-accounts'],
    queryFn: async () => {
      const response = await api.get('/vk-accounts')
      return response.data
    },
    enabled: isAuthenticated && !authLoading,
  })

  // При загрузке аккаунтов выбираем первый активный или восстанавливаем из localStorage
  useEffect(() => {
    if (accounts.length > 0 && !currentAccount) {
      const savedAccountId = localStorage.getItem('currentVkAccountId')
      if (savedAccountId) {
        const savedAccount = accounts.find(a => a.id === parseInt(savedAccountId))
        if (savedAccount) {
          setCurrentAccountState(savedAccount)
          return
        }
      }
      // Выбираем первый активный аккаунт
      const firstActive = accounts.find(a => a.isActive) || accounts[0]
      setCurrentAccountState(firstActive)
    }
  }, [accounts, currentAccount])

  const setCurrentAccount = (account: VkAccount | null) => {
    setCurrentAccountState(account)
    if (account) {
      localStorage.setItem('currentVkAccountId', account.id.toString())
    } else {
      localStorage.removeItem('currentVkAccountId')
    }
  }

  return (
    <VkAccountContext.Provider
      value={{
        accounts,
        currentAccount,
        setCurrentAccount,
        isLoading,
        refetchAccounts: refetch,
      }}
    >
      {children}
    </VkAccountContext.Provider>
  )
}

export function useVkAccount() {
  const context = useContext(VkAccountContext)
  if (context === undefined) {
    throw new Error('useVkAccount must be used within a VkAccountProvider')
  }
  return context
}
