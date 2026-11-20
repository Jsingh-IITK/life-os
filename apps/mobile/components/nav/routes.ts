import type { Href } from 'expo-router';
import type { SymbolView } from 'expo-symbols';

type IconName = Parameters<typeof SymbolView>[0]['name'];

export interface NavRoute {
  /** Expo Router screen name inside (tabs). */
  name: string;
  href: Href;
  /**
   * Plain-string form of href, for active-state comparison. Href is a union
   * that includes object forms, so it cannot be compared with startsWith.
   */
  match: string;
  label: string;
  icon: IconName;
  /**
   * Declared in the design board but not built. Shown dimmed and labelled so
   * the roadmap is visible without implying a working feature — the PRD
   * forbids presenting future modules as live.
   */
  comingSoon?: boolean;
}

export const NAV_ROUTES: readonly NavRoute[] = [
  { name: 'index', href: '/', match: '/', label: 'Home', icon: { ios: 'house', android: 'home', web: 'home' } },
  {
    name: 'finance',
    href: '/finance', match: '/finance',
    label: 'Finance',
    icon: { ios: 'indianrupeesign.circle', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  },
  {
    name: 'fitness',
    href: '/fitness', match: '/fitness',
    label: 'Fitness',
    icon: { ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' },
  },
  {
    name: 'assistant',
    href: '/assistant', match: '/assistant',
    label: 'Assistant',
    icon: { ios: 'bubble.left.and.text.bubble.right', android: 'chat', web: 'chat' },
  },
  {
    name: 'settings',
    href: '/settings', match: '/settings',
    label: 'Settings',
    icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
  },
] as const;

/** Shown in the sidebar only — not routable until the modules exist. */
export const FUTURE_ROUTES: readonly { label: string; icon: IconName }[] = [
  { label: 'Routines', icon: { ios: 'repeat', android: 'repeat', web: 'repeat' } },
  { label: 'Journal', icon: { ios: 'book', android: 'book', web: 'book' } },
] as const;
