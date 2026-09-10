import { Upload } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function ImportsPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={Upload}
      title="Imports"
      phase="Phase 9"
      description="Bring your existing customers and sales in from a spreadsheet, with a guided review before anything is saved."
    />
  );
}
