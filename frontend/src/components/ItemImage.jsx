import { useConfig } from '../app/ConfigProvider'
import { categoryArt } from '../lib/display'
import './ItemImage.css'
import { assetUrl } from '../lib/origin'

export default function ItemImage({ item, ratio = '4 / 3', className = '' }) {
  const { categoryByLabel } = useConfig()
  const art = categoryArt(categoryByLabel, item?.category)

  return (
    <div
      className={`itemimg itemimg--${art.tint} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {item?.image_url ? (
        <img
          src={assetUrl(item.image_url)}
          alt={item.name || ''}
          loading="lazy"
          className="itemimg__photo"
        />
      ) : (
        <span className="itemimg__glyph" aria-hidden="true">{art.glyph}</span>
      )}
    </div>
  )
}
