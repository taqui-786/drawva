import { AdminCanvasViewer } from "@/components/admin/AdminCanvasViewer";

export const metadata = {
  title: "Inspect Canvas Playground | Drawva Admin",
  robots: { index: false, follow: false },
};

export default async function CanvasDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminCanvasViewer canvasId={id} />;
}
