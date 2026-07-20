import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { BarChart3, Building2, Loader2, Menu, Moon, Sun } from 'lucide-react';

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
import { ModuleErrorBoundary } from '@/components/layout/ModuleErrorBoundary';
import { findModuleByPathname, moduleGroups } from '@/config/modules';
import { useMyMeteringProfile } from '@/hooks/useMetering';

export default function Index() {
  const { pathname } = useLocation();
  const activeModule = findModuleByPathname(pathname);

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
          <DashboardNavigation />
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter className="p-4">
          <div className="rounded-lg border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/70">
            Default view: Daily Analysis
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* min-w-0 lets the content pane shrink below its content's intrinsic
          width (wide tables) so inner overflow-x-auto wrappers scroll instead
          of pushing the page under the fixed sidebar. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="shrink-0" aria-label="Toggle navigation">
            <Menu className="h-4 w-4" />
          </SidebarTrigger>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {activeModule ? (
                <activeModule.icon className="h-5 w-5 text-primary" />
              ) : (
                <BarChart3 className="h-5 w-5 text-primary" />
              )}
              <h1 className="truncate text-lg font-bold text-foreground">
                {activeModule?.title ?? 'Dashboard'}
              </h1>
            </div>
            <p className="truncate text-xs text-muted-foreground md:text-sm">
              {activeModule?.subtitle ?? ''}
            </p>
          </div>
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 bg-gradient-surface">
          <ModuleErrorBoundary key={pathname}>
            <Suspense fallback={<ModuleLoading />}>
              <Outlet />
            </Suspense>
          </ModuleErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function DashboardNavigation() {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const activeModule = findModuleByPathname(pathname);
  const { data: profile } = useMyMeteringProfile();
  const isSuperuser = Boolean(profile?.user.is_superuser);

  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      {moduleGroups.map(group => {
        const visibleItems = group.items.filter(item => !item.requiresSuperuser || isSuperuser);

        if (visibleItems.length === 0) {
          return null;
        }

        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map(item => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeModule?.id === item.id}
                      tooltip={item.label}
                      className={cn(item.status === 'planned' && 'text-sidebar-foreground/70')}
                    >
                      <NavLink to={`/${item.path}`} onClick={handleNavigate}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.status === 'planned' ? (
                          <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-foreground/70">
                            Later
                          </span>
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the real theme after hydration; render a stable
  // icon until then to avoid a mismatch flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function ModuleLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
