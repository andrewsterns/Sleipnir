export interface Product {
  id: string
  title: string
  cents: number
  rating: number
  images: string[]
}

export async function fetchProduct(id: string): Promise<Product> {
  return (await fetch('/api/products/' + id)).json()
}

export async function fetchReviews(id: string) {
  return (await fetch('/api/products/' + id + '/reviews')).json()
}
