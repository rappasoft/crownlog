import BrandDiscovery from "../BrandDiscovery";

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandDiscovery brandId={id} />;
}
