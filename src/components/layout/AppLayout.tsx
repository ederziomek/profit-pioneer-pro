import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Moon } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/cohorts", label: "Cohorts" },
  { to: "/afiliados", label: "Afiliados" },
  { to: "/fraudes", label: "Fraudes" },
  { to: "/database", label: "Banco de Dados" },
];

const AppLayout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-topbar text-topbar-foreground border-b border-topbar-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-hero-gradient shadow-glow ring-1 ring-topbar-border/50" />
            <span className="font-semibold">IG Afiliados Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-2">
              {navItems.map((n, index) => (
                <NavLink key={n.to} to={n.to}>
                  {({ isActive }) => (
                    <Button
                      variant="ghost"
                      className={`hover:tilt text-topbar-foreground/90 hover:text-topbar-foreground ${isActive ? "bg-topbar-accent/20" : "hover:bg-topbar-accent/15"}`}
                      style={{
                        marginRight: `${index * 2}px` // "mais pra baixo, mais pra direita"
                      }}
                    >
                      {n.label}
                    </Button>
                  )}
                </NavLink>
              ))}
            </nav>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="ml-2 text-topbar-foreground/90 hover:text-topbar-foreground hover:bg-topbar-accent/15"
              title={`Alternar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
