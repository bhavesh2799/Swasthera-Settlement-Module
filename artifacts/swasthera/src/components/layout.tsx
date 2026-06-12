import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  UserPlus, 
  PackageSearch, 
  ShieldCheck, 
  Calculator, 
  Banknote,
  ChevronRight,
  Users2,
  Database,
  Receipt,
} from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { NotificationBell } from "@/components/NotificationBell";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  active: boolean;
  badge?: string;
}

function SidebarItem({ icon: Icon, label, href, active, badge }: SidebarItemProps) {
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
        <div className="flex items-center gap-1">
          {badge && (
            <span className="text-[10px] bg-amber-500 text-white rounded px-1 py-0.5 font-medium leading-none">{badge}</span>
          )}
          {active && <ChevronRight className="h-4 w-4 opacity-50" />}
        </div>
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { role, setRole, isBackend } = useRole();

  const navigation = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Onboarding", href: "/onboarding", icon: UserPlus, prefix: "/onboarding" },
    { label: "Orders", href: "/orders", icon: PackageSearch, badge: isBackend ? "SIM" : undefined },
    { label: "Compliance", href: "/compliance", icon: ShieldCheck },
    { label: "Settlements", href: "/settlements", icon: Calculator, prefix: "/settlements" },
    { label: "Payouts", href: "/payouts", icon: Banknote },
    { label: "Invoices", href: "/invoices", icon: Receipt },
  ];

  const roleDescriptions: Record<string, string> = {
    maker: "Create & submit onboardings, initiate payouts",
    checker: "Approve/reject onboardings & payouts",
    backend: "Simulate Fynd data feeds & manage orders",
    admin: "Manage users & configure global TDS/TCS rates",
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      <aside className="w-64 border-r bg-card flex flex-col hidden md:flex sticky top-0 h-screen">
        <div className="h-14 border-b flex items-center px-6 shrink-0">
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
              badge={item.badge}
              active={
                location === item.href || 
                (item.prefix && location !== "/" && location.startsWith(item.prefix)) || false
              }
            />
          ))}
        </nav>

        {/* Role switcher */}
        <div className="p-4 border-t border-border/50 space-y-3 shrink-0">

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              {isBackend ? <Database className="h-3.5 w-3.5 text-amber-600" /> : <Users2 className="h-3.5 w-3.5" />}
              Active Role
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <button
                onClick={() => setRole("maker")}
                className={`px-2 py-1.5 font-medium rounded-md border transition-colors ${
                  role === "maker"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                Maker
              </button>
              <button
                onClick={() => setRole("checker")}
                className={`px-2 py-1.5 font-medium rounded-md border transition-colors ${
                  role === "checker"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                Checker
              </button>
              <button
                onClick={() => setRole("backend")}
                className={`px-2 py-1.5 font-medium rounded-md border transition-colors ${
                  role === "backend"
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                Backend
              </button>
              <button
                onClick={() => setRole("admin")}
                className={`px-2 py-1.5 font-medium rounded-md border transition-colors ${
                  role === "admin"
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary"
                }`}
              >
                Admin
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {roleDescriptions[role]}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Swasthera Finance Ops v1.1</p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute top-4 right-6 z-40">
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
