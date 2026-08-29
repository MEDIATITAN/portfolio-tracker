import type { PortfolioApi } from '../shared/types'

declare global {
  interface Window {
    api: PortfolioApi
  }
}
