import { getVariantData } from "@/lib/variant-data";
import { EtsyHome } from "@/components/dmk/variants/etsy-home";

export const metadata = { title: "DMK Mart — Etsy-style Homepage" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getVariantData();
  return <EtsyHome data={data} />;
}
