import { cn } from '@/lib/utils';

interface RegionFilterProps {
  regions: string[];
  selectedRegion: string;
  onRegionChange: (region: string) => void;
}

export function RegionFilter({ regions, selectedRegion, onRegionChange }: RegionFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground mr-2">Filter by:</span>
      <button
        onClick={() => onRegionChange('all')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
          selectedRegion === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        )}
      >
        All Regions
      </button>
      {regions.map((region) => (
        <button
          key={region}
          onClick={() => onRegionChange(region)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            selectedRegion === region
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {region}
        </button>
      ))}
    </div>
  );
}
