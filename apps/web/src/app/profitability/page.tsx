'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  DollarSign,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'
import clsx from 'clsx'

interface BannerProfitability {
  bannerId: number
  bannerName?: string
  adGroupId: number
  campaignId: number
  status: string
  spent: number
  clicks: number
  shows: number
  goals: number
  income: number
  conversions: number
  approved: number
  cr: number
  ar: number
  profit: number
  roi: number
  isProfitable: boolean
}

interface ProfitabilityResult {
  profitable: BannerProfitability[]
  unprofitable: BannerProfitability[]
  noData: BannerProfitability[]
  summary: {
    totalBanners: number
    profitableBanners: number
    unprofitableBanners: number
    noDataBanners: number
    totalSpent: number
    totalIncome: number
    totalProfit: number
    overallROI: number
  }
  period: {
    days: number
    dateStart: string
    dateEnd: string
  }
}

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

export default function ProfitabilityPage() {
  const { currentAccount } = useVkAccount()
  const [days, setDays] = useState(7)
  const [showUnprofitable, setShowUnprofitable] = useState(false)
  const [showNoData, setShowNoData] = useState(false)

  const { data, isLoading, error, refetch, isFetching } = useQuery<ProfitabilityResult>({
    queryKey: ['profitability', currentAccount?.id, days],
    queryFn: async () => {
      if (!currentAccount) return null
      const response = await api.get(`/profitability?vkAccountId=${currentAccount.id}&days=${days}`)
      return response.data
    },
    enabled: !!currentAccount,
    staleTime: 5 * 60 * 1000, // 5 минут
  })

  if (!currentAccount) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Выберите VK аккаунт для анализа прибыльности</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Прибыльность</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Анализ доходов и расходов по объявлениям
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Period selector */}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input py-2 px-3"
            >
              <option value={1}>Сегодня</option>
              <option value={3}>3 дня</option>
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
            </select>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn-outline flex items-center gap-2"
            >
              <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
              Обновить
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
              <p className="text-gray-500">Загрузка данных из VK Ads и LeadsTech...</p>
            </div>
          </div>
        ) : error ? (
          <div className="card bg-red-50 border-red-200">
            <p className="text-red-700">Ошибка загрузки данных</p>
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Расход</p>
                    <p className="text-lg font-bold text-gray-900">{formatMoney(data.summary.totalSpent)}</p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Доход</p>
                    <p className="text-lg font-bold text-gray-900">{formatMoney(data.summary.totalIncome)}</p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'p-2 rounded-lg',
                    data.summary.totalProfit >= 0 ? 'bg-green-100' : 'bg-red-100'
                  )}>
                    {data.summary.totalProfit >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Прибыль</p>
                    <p className={clsx(
                      'text-lg font-bold',
                      data.summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {formatMoney(data.summary.totalProfit)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ROI</p>
                    <p className={clsx(
                      'text-lg font-bold',
                      data.summary.overallROI >= 100 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {formatPercent(data.summary.overallROI)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-4 mb-6 text-sm">
              <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
                {data.summary.profitableBanners} прибыльных
              </div>
              <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">
                {data.summary.unprofitableBanners} убыточных
              </div>
              <div className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">
                {data.summary.noDataBanners} без данных
              </div>
              <div className="text-gray-500">
                Период: {data.period.dateStart.replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')} - {data.period.dateEnd.replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')}
              </div>
            </div>

            {/* Profitable Banners */}
            {data.profitable.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Прибыльные объявления ({data.profitable.length})
                </h2>
                <div className="space-y-2">
                  {data.profitable.map((banner) => (
                    <BannerCard key={banner.bannerId} banner={banner} />
                  ))}
                </div>
              </div>
            )}

            {/* Unprofitable Banners - collapsible */}
            {data.unprofitable.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => setShowUnprofitable(!showUnprofitable)}
                  className="w-full flex items-center justify-between text-lg font-semibold text-gray-900 mb-3 p-2 hover:bg-gray-50 rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                    Убыточные объявления ({data.unprofitable.length})
                  </span>
                  {showUnprofitable ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {showUnprofitable && (
                  <div className="space-y-2">
                    {data.unprofitable.map((banner) => (
                      <BannerCard key={banner.bannerId} banner={banner} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* No Data Banners - collapsible */}
            {data.noData.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => setShowNoData(!showNoData)}
                  className="w-full flex items-center justify-between text-lg font-semibold text-gray-900 mb-3 p-2 hover:bg-gray-50 rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                    Без данных в LeadsTech ({data.noData.length})
                  </span>
                  {showNoData ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {showNoData && (
                  <div className="space-y-2">
                    {data.noData.map((banner) => (
                      <BannerCard key={banner.bannerId} banner={banner} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {data.profitable.length === 0 && data.unprofitable.length === 0 && (
              <div className="card text-center py-12">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Нет данных для анализа
                </h3>
                <p className="text-gray-500">
                  Убедитесь, что у вас есть активные объявления и данные в LeadsTech
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Layout>
  )
}

function BannerCard({ banner }: { banner: BannerProfitability }) {
  return (
    <div className={clsx(
      'card p-3 sm:p-4 hover:shadow-md transition-shadow',
      banner.isProfitable ? 'border-l-4 border-l-green-500' : banner.profit < 0 ? 'border-l-4 border-l-red-500' : ''
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">
              ID: {banner.bannerId}
            </h3>
            <span className="text-xs text-gray-400">
              Группа: {banner.adGroupId}
            </span>
            <a
              href={`https://ads.vk.com/hq/dashboard/ads?banner_id=${banner.bannerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-primary-600"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          {banner.bannerName && (
            <p className="text-sm text-gray-500 truncate">{banner.bannerName}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
          {/* Spent */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Расход:</span>
            <span className="font-medium text-red-600">{formatMoney(banner.spent)}</span>
          </div>

          {/* Income */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Доход:</span>
            <span className="font-medium text-green-600">{formatMoney(banner.income)}</span>
          </div>

          {/* Profit */}
          <div className={clsx(
            'px-2 py-1 rounded-lg font-medium',
            banner.profit > 0 ? 'bg-green-100 text-green-700' :
            banner.profit < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          )}>
            {banner.profit >= 0 ? '+' : ''}{formatMoney(banner.profit)}
          </div>

          {/* ROI */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">ROI:</span>
            <span className={clsx(
              'font-medium',
              banner.roi >= 100 ? 'text-green-600' : 'text-red-600'
            )}>
              {formatPercent(banner.roi)}
            </span>
          </div>

          {/* CR and AR from LeadsTech */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              CR: <span className="font-medium text-gray-700">{banner.cr.toFixed(1)}%</span>
            </span>
            <span className="text-gray-500">
              AR: <span className="font-medium text-gray-700">{banner.ar.toFixed(1)}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
