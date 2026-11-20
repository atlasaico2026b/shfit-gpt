const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const indexPath = 'http://localhost:3000';

console.log('Testing scroll fix:', indexPath);

(async () => {
  const browser = await chromium.launch({ 
    headless: false, 
    slowMo: 500,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err.message));
  page.on('dialog', async dialog => { console.log('DIALOG:', dialog.type(), dialog.message()); await dialog.accept(); });
  
  await page.goto(indexPath);
  await page.waitForTimeout(5000);
  
  // Close any modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Click settings
  const settingsLink = await page.$('a[href*="view=settings"]');
  if (settingsLink) {
    await settingsLink.click();
    await page.waitForTimeout(2000);
  }
  
  // Click the appearance tab
  await page.evaluate(() => {
    const tab = document.querySelector('[data-settings-tab="appearance"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1000);
  
  // Check for scrollability
  const mainElement = await page.$('.settings-appearance-host');
  const canScroll = await page.evaluate(el => {
    return el.style.overflowY || window.getComputedStyle(el).overflowY;
  }, mainElement);
  console.log('Overflow property:', canScroll);
  
  // Test scrolling
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1000);
  
  // Check if content moved
  const newScroll = await page.evaluate(() => window.pageYOffset);
  console.log('Scroll position after wheel:', newScroll);
  
  await browser.close();
  console.log('\nDONE');
})();
