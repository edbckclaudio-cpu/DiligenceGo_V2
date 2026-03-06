'use client'

import { useEffect } from 'react'

export default function CordovaLoader() {
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : {}
    try {
      const isAndroidNative =
        !!w?.Capacitor?.isNativePlatform?.() && w?.Capacitor?.getPlatform?.() === 'android'
      if (!isAndroidNative) return
      const tryAlias = () => {
        try {
          if (w?.CdvPurchase?.store && !w.store) {
            w.store = w.CdvPurchase.store
          }
        } catch {}
      }
      if (w.cordova) {
        tryAlias()
        return
      }
      const s = document.createElement('script')
      s.src = 'cordova.js'
      s.type = 'text/javascript'
      s.defer = false
      s.async = false
      document.head.appendChild(s)
      try {
        document.addEventListener('deviceready', tryAlias, { once: true } as any)
      } catch {}
      setTimeout(tryAlias, 1000)
    } catch {}
  }, [])
  return null
}
