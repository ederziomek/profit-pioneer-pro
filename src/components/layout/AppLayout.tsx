import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/cohorts", label: "Cohorts" },
  { to: "/afiliados", label: "Afiliados" },
  { to: "/fraudes", label: "Fraudes" },
];

const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-hero-gradient shadow-glow" />
            <span className="font-semibold">IG Afiliados Analytics</span>
          </div>
          <nav className="flex items-center gap-2">
            {navItems.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => isActive ? "" : ""}>
                <Button variant="ghost" className="hover:tilt">{n.label}</Button>
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
