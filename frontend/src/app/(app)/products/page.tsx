import { Package } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function ProductsPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={Package}
      title="Products"
      phase="Phase 5"
      description="Manage your product catalogue — names, prices and details — ready to attach to sales and recommendations."
    />
  );
}
