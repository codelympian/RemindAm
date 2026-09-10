import { Settings } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function SettingsPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={Settings}
      title="Settings"
      phase="Phase 17"
      description="Manage your business profile, team, subscription and preferences from here."
    />
  );
}
