import { cn } from '@/lib/utils';
import { BarChart3, Database, Map, Settings } from 'lucide-react';

type TabType = 'overview' | 'data-input' | 'zones';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
  { id: 'data-input' as const, label: 'Data Input', icon: Database },
  { id: 'zones' as const, label: 'Zones', icon: Map },
];

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border/50 w-fit animate-fade-in">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-card text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
