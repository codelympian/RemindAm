import {
  Banknote,
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Primary navigation for the authenticated app shell (master prompt §17). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Today', href: '/today', icon: CalendarCheck },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Leads', href: '/leads', icon: UserPlus },
  { label: 'Sales', href: '/sales', icon: Banknote },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'Imports', href: '/imports', icon: Upload },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];
