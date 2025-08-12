import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SEO from "@/components/SEO";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const Auth: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  const [mode, setMode] = React.useState<"login" | "signup">("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        else navigate(from, { replace: true });
      } else {
        // If user is creating the admin, allow setting role admin automatically when using the provided credentials
        const role = email.toLowerCase().startsWith("admin@") && password === "senha123!" ? "admin" : "user";
        const { error, needsConfirmation } = await signUp(email, password, role);
        if (error) setError(error);
        else if (needsConfirmation) setInfo("Cadastro criado. Verifique seu e-mail para confirmar o acesso.");
        else navigate(from, { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <SEO title="Entrar — IG Afiliados" description="Login seguro para acessar o painel." canonical="/auth" />
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Entrar" : "Criar conta"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="admin@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            {info && <p className="text-muted-foreground text-sm">{info}</p>}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={loading}>{loading ? "Processando..." : (mode === "login" ? "Entrar" : "Cadastrar")}</Button>
              <Button type="button" variant="ghost" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar conta" : "Já tenho conta"}</Button>
            </div>

            <div className="pt-2 border-t mt-4">
              <p className="text-sm mb-2">Acesso rápido (admin):</p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => { setEmail("admin@exemplo.com"); setPassword("senha123!"); setMode("signup"); }}>Preencher admin</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Dica: Desative a confirmação de e-mail no Supabase durante testes, ou verifique seu e-mail para concluir o cadastro.</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
