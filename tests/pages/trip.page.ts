import { Page } from '@playwright/test';

export class TripPage {
  readonly page: Page;
  constructor(page: Page){ this.page = page }

  async waitForContent(){ await this.page.getByText('查看完整簡介').waitFor() }
  async chooseDate(dateSelector = 'input[type="date"]'){ return this.page.locator(dateSelector) }
  async clickReserve(){
    // try common labels
    const btn = this.page.getByRole('link', { name: /預約|立即預約|下一步|確認/ }).first()
    await btn.click()
  }
}
