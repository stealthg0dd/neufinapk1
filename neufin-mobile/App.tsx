import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import UploadScreen from '@/screens/UploadScreen'
import ResultsScreen from '@/screens/ResultsScreen'
import ShareScreen from '@/screens/ShareScreen'
import type { DNAResult } from '@/lib/api'

export type RootStackParamList = {
  Upload: undefined
  Results: { result: DNAResult }
  Share: { result: DNAResult }
}

const Stack = createStackNavigator<RootStackParamList>()

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#030712',
    card: '#0d1117',
    text: '#f1f5f9',
    border: '#1f2937',
    primary: '#3b82f6',
    notification: '#3b82f6',
  },
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Upload"
          screenOptions={{
            headerStyle: { backgroundColor: '#0d1117' },
            headerTintColor: '#f1f5f9',
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            headerBackTitleVisible: false,
            cardStyle: { backgroundColor: '#030712' },
          }}
        >
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={{
              title: 'Your DNA Score',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="Share"
            component={ShareScreen}
            options={{
              title: 'Share',
              headerBackTitle: 'Results',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}
