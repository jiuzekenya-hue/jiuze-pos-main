import { supabase } from '../lib/supabase'

export interface CashierUser {
  id: string
  email: string | null
  fullName: string | null
  phone: string | null
  role: 'owner' | 'cashier'
  createdAt: string
}

export interface CreateCashierInput {
  email: string
  password: string
  fullName?: string
  phone?: string
}

export async function listBusinessUsers(): Promise<CashierUser[]> {
  const { data, error } = await supabase.functions.invoke('manage-cashiers', {
    body: { action: 'list' },
  })
  if (error) throw error
  return (data?.users ?? []) as CashierUser[]
}

export async function createCashier(input: CreateCashierInput): Promise<CashierUser> {
  const { data, error } = await supabase.functions.invoke('manage-cashiers', {
    body: { action: 'create', ...input },
  })
  if (error) throw error
  if (!data?.user) throw new Error('Cashier account was not created.')
  return data.user as CashierUser
}

export async function deleteCashier(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-cashiers', {
    body: { action: 'delete', userId },
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error ?? 'Cashier account was not removed.')
}
