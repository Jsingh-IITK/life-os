import { Stack } from 'expo-router';

/**
 * Naming the initial route means a navigation to the group itself resolves to
 * sign-in. The alternative — an index screen that redirects — ping-pongs
 * against the root guards once signed in: it pushes to /sign-in, which is then
 * in an excluded branch, which redirects back, until React gives up with
 * "maximum update depth exceeded".
 */
export const unstable_settings = {
  initialRouteName: 'sign-in',
};

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
