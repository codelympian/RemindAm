import { UserPlus } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function LeadsPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={UserPlus}
      title="Leads"
      phase="Phase 7"
      description="Track leads through their stages, from new enquiry to won, so no interested buyer slips through the cracks."
    />
  );
}
