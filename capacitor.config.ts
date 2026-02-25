import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.diligencego.app',
  appName: 'DiligenceGo',
  webDir: 'out',
  server: {
    allowNavigation: ['dados.cvm.gov.br']
  }
}

export default config
