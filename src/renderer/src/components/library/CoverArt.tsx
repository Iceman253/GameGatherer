import { useState } from 'react'
import placeholderSvg from '../../assets/placeholder.svg'

interface CoverArtProps {
  src?: string
  alt: string
  className?: string
  onNaturalSize?: (width: number, height: number) => void
}

export default function CoverArt({ src, alt, className, onNaturalSize }: CoverArtProps): JSX.Element {
  const [errored, setErrored] = useState(false)

  return (
    <img
      src={!src || errored ? placeholderSvg : src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
      onLoad={(e) => {
        const img = e.currentTarget
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          onNaturalSize?.(img.naturalWidth, img.naturalHeight)
        }
      }}
      loading="lazy"
      decoding="async"
    />
  )
}
