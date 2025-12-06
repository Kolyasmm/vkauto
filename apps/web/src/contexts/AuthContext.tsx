'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import api from '@/lib/api'

interface User {
  id: number
  email: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const publicRoutes = ['/login', '/register', '/']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token')

      if (!token) {
        setIsLoading(false)
        if (pathname && !publicRoutes.includes(pathname)) {
          router.push('/login')
        }
        return
      }

      try {
        const response = await api.get('/auth/me')
        setUser(response.data)
        setIsLoading(false)
      } catch (error) {
        localStorage.removeItem('token')
        setUser(null)
        setIsLoading(false)
        if (pathname && !publicRoutes.includes(pathname)) {
          router.push('/login')
        }
      }
    }

    checkAuth()
  }, [pathname, router])

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    router.push('/login')
  }

  // Перенаправление авторизованных пользователей с публичных страниц
  useEffect(() => {
    if (!isLoading && user && pathname && publicRoutes.includes(pathname)) {
      router.push('/dashboard')
    }
  }, [isLoading, user, pathname, router])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
