import { Pressable, Text } from 'react-native'

export function HomeScreen() {
  return (
    <>
      <Text>Uygulamayi kesfet</Text>
      <Pressable accessibilityLabel="Devam et">
        <Text>Devam et</Text>
      </Pressable>
    </>
  )
}
