import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Droplets,
  Factory,
  FileText,
  HandCoins,
  HardHat,
  LifeBuoy,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import DailyAnalysis from './DailyAnalysis';
import DataEntry from './DataEntry';
import DistributionDashboard from './DistributionDashboard';
import FinanceDashboard from './FinanceDashboard';
import IncidentReporting from './IncidentReporting';
import ProductionDashboard from './ProductionDashboard';
import ProjectsDashboard from './ProjectsDashboard';
import Reports from './Reports';
import WaterBalanceSettings from './WaterBalanceSettings';

type DashboardType =
  | 'daily'
  | 'production'
  | 'projects'
  | 'sanitation'
  | 'waterDistribution'
  | 'salesCustCare'
  | 'propoor'
  | 'revenue'
  | 'billing'
  | 'accounts'
  | 'incidents'
  | 'reports'
  | 'data'
  | 'waterBalance'
  | 'systemSettings';

type MenuItem = {
  id: DashboardType;
  label: string;
  icon: typeof Calendar;
  status?: 'active' | 'planned';
  description?: string;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    label: 'Technical',
    items: [
      { id: 'production', label: 'Production', icon: Factory, status: 'active' },
      { id: 'projects', label: 'Projects', icon: HardHat, status: 'active' },
      { id: 'sanitation', label: 'Sanitation', icon: ShieldCheck, status: 'planned' },
    ],
  },
  {
    label: 'Distribution',
    items: [
      { id: 'waterDistribution', label: 'Water Distribution', icon: Droplets, status: 'active' },
      { id: 'salesCustCare', label: 'Sales & CustCare', icon: Users, status: 'active' },
      { id: 'propoor', label: 'Propoor', icon: LifeBuoy, status: 'planned' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'revenue', label: 'Revenue', icon: Banknote, status: 'active' },
      { id: 'billing', label: 'Billing', icon: ReceiptText, status: 'planned' },
      { id: 'accounts', label: 'Accounts', icon: WalletCards, status: 'planned' },
    ],
  },
  {
    label: 'Shared',
    items: [
      { id: 'daily', label: 'Daily Analysis', icon: Calendar, status: 'active' },
      { id: 'incidents', label: 'Incidents', icon: AlertTriangle, status: 'active' },
      { id: 'reports', label: 'Reports', icon: FileText, status: 'active' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'data', label: 'Data & Imports', icon: ClipboardList, status: 'active' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'waterBalance', label: 'Water Balancing', icon: Settings, status: 'active' },
      { id: 'systemSettings', label: 'System Settings', icon: Settings, status: 'planned' },
    ],
  },
];

const pageTitles: Record<DashboardType, { title: string; subtitle: string }> = {
  daily: {
    title: 'Daily Analysis',
    subtitle: 'Daily production output, zone supply, and collection monitoring.',
  },
  production: {
    title: 'Production',
    subtitle: 'Technical department production performance and source reporting.',
  },
  projects: {
    title: 'Projects',
    subtitle: 'Technical projects tracking module.',
  },
  sanitation: {
    title: 'Sanitation',
    subtitle: 'Sanitation operations module.',
  },
  waterDistribution: {
    title: 'Water Distribution',
    subtitle: 'Distribution department supply, NRW, and zone performance.',
  },
  salesCustCare: {
    title: 'Sales & CustCare',
    subtitle: 'Sales, customer care, billing-cycle and collection context.',
  },
  propoor: {
    title: 'Propoor',
    subtitle: 'Propoor programme monitoring module.',
  },
  revenue: {
    title: 'Revenue',
    subtitle: 'Finance department revenue and collection performance.',
  },
  billing: {
    title: 'Billing',
    subtitle: 'Billing module.',
  },
  accounts: {
    title: 'Accounts',
    subtitle: 'Accounts module.',
  },
  incidents: {
    title: 'Incidents',
    subtitle: 'Incident reporting, assignment, and resolution tracking.',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Operational and management reporting.',
  },
  data: {
    title: 'Data & Imports',
    subtitle: 'Data entry, imports, and source records.',
  },
  waterBalance: {
    title: 'Water Balancing',
    subtitle: 'Production-to-zone source allocation and balance configuration.',
  },
  systemSettings: {
    title: 'System Settings',
    subtitle: 'System configuration and administration.',
  },
};

export default function Index() {
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('daily');
  const currentPage = pageTitles[activeDashboard];

  const activeItem = useMemo(
    () => menuGroups.flatMap(group => group.items).find(item => item.id === activeDashboard),
    [activeDashboard],
  );

  const renderContent = () => {
    if (activeDashboard === 'daily') return <DailyAnalysis />;
    if (activeDashboard === 'production') return <ProductionDashboard />;
    if (activeDashboard === 'projects') return <ProjectsDashboard />;
    if (activeDashboard === 'waterDistribution') return <DistributionDashboard />;
    if (activeDashboard === 'salesCustCare') return <DistributionDashboard />;
    if (activeDashboard === 'revenue') return <FinanceDashboard />;
    if (activeDashboard === 'incidents') return <IncidentReporting />;
    if (activeDashboard === 'reports') return <Reports />;
    if (activeDashboard === 'data') return <DataEntry />;
    if (activeDashboard === 'waterBalance') return <WaterBalanceSettings />;
    return <PlannedModule title={currentPage.title} subtitle={currentPage.subtitle} />;
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/70 px-3 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-sidebar-foreground">NAIVAWASCO</p>
              <p className="truncate text-xs text-sidebar-foreground/70">Management System</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <DashboardNavigation activeDashboard={activeDashboard} onSelectDashboard={setActiveDashboard} />
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter className="p-4">
          <div className="rounded-lg border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70">
            Default view: Daily Analysis
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="shrink-0">
            <Menu className="h-4 w-4" />
          </SidebarTrigger>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {activeItem ? <activeItem.icon className="h-5 w-5 text-primary" /> : <BarChart3 className="h-5 w-5 text-primary" />}
              <h1 className="truncate text-lg font-bold text-foreground">{currentPage.title}</h1>
            </div>
            <p className="truncate text-xs text-muted-foreground md:text-sm">{currentPage.subtitle}</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 bg-gradient-surface">
          {renderContent()}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function DashboardNavigation({
  activeDashboard,
  onSelectDashboard,
}: {
  activeDashboard: DashboardType;
  onSelectDashboard: (dashboard: DashboardType) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const handleSelectDashboard = (dashboard: DashboardType) => {
    onSelectDashboard(dashboard);

    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      {menuGroups.map(group => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(item => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeDashboard === item.id}
                    tooltip={item.label}
                    onClick={() => handleSelectDashboard(item.id)}
                    className={cn(item.status === 'planned' && 'text-sidebar-foreground/70')}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.status === 'planned' ? (
                      <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-foreground/70">
                        Later
                      </span>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function PlannedModule({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="container py-6">
      <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">
          <Button variant="secondary" disabled>
            Module scheduled for later implementation
          </Button>
        </div>
      </div>
    </div>
  );
}
