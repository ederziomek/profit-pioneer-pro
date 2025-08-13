import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

interface User {
  id: string;
  email: string;
  role: "admin" | "user";
}

interface Session {
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, role?: "admin" | "user") => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simular carregamento inicial
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  const signIn: AuthContextType["signIn"] = async (email, password) => {
    // Mock de autenticação - aceita qualquer email/senha
    if (email && password) {
      const mockUser: User = {
        id: "mock-user-id",
        email: email,
        role: email.includes("admin") ? "admin" : "user"
      };
      
      const mockSession: Session = {
        user: mockUser
      };
      
      setUser(mockUser);
      setSession(mockSession);
      
      // Salvar no localStorage para persistir
      localStorage.setItem("mock-user", JSON.stringify(mockUser));
      localStorage.setItem("mock-session", JSON.stringify(mockSession));
      
      return {};
    }
    
    return { error: "Email e senha são obrigatórios" };
  };

  const signUp: AuthContextType["signUp"] = async (email, password, role = "user") => {
    // Mock de cadastro
    if (email && password) {
      const mockUser: User = {
        id: "mock-user-" + Date.now(),
        email: email,
        role: role
      };
      
      const mockSession: Session = {
        user: mockUser
      };
      
      setUser(mockUser);
      setSession(mockSession);
      
      // Salvar no localStorage
      localStorage.setItem("mock-user", JSON.stringify(mockUser));
      localStorage.setItem("mock-session", JSON.stringify(mockSession));
      
      return {};
    }
    
    return { error: "Email e senha são obrigatórios" };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem("mock-user");
    localStorage.removeItem("mock-session");
  };

  // Verificar se há usuário salvo no localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("mock-user");
    const savedSession = localStorage.getItem("mock-session");
    
    if (savedUser && savedSession) {
      try {
        const user = JSON.parse(savedUser);
        const session = JSON.parse(savedSession);
        setUser(user);
        setSession(session);
      } catch (error) {
        console.error("Erro ao carregar usuário salvo:", error);
      }
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({ user, session, loading, signIn, signUp, signOut }), [user, session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
