import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-black text-primary-foreground">
        D
      </div>
      <div>
        <h1 className="font-serif text-5xl font-medium tracking-[-0.03em] sm:text-6xl">
          This corner of the canvas is blank.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-[1.6] text-muted-foreground">
          The page you&apos;re looking for isn&apos;t here. Maybe it was erased, or never drawn.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/85 active:scale-[0.98]"
      >
        Back to the landing page
      </Link>
    </main>
  );
}
