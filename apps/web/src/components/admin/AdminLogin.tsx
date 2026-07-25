import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess: (token: string) => Promise<boolean>;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Login failed');
      }
      const sessionOk = await onLoginSuccess(String(data?.token || ''));
      if (!sessionOk) {
        throw new Error('Could not verify admin session');
      }
      navigate('/admin/organizations', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="normal-case text-xl font-semibold">Admin Login</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-login-email">Email</Label>
              <Input
                id="admin-login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-login-password">Password</Label>
              <Input
                id="admin-login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
            {error ? (
              <Alert variant="destructive" appearance="light" size="sm">
                <AlertIcon>
                  <AlertCircle className="size-4" />
                </AlertIcon>
                <AlertContent>
                  <AlertDescription>{error}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
