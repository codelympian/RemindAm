import { Banknote } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function SalesPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={Banknote}
      title="Sales"
      phase="Phase 6"
      description="Record sales and payments, link them to customers and products, and keep running balances up to date."
    />
  );
}
