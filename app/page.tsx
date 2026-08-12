import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* ambient, token-derived glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,theme(--color-primary/14),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-8rem] -z-10 h-[24rem] bg-[radial-gradient(ellipse_at_bottom,theme(--color-chart-2/12),transparent_60%)]"
      />

      <Nav />
      <Hero />
      <Footer />
    </div>
  );
}