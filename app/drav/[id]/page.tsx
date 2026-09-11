import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDravById } from "@/lib/dravs/queries";
import { DravViewer } from "@/components/drav/DravViewer";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

interface DravPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: DravPageProps): Promise<Metadata> {
  const { id } = await params;
  const drav = await getDravById(id);

  if (!drav) {
    return {
      title: "Drav Not Found | Drawva",
      description: "The requested whiteboard Drav does not exist or is private.",
    };
  }

  const title = `${drav.title} by ${drav.author.name} | Drawva`;
  const description =
    drav.description ||
    `Interactive whiteboard canvas created by ${drav.author.name} on Drawva.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/drav/${drav.id}`,
      images: drav.thumbnailUrl
        ? [
            {
              url: drav.thumbnailUrl,
              width: 1200,
              height: 675,
              alt: drav.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: drav.thumbnailUrl ? [drav.thumbnailUrl] : undefined,
    },
  };
}

export default async function DravPageRoute({ params }: DravPageProps) {
  const { id } = await params;

  // Resolve current session to check ownership if private
  const reqHeaders = await headers();
  let currentUserId: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: reqHeaders });
    currentUserId = session?.user?.id;
  } catch {}

  const drav = await getDravById(id, currentUserId);
  if (!drav) {
    notFound();
  }

  return <DravViewer drav={drav} />;
}
