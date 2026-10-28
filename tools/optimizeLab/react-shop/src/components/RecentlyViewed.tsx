import { ProductCard } from '../pages/ProductPage'
import type { Product } from '../api/productApi'

export function RecentlyViewed({ items }: { items: Product[] }) {
  return (
    <aside>
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </aside>
  )
}
