'use client'

import { useEffect } from 'react'

export default function CordovaLoader() {
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : {}
    try {
      const isAndroidNative =
        !!w?.Capacitor?.isNativePlatform?.() && w?.Capacitor?.getPlatform?.() === 'android'
      if (!isAndroidNative) return
      if (w.cordova) return
      const s = document.createElement('script')
      s.src = 'cordova.js'
      s.type = 'text/javascript'
      s.defer = false
      s.async = false
      document.head.appendChild(s)
    } catch {}
  }, [])
  return null
}
