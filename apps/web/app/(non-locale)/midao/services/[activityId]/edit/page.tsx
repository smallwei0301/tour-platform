import { ServiceWizard } from '../../../../../../src/features/midao/services/ServiceWizard';

export default async function EditMidaoServicePage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  return <ServiceWizard initialActivityId={activityId} />;
}
