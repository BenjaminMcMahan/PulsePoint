import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, List, PlusCircle, GitCompare, TrendingUp, Waves } from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/sessions", icon: List, label: "Sessions" },
  { path: "/new", icon: PlusCircle, label: "New" },
  { path: "/compare", icon: GitCompare, label: "Compare" },
  { path: "/insights", icon: TrendingUp, label: "Insights" },
  { path: "/cascade", icon: Waves, label: "Cascade" },
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