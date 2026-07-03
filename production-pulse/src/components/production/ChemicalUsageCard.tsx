import { cn } from '@/lib/utils';
import { Beaker, FlaskConical } from 'lucide-react';
import { ChemicalUsage, TreatmentMetrics } from '@/types/production';

interface ChemicalUsageCardProps {
  chemicals: ChemicalUsage[];
  treatment: TreatmentMetrics;
}

export function ChemicalUsageCard({ chemicals, treatment }: ChemicalUsageCardProps) {
  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '400ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent" />
          Treatment & Chemical Usage
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground">Turbidity In</span>
          <p className="text-xl font-bold mono-value">{treatment.turbidityIn} <span className="text-sm font-normal text-muted-foreground">NTU</span></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground">Turbidity Out</span>
          <p className="text-xl font-bold mono-value text-success">{treatment.turbidityOut} <span className="text-sm font-normal text-muted-foreground">NTU</span></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground">pH Level</span>
          <p className="text-xl font-bold mono-value">{treatment.phLevel}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground">Residual Cl₂</span>
          <p className="text-xl font-bold mono-value">{treatment.residualChlorine} <span className="text-sm font-normal text-muted-foreground">mg/L</span></p>
        </div>
      </div>
      
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Beaker className="w-4 h-4" />
          Chemical Consumption
        </h4>
        {chemicals.map((chem) => {
          const percentage = (chem.used / chem.target) * 100;
          return (
            <div key={chem.chemical} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{chem.chemical}</span>
                <span className="text-muted-foreground mono-value">
                  {chem.used.toLocaleString()} / {chem.target.toLocaleString()} {chem.unit}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    'h-full rounded-full transition-all',
                    percentage <= 80 ? 'bg-success' :
                    percentage <= 95 ? 'bg-warning' : 'bg-destructive'
                  )}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <div className="flex justify-end">
                <span className="text-[10px] text-muted-foreground">
                  Cost: KES {(chem.cost / 1000).toFixed(0)}K
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
