'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import { useVkAccount } from '@/contexts/VkAccountContext'
import api from '@/lib/api'
import {
  Sparkles,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileText,
  Smartphone,
  Clock,
} from 'lucide-react'

type Objective = 'socialactivity' | 'lead_form' | 'appinstalls'

interface InventoryStats {
  adPlans: number
  adGroups: number
  banners: number
  textAtoms: number
  creativeAssets: number
  communityRefs: number
  audienceProfiles: number
  leadForms: number
  mobileApps: number
  packages: number
  bannerStats?: number
  cabinetAvgCpl?: number | null
  winners?: { texts: number; creatives: number; audiences: number }
  losers?: { texts: number; creatives: number; audiences: number }
}

interface InventorySync {
  id: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  stats: InventoryStats | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
}

interface LaunchRun {
  id: number
  strategy: string
  objective: string
  status: 'pending' | 'running' | 'success' | 'failed'
  resultCampaignId: string | null
  resultAdGroupIds: string[]
  resultBannerIds: string[]
  errorMessage: string | null
  selection: any
  durationMs: number | null
  createdAt: string
  completedAt: string | null
}

const OBJECTIVES: { value: Objective; label: string; icon: any; description: string }[] = [
  {
    value: 'socialactivity',
    label: 'Сообщения',
    icon: MessageSquare,
    description: 'Реклама сообщества VK — подписки, сообщения, вовлечённость',
  },
  {
    value: 'lead_form',
    label: 'Лид-форма',
    icon: FileText,
    description: 'Сбор заявок через VK Lead Form',
  },
  {
    value: 'appinstalls',
    label: 'Мобильное приложение',
    icon: Smartphone,
    description: 'Установка приложения (iOS / Android)',
  },
]

export default function AiLaunchPage() {
  const { currentAccount } = useVkAccount()
  const queryClient = useQueryClient()
  const [objective, setObjective] = useState<Objective>('socialactivity')
  const [campaignName, setCampaignName] = useState('')
  const [dailyBudget, setDailyBudget] = useState(200)
  const [creativesCount, setCreativesCount] = useState(3)
  const [lastResult, setLastResult] = useState<any>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const accountId = currentAccount?.id

  const statsQuery = useQuery<InventoryStats>({
    queryKey: ['ai-inventory-stats', accountId],
    queryFn: async () => (await api.get(`/ai-inventory/${accountId}/stats`)).data,
    enabled: !!accountId,
  })

  const syncQuery = useQuery<InventorySync | null>({
    queryKey: ['ai-inventory-latest', accountId],
    queryFn: async () => {
      const r = await api.get(`/ai-inventory/${accountId}/sync/latest`)
      return r.data || null
    },
    enabled: !!accountId,
    refetchInterval: (q) => {
      const data = q.state.data as InventorySync | null | undefined
      return data && (data.status === 'running' || data.status === 'pending') ? 2000 : false
    },
  })

  const runsQuery = useQuery<LaunchRun[]>({
    queryKey: ['ai-launch-runs', accountId],
    queryFn: async () => (await api.get(`/ai-launch/${accountId}/runs`)).data,
    enabled: !!accountId,
  })

  const syncMutation = useMutation({
    mutationFn: async () => (await api.post(`/ai-inventory/${accountId}/sync`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-inventory-latest', accountId] })
    },
    onError: (e: any) => {
      alert(e.response?.data?.message || e.message)
    },
  })

  const launchMutation = useMutation({
    mutationFn: async () => {
      setLastError(null)
      setLastResult(null)
      const body: any = { objective, dailyBudget, creativesCount }
      if (campaignName.trim()) body.campaignName = campaignName.trim()
      return (await api.post(`/ai-launch/${accountId}`, body)).data
    },
    onSuccess: (data) => {
      setLastResult(data)
      queryClient.invalidateQueries({ queryKey: ['ai-launch-runs', accountId] })
      queryClient.invalidateQueries({ queryKey: ['ai-inventory-stats', accountId] })
    },
    onError: (e: any) => {
      setLastError(e.response?.data?.message || e.message)
    },
  })

  const sync = syncQuery.data
  const stats = statsQuery.data
  const isSyncing = !!sync && (sync.status === 'running' || sync.status === 'pending')
  const hasInventory = stats && stats.banners > 0
  const canLaunch = !!accountId && hasInventory && !isSyncing && !launchMutation.isPending

  return (
    <Layout>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-600" />
            AI Quick-Launch
          </h1>
          <p className="text-gray-600 mt-1 text-sm">
            Одна кнопка — ИИ собирает кампанию из твоего опыта (что заливалось раньше) и создаёт её в кабинете в
            статусе <span className="font-semibold">blocked</span> (не запускается сама).
          </p>
        </div>

        {!currentAccount && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
            Выбери VK аккаунт в сайдбаре
          </div>
        )}

        {currentAccount && (
          <>
            {/* Inventory state */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 mb-1">База знаний ИИ</h2>
                  <p className="text-sm text-gray-500 mb-3">
                    Чем больше данных ИИ видит в твоих прошлых кампаниях — тем умнее подбирает связки.
                  </p>
                  {stats ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-sm">
                      <Stat label="Кампаний" value={stats.adPlans} />
                      <Stat label="Групп" value={stats.adGroups} />
                      <Stat label="Объявл." value={stats.banners} />
                      <Stat label="Текстов" value={stats.textAtoms} />
                      <Stat label="Креативов" value={stats.creativeAssets} />
                      <Stat label="Сообществ" value={stats.communityRefs} />
                      <Stat label="Аудиторий" value={stats.audienceProfiles} />
                      <Stat label="Лид-форм" value={stats.leadForms} />
                      <Stat label="Приложений" value={stats.mobileApps} />
                      <Stat label="Пакетов" value={stats.packages} />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Загружаю…</div>
                  )}
                </div>

                <button
                  onClick={() => syncMutation.mutate()}
                  disabled={isSyncing || syncMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {isSyncing || syncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Sync
                </button>
              </div>

              {stats?.winners && stats?.losers && (stats.bannerStats || 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">
                    Вердикты ИИ (по статистике за 30 дней
                    {stats.cabinetAvgCpl ? `, средний CPL по кабинету ${stats.cabinetAvgCpl.toFixed(0)}₽` : ''}):
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Verdict label="Тексты" winner={stats.winners.texts} loser={stats.losers.texts} />
                    <Verdict label="Креативы" winner={stats.winners.creatives} loser={stats.losers.creatives} />
                    <Verdict label="Аудитории" winner={stats.winners.audiences} loser={stats.losers.audiences} />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-2">
                    ИИ повышает вес winner-ов в 5× и снижает loser-ов в 10×. Без verdict-а (мало данных) — нейтральный вес.
                  </div>
                </div>
              )}

              {sync && (
                <div className="mt-4 pt-4 border-t border-gray-100 text-sm">
                  <div className="flex items-center gap-2 text-gray-700">
                    <SyncStatusIcon status={sync.status} />
                    <span>
                      Последний sync: <span className="font-medium">{sync.status}</span>
                    </span>
                    {sync.status === 'running' && (
                      <span className="text-gray-500">— {sync.progress}%</span>
                    )}
                    <span className="text-gray-400 ml-auto">
                      {new Date(sync.startedAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  {sync.status === 'failed' && sync.errorMessage && (
                    <div className="mt-2 text-red-600 text-xs">{sync.errorMessage}</div>
                  )}
                </div>
              )}
            </div>

            {/* Objective + launch */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Что заливаем</h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {OBJECTIVES.map((o) => {
                  const Icon = o.icon
                  const active = objective === o.value
                  return (
                    <button
                      key={o.value}
                      onClick={() => setObjective(o.value)}
                      className={`text-left border rounded-lg p-3 transition-colors ${
                        active
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${active ? 'text-purple-600' : 'text-gray-500'}`} />
                        <span className="font-medium text-sm">{o.label}</span>
                      </div>
                      <div className="text-xs text-gray-500">{o.description}</div>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Название кампании (опционально)</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder={`${objective}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">К имени всегда добавится «AI» в конце</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Дневной бюджет, ₽ (мин. 100)</label>
                  <input
                    type="number"
                    min={100}
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Креативов (1-10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={creativesCount}
                    onChange={(e) => setCreativesCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">1 креатив = 1 группа объявлений</p>
                </div>
              </div>

              <button
                onClick={() => launchMutation.mutate()}
                disabled={!canLaunch}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 text-base font-semibold bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {launchMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> ИИ собирает кампанию…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" /> Залить кампанию
                  </>
                )}
              </button>

              {!hasInventory && !isSyncing && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
                  ИИ ещё не видел твои кампании. Нажми <span className="font-semibold">Sync</span> сверху — это
                  займёт 1-3 минуты для крупного кабинета.
                </div>
              )}

              {lastError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="break-words">{lastError}</div>
                </div>
              )}

              {lastResult && (
                <div className="text-sm bg-green-50 border border-green-200 rounded p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-800 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Кампания #{lastResult.campaignId} создана в статусе blocked
                  </div>
                  <div className="text-xs text-gray-600">{lastResult.note}</div>
                  {lastResult.selection && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-700">Что выбрал ИИ</summary>
                      <pre className="mt-2 bg-white p-2 rounded border border-gray-200 overflow-auto text-[10px]">
                        {JSON.stringify(lastResult.selection, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> История запусков
              </h2>
              {runsQuery.data?.length ? (
                <div className="divide-y divide-gray-100">
                  {runsQuery.data.map((r) => (
                    <div key={r.id} className="py-3 flex items-center gap-3 text-sm">
                      <RunStatusIcon status={r.status} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">
                          #{r.id} · {r.objective}{' '}
                          {r.resultCampaignId && (
                            <span className="text-gray-500">→ VK #{r.resultCampaignId}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(r.createdAt).toLocaleString('ru-RU')} · {r.strategy}
                          {r.durationMs ? ` · ${r.durationMs}ms` : ''}
                        </div>
                        {r.status === 'failed' && r.errorMessage && (
                          <div className="text-xs text-red-600 mt-1 break-words">{r.errorMessage}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Запусков пока нет</div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

function Verdict({ label, winner, loser }: { label: string; winner: number; loser: number }) {
  return (
    <div className="bg-gray-50 rounded-md p-2">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-700 font-medium">✓ {winner}</span>
        <span className="text-red-700 font-medium">✗ {loser}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function SyncStatusIcon({ status }: { status: string }) {
  if (status === 'running' || status === 'pending') return <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-green-600" />
  if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-600" />
  return null
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === 'pending' || status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-600" />
  if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-600" />
  return null
}
