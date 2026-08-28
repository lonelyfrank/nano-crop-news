export type RegionLevel = 'country' | 'macro_region' | 'region' | 'province'
export type RegionSourceType = 'source_default' | 'url_pattern' | 'rss_category' | 'gazetteer_match'

export interface RegionRow {
  id: number
  name: string
  level: RegionLevel
}

export interface RegionMatch {
  regionId: number
  sourceType: RegionSourceType
  confidence: number
}

export interface ArticleForGeoTagging {
  id: number
  title: string
  excerpt: string
  originalUrl: string
  rssCategory: string | null
  sourceId: number
  sourceName: string
}
