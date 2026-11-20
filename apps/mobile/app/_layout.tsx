import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Splash } from '@/components/Splash';
import { useColorScheme } from '@/components/useColorScheme';
import { SessionProvider, useSession } from '@/lib/auth/session';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SessionProvider>
      <RootLayoutNav />
    </SessionProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();

  // Until the stored session has been read, neither branch is known to be
  // correct. Rendering the app here is what caused the server-rendered page to
  // show Home to a signed-out visitor before the client redirected; rendering
  // nothing left the page blank. A loading state is never the wrong answer.
  if (loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Splash />
      </ThemeProvider>
    );
  }

  const signedIn = session !== null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/*
          Declarative guards rather than a redirect in an effect. Expo Router
          excludes a failing branch from the navigation tree entirely, so the
          protected screens are never mounted and never rendered — which is why
          this removes the flash of app content instead of merely hiding it.

          Still not a security boundary: RLS is what guarantees an
          unauthenticated client can reach no rows.
        */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
