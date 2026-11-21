import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Splash } from '@/components/Splash';
import { ThemeProvider, useTheme } from '@/design/theme';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { QueryProvider } from '@/lib/queries/client';

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
  // Inter carries the whole type scale. Four cuts rather than a variable font:
  // React Native resolves discrete weights to concrete font files.
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
    <ThemeProvider>
      <SessionProvider>
        {/* Inside SessionProvider: queries are scoped by user id, so the
            cache must not outlive the session that filled it. */}
        <QueryProvider>
          <RootLayoutNav />
        </QueryProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootLayoutNav() {
  const { scheme, colors } = useTheme();
  const { session, loading } = useSession();
  const signedIn = session !== null;

  // While the stored session is still being read, keep BOTH branches in the
  // tree. Stack.Protected removes a failing branch's routes entirely, so
  // excluding one here means a deep link to a route inside it does not exist
  // at the moment the router resolves the URL — it falls back to the anchor
  // and the destination is lost. Reloading on /finance would land you on /.
  //
  // Mounting both costs nothing visible: the splash overlay covers this window,
  // and every query is gated on a user id so none of them fire yet.
  const mountApp = signedIn || loading;
  const mountAuth = !signedIn || loading;

  // Feed the navigation theme from the same tokens, so navigator chrome
  // (card backgrounds, transitions) matches the design system rather than
  // falling back to React Navigation's defaults.
  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.backgroundPrimary,
      card: colors.surfacePrimary,
      text: colors.textPrimary,
      border: colors.borderPrimary,
      primary: colors.brandPrimary,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/*
        The navigator is always rendered. Swapping it for a loading view breaks
        route mounting entirely — the router has no navigator to attach routes
        to, which presents as a redirect loop rather than an error.

        Stack.Protected excludes a failing branch from the tree, so protected
        screens are never mounted. redirectTo fires when a guard fails, so each
        branch points at the other.

        None of this is a security boundary: RLS is what guarantees an
        unauthenticated client can read no rows.
      */}
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.backgroundPrimary } }}>
        <Stack.Protected guard={mountApp} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'About' }} />
          <Stack.Screen
            name="transaction/new"
            options={{ presentation: 'modal', title: 'Add transaction' }}
          />
          <Stack.Screen
            name="transaction/[id]"
            options={{ presentation: 'modal', title: 'Edit transaction' }}
          />
          <Stack.Screen name="transactions" options={{ title: "All transactions" }} />
          <Stack.Screen name="budget" options={{ title: 'Budget' }} />
        </Stack.Protected>

        <Stack.Protected guard={mountAuth} redirectTo="/">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>

      {loading ? <Splash /> : null}
    </NavThemeProvider>
  );
}
