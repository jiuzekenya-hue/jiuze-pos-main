import { supabase } from '../lib/supabase'
import type { Permission } from '../lib/permissions'
export interface CashierUser { id:string; email:string|null; fullName:string|null; phone:string|null; role:'owner'|'cashier'; createdAt:string; permissions?: Permission[]|null }
export interface CreateCashierInput { email:string; password:string; fullName?:string; phone?:string }
export async function listBusinessUsers():Promise<CashierUser[]> {
 const {data,error}=await supabase.functions.invoke('manage-cashiers',{body:{action:'list'}})
 if(error) throw error
 const users=(data?.users??[]) as CashierUser[]
 const ids=users.filter(u=>u.role==='cashier').map(u=>u.id)
 if(!ids.length) return users
 const {data: rows,error: permissionError}=await supabase.from('cashier_permissions').select('cashier_id,permissions').in('cashier_id',ids)
 if(permissionError) throw permissionError
 const byId=new Map((rows??[]).map((row:any)=>[row.cashier_id,row.permissions as Permission[]]))
 return users.map(u=>u.role==='cashier'?{...u,permissions:byId.has(u.id)?byId.get(u.id)!:null}:u)
}
export async function saveCashierPermissions(userId:string, businessId:string, permissions:readonly Permission[]):Promise<void> {
 const {error}=await supabase.from('cashier_permissions').upsert({cashier_id:userId,business_id:businessId,permissions:[...permissions]},{onConflict:'cashier_id'})
 if(error) throw error
}
export async function createCashier(input:CreateCashierInput):Promise<CashierUser> {
 const {data,error}=await supabase.functions.invoke('manage-cashiers',{body:{action:'create',...input}})
 if(error) throw error
 if(!data?.user) throw new Error('Cashier account was not created.')
 return data.user as CashierUser
}
export async function deleteCashier(userId:string):Promise<void> {
 const {data,error}=await supabase.functions.invoke('manage-cashiers',{body:{action:'delete',userId}})
 if(error) throw error
 if(!data?.success) throw new Error(data?.error??'Cashier account was not removed.')
}
