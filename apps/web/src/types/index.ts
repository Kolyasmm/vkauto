export interface VkAccount {
  id: number
  name: string
  isActive: boolean
  telegramChatId?: string | null
  createdAt: string
  updatedAt: string
  _count?: { rules: number }
}

export interface Rule {
  id: number
  name: string
  vkAccountId?: number
  vkAccount?: { id: number; name: string }
  adAccountId?: number
  cplThreshold: number
  minLeads: number
  copiesCount: number
  copyBudget?: number | null  // Бюджет для копий (null = как у оригинала)
  runTime: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  adAccount?: AdAccount
  executions?: RuleExecution[]
}

export interface AdAccount {
  id: number
  vkAccountId: number
  vkAdAccountId: bigint
  name?: string
  isActive: boolean
  createdAt: string
}

export interface RuleExecution {
  id: number
  ruleId: number
  executedAt: string
  groupsChecked: number
  groupsMatched: number
  copiesCreated: number
  status: 'success' | 'partial' | 'failed'
  errorMessage?: string
  details?: any
}

export interface AdGroup {
  id: number
  campaign_id: number
  name: string
  status: number
  all_limit?: number
  day_limit?: number
}

export interface Campaign {
  id: number
  name: string
  status: number
  day_limit?: number
  all_limit?: number
}

export interface Statistics {
  id: number
  day: string
  spent: number
  leads: number
  impressions: number
  clicks: number
}
