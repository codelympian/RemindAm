import { BarChart3 } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function AnalyticsPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={BarChart3}
      title="Analytics"
      phase="Phase 16"
      description="See how your follow-ups convert — revenue, response rates and customer value — once there is enough data to be meaningful."
    />
  );
}
