import { useState } from 'react'
import { useConfig } from '../app/ConfigProvider'
import { categoryArt } from '../lib/display'
import './ItemImage.css'
import { assetUrl } from '../lib/origin'

export default function ItemImage({ item, ratio = '4 / 3', className = '' }) {
  const { categoryByLabel } = useConfig()
  const art = categoryArt(categoryByLabel, item?.category)

  // A dead image URL otherwise renders the browser's broken-image icon.
  // Falling back to the category glyph reuses the no-image treatment.
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={`itemimg itemimg--${art.tint} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {item?.image_url && !failed ? (
        <img
          src={assetUrl(item.image_url)}
          alt={item.name || ''}
          loading="lazy"
          className="itemimg__photo"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="itemimg__glyph" aria-hidden="true">{art.glyph}</span>
      )}
    </div>
  )
}
