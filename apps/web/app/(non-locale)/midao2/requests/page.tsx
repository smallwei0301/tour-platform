import { RequestListScreen } from '../../../../src/features/midao/requests/RequestListScreen';

/**
 * Midao2 只呈現 canonical request projection；卡片本身提供的 requestRef
 * 會直接導向 Midao2 的 canonical detail route，避免把 legacy CRM id 帶入新流程。
 */
export default function Midao2RequestsPage() {
  return (
    <div aria-label="需求">
      <RequestListScreen detailBasePath="/midao2/requests" />
    </div>
  );
}