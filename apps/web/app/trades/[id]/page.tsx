import { ClientTrade } from '../../../components/client-trade';

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientTrade id={id} />;
}
