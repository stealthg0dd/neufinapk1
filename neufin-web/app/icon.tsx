import { ImageResponse } from 'next/og'

export const size = { width: 48, height: 48 }
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
          background: 'linear-gradient(135deg, #1EB8CC 0%, #0f766e 100%)',
          borderRadius: '10px',
          color: 'white',
          fontSize: '28px',
          fontWeight: '800',
          letterSpacing: '-2px',
        }}
      >
        N
      </div>
    ),
    { ...size }
  )
}
