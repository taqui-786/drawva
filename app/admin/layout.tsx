import * as React from "react";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/actions/admin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata = {
  title: "Admin Console | Drawva",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdminSession();
  } catch {
    redirect("/signin?callbackUrl=/admin");
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <AdminSidebar />
      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
