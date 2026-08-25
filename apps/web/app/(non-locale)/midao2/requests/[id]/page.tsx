import { RequestDetailScreen } from '../../../../../../src/features/midao/requests/RequestDetailScreen';

type Midao2RequestDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * id 僅作為 canonical requestRef 傳入既有 projection；不再讀寫 legacy CRM。
 * LINE 文案由既有 LineReplyAction 產生、複製或開啟分享，不會在該操作自動轉態。
 */
export default async function Midao2RequestDetailPage({ params }: Midao2RequestDetailPageProps) {
  const { id: requestRef } = await params;
  return (
    <div aria-label="需求詳情">
      <p data-testid="midao2-manual-line-disclosure" role="status">
        系統只準備文案或開啟 LINE；不保證送達，也不會自動重送。
      </p>
      <RequestDetailScreen requestRef={requestRef} />
    </div>
  );
}