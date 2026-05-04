import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  UserPlus, 
  PackageSearch, 
  ShieldCheck, 
  Calculator, 
  Banknote,
  ChevronRight
} from "lucide-react";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  active: boolean;
}

function SidebarItem({ icon: Icon, label, href, active }: SidebarItemProps) {
  return (
    <Link href={href}>
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
          active 
            ? "bg-primary text-primary-foreground font-medium" 
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        {active && <ChevronRight className="h-4 w-4 opacity-50" />}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navigation = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Onboarding", href: "/onboarding", icon: UserPlus, prefix: "/onboarding" },
    { label: "Orders", href: "/orders", icon: PackageSearch },
    { label: "Compliance", href: "/compliance", icon: ShieldCheck },
    { label: "Settlements", href: "/settlements", icon: Calculator, prefix: "/settlements" },
    { label: "Payouts", href: "/payouts", icon: Banknote },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col hidden md:flex">
        <div className="h-14 border-b flex items-center px-6">
          <div className="font-bold text-lg tracking-tight flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-primary-foreground text-xs">S</div>
            Swasthera
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => (
            <SidebarItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              active={
                location === item.href || 
                (item.prefix && location !== "/" && location.startsWith(item.prefix))
              }
            />
          ))}
        </nav>
        <div className="p-4 border-t border-border/50 text-xs text-muted-foreground">
          Swasthera Finance Ops v1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
