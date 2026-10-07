import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/auth-context'
import { getBusiness, type BusinessMode } from '../services/businessService'
import Checkout from './Checkout'
import RestaurantCheckout from './RestaurantCheckout'

export default function ModeAwareCheckout() {
  const { profile } = useAuth()
  const [mode, setMode] = useState<BusinessMode>('retail')

  useEffect(() => {
    if (!profile?.businessId) return
    void getBusiness(profile.businessId).then((business) => setMode(business.businessMode)).catch(() => setMode('retail'))
  }, [profile?.businessId])

  return mode === 'bar_restaurant' ? <RestaurantCheckout /> : <Checkout />
}
