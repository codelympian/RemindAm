import { Users } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function CustomersPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={Users}
      title="Customers"
      phase="Phase 4"
      description="Create, search, tag and profile your customers — purchase history, outstanding debt, lead status and last contact — all in one place."
    />
  );
}
