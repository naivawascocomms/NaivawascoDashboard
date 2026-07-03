import { Droplets, Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface HeaderProps {
  currentPeriod: string;
  onRefresh?: () => void;
}

export function Header({ currentPeriod, onRefresh }: HeaderProps) {
  return (
    <header className="mb-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-primary shadow-glow">
            <Droplets className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              NAIVAWASCO Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Production & Distribution Management System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/50 shadow-soft">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{currentPeriod}</span>
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="h-10 w-10"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
