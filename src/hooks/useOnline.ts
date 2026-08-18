import { useEffect, useState } from 'react'

export const useOnline = (): boolean => {
  // Server-render and the very first client render must agree, so start optimistic
  // and correct on mount. navigator.onLine is unavailable during static export.
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const update = () => setIsOnline(window.navigator.onLine)
    update()

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return isOnline
}
