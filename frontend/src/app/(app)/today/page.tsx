import { CalendarCheck } from 'lucide-react';
import { PlaceholderScreen } from '@/components/app-shell/placeholder-screen';

export default function TodayPage(): React.JSX.Element {
  return (
    <PlaceholderScreen
      icon={CalendarCheck}
      title="Today"
      phase="Phase 12"
      description="Your prioritized “who to contact today” list — hot leads, reorders due, unpaid and reactivation — lands here once the recommendation engine is built."
    />
  );
}
