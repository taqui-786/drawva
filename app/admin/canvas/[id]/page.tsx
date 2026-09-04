import { redirect } from "next/navigation";

export default async function CanvasDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/canva/${id}`);
}
