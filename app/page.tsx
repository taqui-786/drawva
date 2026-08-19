import { Nav } from "@/components/landing/nav";
import { HeroIntro } from "@/components/landing/hero-intro";
import { VideoDemo } from "@/components/landing/video-demo";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-[100svh] w-full flex-col overflow-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Ambient top glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(ellipse_at_top,var(--primary-20,rgba(16,185,129,0.16)),transparent_62%)]"
      />
      {/* Subtle graph paper overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_78%)]"
      />

      <Nav />

      {/* Single no-scroll screen: centered hero → demo video → footer */}
      <main className="flex w-full flex-1 flex-col justify-between gap-5 py-6 md:py-8">
        {/* Centered hero */}
        <section className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-center justify-center px-6 md:px-10">
          <HeroIntro />
        </section>

        {/* Demo video mock */}
        <VideoDemo />
      </main>

      <Footer />
    </div>
  );
}
