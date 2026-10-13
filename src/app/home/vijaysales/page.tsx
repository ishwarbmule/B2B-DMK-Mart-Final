import { getVariantData } from "@/lib/variant-data";
import { VijaySalesHome } from "@/components/dmk/variants/vijaysales-home";

export const metadata = { title: "DMK Mart — Vijay Sales-style Homepage" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getVariantData();
  return <VijaySalesHome data={data} />;
}
