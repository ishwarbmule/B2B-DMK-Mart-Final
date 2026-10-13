import { getVariantData } from "@/lib/variant-data";
import { DmartHome } from "@/components/dmk/variants/dmart-home";

export const metadata = { title: "DMK Mart — DMart-style Homepage" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getVariantData();
  return <DmartHome data={data} />;
}
