import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Clone Studio" },
      { name: "description", content: "Войдите или создайте аккаунт, чтобы клонировать сайты и запускать AI-доработку." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        toast.success("Аккаунт создан. Входим…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка аутентификации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-sm text-muted-foreground hover:text-foreground">← На главную</Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{mode === "signin" ? "С возвращением" : "Создайте аккаунт"}</CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Войдите, чтобы клонировать сайты и следить за задачами."
                : "Бесплатно, пока ditto бесплатен. Без карты."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: window.location.origin,
                  });
                  if ((res as any)?.error) throw (res as any).error;
                  const { data } = await supabase.auth.getSession();
                  if (data.session) navigate({ to: "/app" });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Не удалось войти через Google");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Продолжить с Google
            </Button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> или по email <div className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Секунду…" : mode === "signin" ? "Войти" : "Создать аккаунт"}
              </Button>
            </form>
            <button
              type="button"
              className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Нет аккаунта? Зарегистрируйтесь" : "Уже есть аккаунт? Войти"}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
