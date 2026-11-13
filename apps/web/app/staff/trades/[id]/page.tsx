import { StaffTrade } from '../../../../components/staff-trade';

export default async function StaffTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffTrade id={id} />;
}
