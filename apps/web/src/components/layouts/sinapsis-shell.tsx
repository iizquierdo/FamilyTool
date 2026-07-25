import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Footer, type AppFooterNavigationProps } from '@/components/layouts/layout-1/components/footer';

interface SinapsisShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  /** Row below the header border; wrapped with its own bottom border before main content */
  breadcrumb?: ReactNode;
  children: ReactNode;
  /** Drives configurable footer links (placement "footer" in menu management). */
  footerAppNavigation?: AppFooterNavigationProps | null;
  /** Product name in copyright line (from Core / admin configuration). */
  footerAppName?: string;
  /** Optional left slot in the sticky app header (e.g. branding icon from Core). */
  headerLeading?: ReactNode;
  /** Inline styles for the sticky app header bar (e.g. background from Core). */
  headerStyle?: CSSProperties;
}

/**
 * Metronic-inspired shell: sidebar + column (header, scrollable main, footer).
 * Metronic `.demo1.header-fixed .wrapper` sets padding-top: 70px for fixed headers; our column
 * uses `!pt-0` and we strip `header-fixed` / `sidebar-fixed` from body so that never applies.
 */
export function SinapsisShell({
  sidebar,
  header,
  breadcrumb,
  children,
  footerAppNavigation,
  footerAppName,
  headerLeading,
  headerStyle
}: SinapsisShellProps) {
  useEffect(() => {
    const bodyClass = document.body.classList;
    bodyClass.remove('header-fixed');
    bodyClass.remove('sidebar-fixed');
    bodyClass.remove('sidebar-collapse');
    bodyClass.add('demo1');
    const timer = window.setTimeout(() => {
      bodyClass.add('layout-initialized');
    }, 300);
    return () => {
      bodyClass.remove('demo1');
      bodyClass.remove('layout-initialized');
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full grow bg-background">
      {sidebar}
      <div className="wrapper flex min-h-0 min-w-0 grow flex-col border-border !pt-0 lg:border-s">
        {/* class NOT "header" — Metronic `.demo1 .header` forces 70px height and leaves empty space above shorter content */}
        <div
          className="sinapsis-app-header sticky top-0 z-20 flex h-[50px] shrink-0 items-center overflow-visible border-b border-border bg-background py-0.5 md:h-[54px]"
          style={headerStyle}
        >
          <div className="flex h-full w-full items-center gap-2 overflow-visible px-2 md:px-4 lg:px-6">
            {headerLeading}
            <div className="flex min-h-0 min-w-0 flex-1 items-center overflow-visible">{header}</div>
          </div>
        </div>
        {breadcrumb != null && (
          <div className="shrink-0 border-b border-border bg-background">
            <div className="mx-auto max-w-[1600px] px-2.5 py-1 md:px-4 lg:px-5">{breadcrumb}</div>
          </div>
        )}
        <main
          className="grow overflow-y-auto bg-zinc-50 px-4 pb-8 pt-5 dark:bg-zinc-950 md:px-6 lg:px-8"
          role="main"
        >
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
        <Footer appNavigation={footerAppNavigation ?? undefined} appName={footerAppName} />
      </div>
    </div>
  );
}
