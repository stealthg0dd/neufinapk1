import { ImageResponse } from 'next/og'

export const size        = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          borderRadius: '6px',
          color: 'white',
          fontSize: '20px',
          fontWeight: '800',
          letterSpacing: '-1px',
        }}
      >
        N
      </div>
    ),
    { ...size }
  )
}
