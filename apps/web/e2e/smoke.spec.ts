import { expect, test } from '@playwright/test';

test('administrator can sign in and open the TADPODS dashboard', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('TADPODS')).toBeVisible();
  await page.getByLabel('Email address').fill(process.env.SEED_ADMIN_EMAIL ?? 'admin@tadpods.local');
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe-123!');
  await page.getByRole('button', { name: 'Sign in to TADPODS' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'TADPODS dashboard' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toContainText('Administration');
});
