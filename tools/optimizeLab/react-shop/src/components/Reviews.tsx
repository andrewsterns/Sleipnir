import { useEffect, useState } from 'react'
import { fetchReviews } from '../api/productApi'
import { Rating } from './Rating'

export function Reviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<{ id: string; stars: number; text: string }[]>([])
  useEffect(() => {
    void fetchReviews(productId).then(setReviews)
  }, [productId])
  return (
    <ul>
      {reviews.map((r) => (
        <li key={r.id}>
          <Rating value={r.stars} /> {r.text}
        </li>
      ))}
    </ul>
  )
}
