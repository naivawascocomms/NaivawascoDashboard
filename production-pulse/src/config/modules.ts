// Single source of truth for the app's modules: sidebar navigation,
// route paths, and page headers are all derived from this config.

import {
  AlertTriangle,
  Banknote,
  Calendar,
  ClipboardList,
  Droplets,
  Factory,
  FileText,
  HardHat,
  LifeBuoy,
  LucideIcon,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';

export type ModuleStatus = 'active' | 'planned';

export interface ModuleDef {
  id: string;
  /** Route path relative to the app root, e.g. "daily" → "/daily" */
  path: string;
  label: string;
  icon: LucideIcon;
  status: ModuleStatus;
  requiresSuperuser?: boolean;
  title: string;
  subtitle: string;
}

export interface ModuleGroup {
  label: string;
  items: ModuleDef[];
}

export const moduleGroups: ModuleGroup[] = [
  {
    label: 'Technical',
    items: [
      {
        id: 'production',
        path: 'production',
        label: 'Production',
        icon: Factory,
        status: 'active',
        title: 'Production',
        subtitle: 'Technical department production performance and source reporting.',
      },
      {
        id: 'projects',
        path: 'projects',
        label: 'Projects',
        icon: HardHat,
        status: 'active',
        title: 'Projects',
        subtitle: 'Technical projects tracking module.',
      },
      {
        id: 'sanitation',
        path: 'sanitation',
        label: 'Sanitation',
        icon: ShieldCheck,
        status: 'planned',
        title: 'Sanitation',
        subtitle: 'Sanitation operations module.',
      },
    ],
  },
  {
    label: 'Distribution',
    items: [
      {
        id: 'waterDistribution',
        path: 'distribution',
        label: 'Water Distribution',
        icon: Droplets,
        status: 'active',
        title: 'Water Distribution',
        subtitle: 'Distribution department supply, NRW, and zone performance.',
      },
      {
        id: 'salesCustCare',
        path: 'sales-custcare',
        label: 'Sales & CustCare',
        icon: Users,
        status: 'active',
        title: 'Sales & CustCare',
        subtitle: 'Sales, customer care, billing-cycle and collection context.',
      },
      {
        id: 'propoor',
        path: 'propoor',
        label: 'Propoor',
        icon: LifeBuoy,
        status: 'planned',
        title: 'Propoor',
        subtitle: 'Propoor programme monitoring module.',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        id: 'revenue',
        path: 'revenue',
        label: 'Revenue',
        icon: Banknote,
        status: 'active',
        title: 'Revenue',
        subtitle: 'Finance department revenue and collection performance.',
      },
      {
        id: 'billing',
        path: 'billing',
        label: 'Billing',
        icon: ReceiptText,
        status: 'planned',
        title: 'Billing',
        subtitle: 'Billing module.',
      },
      {
        id: 'accounts',
        path: 'accounts',
        label: 'Accounts',
        icon: WalletCards,
        status: 'planned',
        title: 'Accounts',
        subtitle: 'Accounts module.',
      },
    ],
  },
  {
    label: 'Shared',
    items: [
      {
        id: 'daily',
        path: 'daily',
        label: 'Daily Analysis',
        icon: Calendar,
        status: 'active',
        title: 'Daily Analysis',
        subtitle: 'Daily production output, zone supply, and collection monitoring.',
      },
      {
        id: 'incidents',
        path: 'incidents',
        label: 'Incidents',
        icon: AlertTriangle,
        status: 'active',
        title: 'Incidents',
        subtitle: 'Incident reporting, assignment, and resolution tracking.',
      },
      {
        id: 'reports',
        path: 'reports',
        label: 'Reports',
        icon: FileText,
        status: 'active',
        title: 'Reports',
        subtitle: 'Operational and management reporting.',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        id: 'users',
        path: 'users',
        label: 'Users',
        icon: Users,
        status: 'active',
        requiresSuperuser: true,
        title: 'User Management',
        subtitle: 'Manage system users, profile roles, and access status.',
      },
      {
        id: 'data',
        path: 'data',
        label: 'Data & Imports',
        icon: ClipboardList,
        status: 'active',
        title: 'Data & Imports',
        subtitle: 'Data entry, imports, and source records.',
      },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        id: 'waterBalance',
        path: 'water-balance',
        label: 'Water Balancing',
        icon: Settings,
        status: 'active',
        title: 'Water Balancing',
        subtitle: 'Production-to-zone source allocation and balance configuration.',
      },
      {
        id: 'systemSettings',
        path: 'system-settings',
        label: 'System Settings',
        icon: Settings,
        status: 'planned',
        title: 'System Settings',
        subtitle: 'System configuration and administration.',
      },
    ],
  },
];

export const modules: ModuleDef[] = moduleGroups.flatMap(group => group.items);

/** Default module shown when the app is opened at "/". */
export const DEFAULT_MODULE_PATH = 'daily';

export function findModuleByPathname(pathname: string): ModuleDef | undefined {
  const segment = pathname.split('/').filter(Boolean)[0];
  return modules.find(module => module.path === segment);
}
