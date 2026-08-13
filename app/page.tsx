import { Nav } from "@/components/landing/nav";
import { HeroIntro } from "@/components/landing/hero-intro";
import { HeroBento } from "@/components/landing/hero-bento";
import { VideoDemo } from "@/components/landing/video-demo";
import { CtaSection } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { CONTAINER } from "@/components/landing/container";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      {/* Ambient top glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(ellipse_at_top,var(--primary-20,rgba(16,185,129,0.15)),transparent_60%)]"
      />
      {/* Subtle graph paper overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
      />

      <Nav />

      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="w-full py-8 md:py-16">
          <div className={`${CONTAINER} grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.1fr]`}>
            <HeroIntro />
            <HeroBento />
          </div>
        </section>

        {/* Demo Video Section */}
        <VideoDemo />

        {/* Call to Action */}
        <CtaSection />
      </main>

      <Footer />
    </div>
  );
}