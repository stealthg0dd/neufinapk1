// Manual mock for react-native-reanimated v4 (CJS-compatible for jest)
const React = require('react')
const { View, Text, Image, ScrollView } = require('react-native')

const NOOP = () => {}
const ID = (x) => x

function createAnimatedComponent(component) {
  return component
}

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  createAnimatedComponent,
}

module.exports = {
  default: Animated,
  ...Animated,
  createAnimatedComponent,
  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (_fn) => ({}),
  useAnimatedProps: (_fn) => ({}),
  withSpring: ID,
  withTiming: ID,
  withDelay: (_delay, animation) => animation,
  withRepeat: ID,
  withSequence: (...args) => args[0],
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  cancelAnimation: NOOP,
  Easing: { linear: ID, ease: ID, bezier: () => ID, in: ID, out: ID, inOut: ID },
  interpolate: (_value, _input, output) => output[0],
  Extrapolation: { CLAMP: 'clamp' },
  useAnimatedRef: () => ({ current: null }),
  useScrollViewOffset: () => ({ value: 0 }),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedGestureHandler: NOOP,
}
