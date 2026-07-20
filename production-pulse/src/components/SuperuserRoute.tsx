import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useMyMeteringProfile } from '@/hooks/useMetering';

interface SuperuserRouteProps {
  children: JSX.Element;
}

export default function SuperuserRoute({ children }: SuperuserRouteProps) {
  const { data: profile, isLoading } = useMyMeteringProfile();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile?.user.is_superuser) {
    return <Navigate to="/" replace />;
  }

  return children;
}
