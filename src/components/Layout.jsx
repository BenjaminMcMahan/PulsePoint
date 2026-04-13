import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, List, PlusCircle, GitCompare, TrendingUp, Waves, ScanSearch, GitMerge, Menu, X } from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/sessions", icon: List, label: "Sessions" },
  { path: "/new", icon: PlusCircle, label: "New Session" },
  { path: "/compare", icon: GitCompare, label: "Compare" },
  { path: "/insights", icon: TrendingUp, label: "Insights" },
  { path: "/cascade", icon: Waves, label: "Cascade" },
  { path: "/profiler", icon: ScanSearch, label: "AI Profiler" },
  { path: "/overlay", icon: GitMerge, label: "HR Overlay" },
];

export default function Layout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-card border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <span className="text-sm font-semibold text-foreground tracking-tight">
          {navItems.find((n) => n.path === "/" ? location.pathname === "/" : location.pathname.startsWith(n.path))?.label ?? "App"}
        </span>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Side panel */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-250 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <span className="text-sm font-bold text-primary tracking-tight">Menu</span>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 pt-12 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
},
  { path: "/sessions", icon: List, label: "Sessions" },
  { path: "/new", icon: PlusCircle, label: "New" },
  { path: "/compare", icon: GitCompare, label: "Compare" },
  { path: "/insights", icon: TrendingUp, label: "Insights" },
  { path: "/cascade", icon: Waves, label: "Cascade" },
  { path: "/profiler", icon: ScanSearch, label: "Profiler" },
  { path: "/overlay", icon: GitMerge, label: "Overlay" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-1 pb-20 overflow-auto">
        <Outlet />
      </main>
      
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="flex items-center justify-around max-w-lg mx-auto h-16">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = path === "/" 
              ? location.pathname === "/" 
              : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${path === "/new" ? "w-6 h-6" : ""}`} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}