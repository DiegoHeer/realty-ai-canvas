import { OnboardingFlow } from '@/components/onboarding/flow';

/**
 * First-run intro tour route. Reached via the native-only redirect in the root
 * layout while onboarding is pending, and from the profile "Replay intro" action.
 * The flow component owns the pager, staged choices and navigation.
 */
export default function OnboardingScreen() {
  return <OnboardingFlow />;
}
