import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/database", label: "Banco de Dados" },
  { to: "/cohorts", label: "Cohorts" },
  { to: "/afiliados", label: "Afiliados" },
  { to: "/fraudes", label: "Fraudes" },
];

const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-topbar text-topbar-foreground border-b border-topbar-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-hero-gradient shadow-glow ring-1 ring-topbar-border/50" />
            <span className="font-semibold">IG Afiliados Analytics</span>
          </div>
          <nav className="flex items-center gap-2">
            {navItems.map((n) => (
              <NavLink key={n.to} to={n.to}>
                {({ isActive }) => (
                  <Button
                    variant="ghost"
                    className={`hover:tilt text-topbar-foreground/90 hover:text-topbar-foreground ${isActive ? "bg-topbar-accent/20" : "hover:bg-topbar-accent/15"}`}
                  >
                    {n.label}
                  </Button>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
