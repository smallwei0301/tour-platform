import { RequestDetailScreen } from '../../../../../src/features/midao/requests/RequestDetailScreen';

type MidaoRequestDetailPageProps = {
  params: Promise<{ requestRef: string }>;
};

export default async function MidaoRequestDetailPage({ params }: MidaoRequestDetailPageProps) {
  const { requestRef } = await params;
  return (
    <RequestDetailScreen requestRef={requestRef} />
  );
}
