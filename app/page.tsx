import { Nav } from "@/components/landing/nav";
import { HeroIntro } from "@/components/landing/hero-intro";
import { VideoDemo } from "@/components/landing/video-demo";
import { Footer } from "@/components/landing/footer";
import { DoodleBg } from "@/components/landing/doodle-bg";

export default function LandingPage() {
  return (
    <div className="relative grid h-[100svh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Ambient background: faint whiteboard grid + self-drawing doodles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-30 [mask-image:radial-gradient(ellipse_80%_75%_at_50%_40%,black,transparent_85%)]" />
      </div>
      <DoodleBg />

      <Nav />

      {/* Single no-scroll screen: editorial hero left, demo reel right */}
      <main className="min-h-0 w-full">
        <div className="mx-auto grid h-full w-full max-w-[1440px] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] items-center gap-6 px-6 py-4 md:px-10 lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] lg:grid-rows-1 lg:gap-12 lg:py-6">
          <section className="min-w-0">
            <HeroIntro />
          </section>
          <section className="min-h-0 min-w-0">
            <VideoDemo />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
