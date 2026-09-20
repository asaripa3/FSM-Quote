import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Nav, Footer } from "@/components/shell";
import { Workflow } from "@/components/workflow";
import { TRADES, isTradeId } from "@/lib/trades";

export function generateStaticParams() {
  return Object.keys(TRADES).map((trade) => ({ trade }));
}

export async function generateMetadata({
  params,
}: PageProps<"/workflow/[trade]">): Promise<Metadata> {
  const { trade } = await params;
  if (!isTradeId(trade)) return { title: "FSMpedia" };
  return {
    title: `${TRADES[trade].name} — FSMpedia`,
    description: TRADES[trade].blurb,
  };
}

export default async function WorkflowPage({ params }: PageProps<"/workflow/[trade]">) {
  const { trade } = await params;
  if (!isTradeId(trade)) notFound();

  const pack = TRADES[trade];

  return (
    <>
      <Nav context={pack.name} />
      <main>
        <Workflow key={pack.id} pack={pack} />
      </main>
      <Footer />
    </>
  );
}
