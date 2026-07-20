import { useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findModuleByPathname } from '@/config/modules';

export default function PlannedModule() {
  const { pathname } = useLocation();
  const module = findModuleByPathname(pathname);

  return (
    <div className="container py-6">
      <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">{module?.title ?? 'Module'}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {module?.subtitle ?? 'This module is scheduled for later implementation.'}
        </p>
        <div className="mt-6">
          <Button variant="secondary" disabled>
            Module scheduled for later implementation
          </Button>
        </div>
      </div>
    </div>
  );
}
