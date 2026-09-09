import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { listBusinesses } from '@/services/api/businesses';
import { OnboardingWizard } from './onboarding-wizard';

/**
 * Onboarding entry. A caller who already has a business is sent straight to the
 * dashboard (creating additional businesses is a later concern); a brand-new
 * user gets the wizard. A read failure does not block onboarding — the wizard's
 * own submit surfaces any backend error honestly.
 */
export default async function OnboardingPage(): Promise<React.JSX.Element> {
  const { getToken } = await auth();
  const token = await getToken();

  let hasBusiness = false;
  try {
    const businesses = await listBusinesses(token);
    hasBusiness = businesses.length > 0;
  } catch {
    hasBusiness = false;
  }

  if (hasBusiness) {
    redirect('/dashboard');
  }

  return <OnboardingWizard />;
}
