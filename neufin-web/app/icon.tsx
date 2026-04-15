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
          background: 'linear-gradient(135deg, #1EB8CC 0%, #158A99 100%)',
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
