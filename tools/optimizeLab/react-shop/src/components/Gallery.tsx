export function Gallery({ images }: { images: string[] }) {
  return (
    <div>
      {images.map((src) => (
        <img key={src} src={src} alt="" />
      ))}
    </div>
  )
}
