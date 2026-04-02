import { Page } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  constructor(page: Page){ this.page = page }

  async goto(){ await this.page.goto('https://tour-platform-nine.vercel.app/') }
  searchBox(){ return this.page.locator('input[aria-label*="搜尋行程"]') }
  async clickFirstTrip(){ await this.page.locator('a:has-text("查看行程")').first().click() }
  async ensureLoaded(){ await this.page.getByText('精選行程').waitFor() }
}
