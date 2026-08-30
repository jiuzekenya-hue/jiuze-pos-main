import { useEffect, useState } from 'react'

/**
 * Tracks browser connectivity so the UI can surface a clear online/offline
 * indicator. Per spec: V1 is online-first — this is purely informational.
 * It must never be used to represent a sale as complete while offline.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
