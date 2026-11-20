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
  const signedIn = session !== null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/*
        The navigator is always rendered. Swapping it out for a loading view
        while the session resolves breaks route mounting entirely — the router
        has no navigator to attach routes to, and the result looks like a
        redirect loop rather than an error.

        Stack.Protected excludes a failing branch from the tree, so protected
        screens are never mounted rather than mounted and hidden. While the
        session is still unknown the signed-out branch is active, and the
        overlay below covers that moment so a returning user never sees
        sign-in flash past.

        None of this is a security boundary: RLS is what guarantees an
        unauthenticated client can read no rows.
      */}
      <Stack>
        {/* redirectTo fires when the guard fails, so each branch points at
            the other: signed out leaves the app for sign-in, signed in leaves
            the auth screens for home. */}
        <Stack.Protected guard={signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>

      {loading ? <Splash /> : null}
    </ThemeProvider>
  );
}
