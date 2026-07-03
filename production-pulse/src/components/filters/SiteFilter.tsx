import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';

interface Site {
  id: string;
  name: string;
}

interface SiteFilterProps {
  sites: Site[];
  selectedSite: string;
  onSiteChange: (siteId: string) => void;
}

export function SiteFilter({ sites, selectedSite, onSiteChange }: SiteFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Site:</span>
      <Select value={selectedSite} onValueChange={onSiteChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select site" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sites</SelectItem>
          {sites.map(site => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
