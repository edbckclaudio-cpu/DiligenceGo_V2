import type { CapacitorConfig } from '@capacitor/cli'

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
      serverClientId: '1027488415010-flsh69tg5qfq9vk98tj6e2c6h2lrul80.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    }
  }
}

export default config
