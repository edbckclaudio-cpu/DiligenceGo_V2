import type { CapacitorConfig } from '@capacitor/cli'

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID || ''

const config: CapacitorConfig = {
  appId: 'com.diligencego.app',
  appName: 'DiligenceGo',
  webDir: 'out',
  server: {
    allowNavigation: ['dados.cvm.gov.br', 'accounts.google.com', 'oauth.googleusercontent.com', 'google.com', 'sites.google.com']
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: GOOGLE_WEB_CLIENT_ID,
      forceCodeForRefreshToken: true
    }
  }
}

export default config
