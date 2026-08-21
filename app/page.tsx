import { DrawvaNavbar } from "@/components/landing/DrawvaNavbar";
import { DrawvaHero } from "@/components/landing/DrawvaHero";

export default function LandingPage() {
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden selection:bg-primary/20 selection:text-primary">
      <DrawvaNavbar />
      <DrawvaHero />
    </div>
  );
}
