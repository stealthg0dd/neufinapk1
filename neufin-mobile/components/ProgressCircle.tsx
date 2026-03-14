import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

interface Props {
  score: number
  size?: number
  strokeWidth?: number
}

export default function ProgressCircle({ score, size = 160, strokeWidth = 12 }: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = circumference - (score / 100) * circumference

  const color =
    score >= 70 ? '#22c55e'
    : score >= 40 ? '#f59e0b'
    : '#ef4444'

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={filled}
        />
      </Svg>

      <View style={styles.label}>
        <Text style={[styles.score, { color }]}>{score}</Text>
        <Text style={styles.subtitle}>DNA Score</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    alignItems: 'center',
  },
  score: {
    fontSize: 38,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
})
