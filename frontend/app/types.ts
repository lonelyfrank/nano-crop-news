export interface Source {
  id: number
  name: string
  website_url: string
  category: string | null
  logo_url: string | null
}

export interface Tag {
  id: number
  name: string
}

export interface Article {
  id: number
  title: string
  original_url: string
  excerpt: string
  summary_type: string | null
  summary_text: string | null
  author: string | null
  image_url: string | null
  published_at: string
  cluster_id: number | null
  source: Source
  tags: Tag[]
}
