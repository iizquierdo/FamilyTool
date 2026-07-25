import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type AuthState = 'signin' | 'signup' | 'reset';

export interface AuthSessionPayload {
  token: string;
  user: any;
}

interface AuthFlowProps {
  onLoginSuccess: (payload: AuthSessionPayload) => void;
  /** Nombre de la aplicación (Core) para pie y coherencia con el título del documento. */
  appName: string;
  logoUrl?: string | null;
  loginBackgroundUrl?: string | null;
}

const AuthFlow: React.FC<AuthFlowProps> = ({
  onLoginSuccess,
  appName,
  logoUrl = null,
  loginBackgroundUrl = null
}) => {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthState>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [signInEmail, setSignInEmail] = useState('admin@sinapsis.app');
  const [signInPassword, setSignInPassword] = useState('Admin1234');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    const tokenInUrl = new URLSearchParams(window.location.search).get('resetToken') || '';
    if (tokenInUrl) {
      setView('reset');
      setResetToken(tokenInUrl);
    }
  }, []);

  const clearAlerts = () => {
    setError('');
    setSuccess('');
  };

  const handleSignIn = async () => {
    clearAlerts();
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signInEmail, password: signInPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        const serverError = String(data?.error || '').trim();
        if (serverError.toLowerCase() === 'invalid credentials.') {
          throw new Error('Invalid credentials. Passwords are case-sensitive.');
        }
        throw new Error(serverError || `${t('auth.signIn')} failed`);
      }
      onLoginSuccess({ token: data.token, user: data.user });
    } catch (err: any) {
      // #region agent log
      const _dbgStack = String((err as any)?.stack || '').slice(0, 2000);
      localStorage.setItem('dbg-902272-login-err', JSON.stringify({ msg: err?.message, stack: _dbgStack, ts: Date.now() }));
      // #endregion
      setError(`${err.message || `${t('auth.signIn')} failed`} || STACK: ${_dbgStack.slice(0, 300)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    clearAlerts();
    if (signUpPassword !== confirmPassword) {
      setError(t('auth.confirmPassword') + ' mismatch.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email: signUpEmail, password: signUpPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `${t('auth.signUp')} failed`);
      }
      onLoginSuccess({ token: data.token, user: data.user });
    } catch (err: any) {
      setError(err.message || `${t('auth.signUp')} failed`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    clearAlerts();
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `${t('auth.sendResetEmail')} failed`);
      }
      setSuccess(t('auth.sendResetEmail') + ' OK');
    } catch (err: any) {
      setError(err.message || `${t('auth.sendResetEmail')} failed`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    clearAlerts();
    if (!resetToken.trim()) {
      setError(t('auth.resetToken') + ' required.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t('auth.confirmPassword') + ' mismatch.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `${t('auth.resetPassword')} failed`);
      }
      setSuccess(t('auth.resetPassword') + ' OK');
      setView('signin');
      window.history.replaceState({}, document.title, window.location.pathname);
      setResetToken('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setError(err.message || `${t('auth.resetPassword')} failed`);
    } finally {
      setIsLoading(false);
    }
  };

  const Alerts = () => (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive" appearance="light" size="sm">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success" appearance="light" size="sm">
          <AlertTitle>{t('auth.sendResetEmail')}</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderSignIn = () => (
    <Card className="animate-in fade-in zoom-in-95 w-full max-w-[440px] duration-300">
      <CardHeader className="flex-col items-stretch space-y-0 border-0 pb-0 pt-8 text-center">
        <CardHeading>
          <CardTitle className="text-xl normal-case">{t('auth.signIn')}</CardTitle>
          <CardDescription>{t('auth.welcomeBack')}</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Alerts />
        <div className="space-y-2">
          <Label htmlFor="signin-email">{t('auth.email')}</Label>
          <Input
            id="signin-email"
            type="email"
            value={signInEmail}
            onChange={(e) => setSignInEmail(e.target.value)}
            placeholder="Enter your email"
            variant="md"
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-password">{t('auth.password')}</Label>
          </div>
          <div className="relative">
            <Input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              placeholder="********"
              variant="md"
              className="pe-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-muted-foreground hover:text-foreground absolute end-3 top-1/2 -translate-y-1/2"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <i className={cn('fa-solid', showPassword ? 'fa-eye-slash' : 'fa-eye')}></i>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="border-input size-4 rounded" />
            <span>{t('auth.rememberMe')}</span>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary h-auto px-0 text-xs font-semibold"
            onClick={() => {
              clearAlerts();
              setView('reset');
            }}
          >
            {t('auth.forgotPassword')}
          </Button>
        </div>
        <Button type="button" variant="primary" className="w-full" onClick={handleSignIn} disabled={isLoading}>
          {isLoading ? t('auth.signIn') + '...' : t('auth.signIn')}
        </Button>
      </CardContent>
      <CardFooter className="flex justify-center border-0 pt-0">
        <p className="text-muted-foreground text-center text-sm">
          {t('auth.dontHaveAccount')}{' '}
          <button
            type="button"
            onClick={() => {
              clearAlerts();
              setView('signup');
            }}
            className="text-primary font-semibold hover:underline"
          >
            {t('auth.signUp')}
          </button>
        </p>
      </CardFooter>
    </Card>
  );

  const renderSignUp = () => (
    <Card className="animate-in fade-in zoom-in-95 w-full max-w-[480px] duration-300">
      <CardHeader className="flex-col items-stretch space-y-0 border-0 pb-0 pt-8 text-center">
        <CardHeading>
          <CardTitle className="text-xl normal-case">{t('auth.signUp')}</CardTitle>
          <CardDescription>{t('auth.createAccount')}</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Alerts />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="su-fn">{t('auth.firstName')}</Label>
            <Input id="su-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" variant="md" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-ln">{t('auth.lastName')}</Label>
            <Input id="su-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" variant="md" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-email">{t('auth.email')}</Label>
          <Input
            id="su-email"
            type="email"
            value={signUpEmail}
            onChange={(e) => setSignUpEmail(e.target.value)}
            placeholder="Your email address"
            variant="md"
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-pw">{t('auth.password')}</Label>
          <div className="relative">
            <Input
              id="su-pw"
              type={showPassword ? 'text' : 'password'}
              value={signUpPassword}
              onChange={(e) => setSignUpPassword(e.target.value)}
              placeholder="Create a password"
              variant="md"
              className="pe-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-muted-foreground hover:text-foreground absolute end-3 top-1/2 -translate-y-1/2"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <i className={cn('fa-solid', showPassword ? 'fa-eye-slash' : 'fa-eye')}></i>
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="su-pw2">{t('auth.confirmPassword')}</Label>
          <Input
            id="su-pw2"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            variant="md"
            autoComplete="new-password"
          />
        </div>
        <Button type="button" variant="primary" className="w-full" onClick={handleSignUp} disabled={isLoading}>
          {isLoading ? t('auth.createAccountBtn') + '...' : t('auth.createAccountBtn')}
        </Button>
      </CardContent>
      <CardFooter className="flex justify-center border-0 pt-0">
        <p className="text-muted-foreground text-center text-sm">
          {t('auth.alreadyHaveAccount')}{' '}
          <button
            type="button"
            onClick={() => {
              clearAlerts();
              setView('signin');
            }}
            className="text-primary font-semibold hover:underline"
          >
            {t('auth.signIn')}
          </button>
        </p>
      </CardFooter>
    </Card>
  );

  const renderReset = () => (
    <Card className="animate-in fade-in zoom-in-95 w-full max-w-[440px] duration-300">
      <CardHeader className="flex-col items-stretch space-y-0 border-0 pb-0 pt-8 text-center">
        <CardHeading>
          <CardTitle className="text-xl normal-case">{t('auth.resetPassword')}</CardTitle>
          <CardDescription>{t('auth.resetHelp')}</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Alerts />
        <div className="space-y-2">
          <Label htmlFor="rs-email">{t('auth.email')}</Label>
          <Input
            id="rs-email"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="your.email@example.com"
            variant="md"
            autoComplete="email"
          />
        </div>
        <Button type="button" variant="primary" className="w-full" onClick={handleForgotPassword} disabled={isLoading}>
          {isLoading ? t('auth.sendResetEmail') + '...' : t('auth.sendResetEmail')}
        </Button>
        <div className="border-border space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="rs-token">{t('auth.resetToken')}</Label>
            <Input
              id="rs-token"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Paste token from email"
              variant="md"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rs-np">{t('auth.newPassword')}</Label>
            <Input
              id="rs-np"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              variant="md"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rs-np2">{t('auth.confirmNewPassword')}</Label>
            <Input
              id="rs-np2"
              type={showPassword ? 'text' : 'password'}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new password"
              variant="md"
              autoComplete="new-password"
            />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={handleResetPassword} disabled={isLoading}>
            {isLoading ? t('auth.resetPassword') + '...' : t('auth.resetPasswordBtn')}
          </Button>
        </div>
      </CardContent>
      <CardFooter className="flex justify-center border-0 pt-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-2"
          onClick={() => {
            clearAlerts();
            setView('signin');
          }}
        >
          <i className="fa-solid fa-arrow-left text-xs"></i>
          {t('auth.backToSignIn')}
        </Button>
      </CardFooter>
    </Card>
  );

  const bgUrl = loginBackgroundUrl?.trim() || '';
  const logoSrc = logoUrl?.trim() || '';

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background">
      {bgUrl ? (
        <>
          <div
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${bgUrl})` }}
            aria-hidden
          />
          <div className="absolute inset-0 z-[1] bg-background/60 backdrop-blur-[2px]" aria-hidden />
        </>
      ) : (
        <>
          <div className="bg-primary/5 absolute start-[-5%] top-[-10%] z-0 h-[40%] w-[40%] rounded-full blur-[120px]" aria-hidden />
          <div className="bg-primary/5 absolute bottom-[-10%] end-[-5%] z-0 h-[40%] w-[40%] rounded-full blur-[120px]" aria-hidden />
        </>
      )}

      <div className="relative z-10 mb-10 flex flex-col items-center">
        {logoSrc ? (
          <img src={logoSrc} alt="" className="max-h-24 w-auto max-w-[min(100%,280px)] object-contain drop-shadow-sm" />
        ) : (
          <div className="text-primary flex items-center justify-center" aria-hidden>
            <Layers className="size-10" />
          </div>
        )}
      </div>

      <div className="relative z-10 flex w-full justify-center px-4">
        {view === 'signin' && renderSignIn()}
        {view === 'signup' && renderSignUp()}
        {view === 'reset' && renderReset()}
      </div>

      <div className="text-muted-foreground relative z-10 mt-12 px-4 text-center text-xs font-medium">
        {t('auth.footerCopyright', { year: new Date().getFullYear(), appName })}
      </div>
    </div>
  );
};

export default AuthFlow;
