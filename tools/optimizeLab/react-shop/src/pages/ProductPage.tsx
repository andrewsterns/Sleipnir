import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { PriceTag, Rating, Gallery } from '../components'
import { useCart } from '../store/cartStore'
import { fetchProduct, type Product } from '../api/productApi'
import { formatTitle, track } from '../utils/helpers'
import { Reviews } from '../components/Reviews'
import { RecentlyViewed } from '../components/RecentlyViewed'

// A card the cart, checkout and "recently viewed" all reuse — trapped inside a page.
export function ProductCard({ product }: { product: Product }) {
  return (
    <article>
      <h3>{formatTitle(product.title)}</h3>
      <PriceTag cents={product.cents} />
      <Rating value={product.rating} />
    </article>
  )
}

// The 3D viewer only opens when someone clicks "View in 3D", yet three.js is
// imported statically above, so every visitor downloads it on first load.
function open3dViewer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas })
  renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera())
}

export function ProductPage({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null)
  const [show3d, setShow3d] = useState(false)
  const cart = useCart()
  useEffect(() => {
    void fetchProduct(id).then(setProduct)
    track('view', id)
  }, [id])
  if (!product) return null
  return (
    <section>
      <Gallery images={product.images} />
      <ProductCard product={product} />
      <button onClick={() => cart.add(product)}>Add to cart</button>
      <button onClick={() => setShow3d(true)}>View in 3D</button>
      {show3d && <canvas ref={(c) => c && open3dViewer(c)} />}
      <Reviews productId={id} />
      <RecentlyViewed items={[product]} />
    </section>
  )
}
