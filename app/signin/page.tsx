"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") || "/canvas";

  React.useEffect(() => {
    if (session?.user) {
      router.replace(callbackUrl);
    }
  }, [session, callbackUrl, router]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in with Google");
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground px-4 overflow-hidden selection:bg-primary/20 selection:text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.08),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      <div className="absolute top-6 left-6 z-20">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/" />}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="h-4 w-4" />
          <span>Back to Home</span>
        </Button>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight text-foreground">
            Welcome to{" "}
            <Link
              href="/"
              className="inline-block transition-opacity hover:opacity-90 align-baseline"
              aria-label="Drawva home"
            >
              <span className="brand-wordmark font-bold tracking-wider text-primary font-sans">
                Drawva
              </span>
            </Link>
          </h1>
          <p className="font-body text-sm text-muted-foreground mt-3 max-w-xs">
            Sign in to start creating on your infinite multimodal canvas
          </p>
        </div>

        <Card className="border-border/80 bg-card/80 backdrop-blur-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg font-heading">Single Click Sign In</CardTitle>
            <CardDescription className="text-xs">
              New here? Your account will be created automatically.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleGoogleSignIn}
              disabled={isLoading || isPending}
              className="w-full gap-3 py-6 rounded-xl border-border hover:bg-accent/60 transition-all font-medium text-sm shadow-xs cursor-pointer"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              <span>{isLoading ? "Connecting to Google…" : "Continue with Google"}</span>
            </Button>

            <p className="text-center text-[11px] text-muted-foreground leading-relaxed pt-2">
              By continuing, you agree to Drawva&apos;s Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <SignInContent />
    </React.Suspense>
  );
}
