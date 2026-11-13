import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('tokens render with local fonts, shared Tailwind values and AA text/status contrast', async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('.woff2') && response.ok()) fonts.push(response.url());
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/tokens');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'A clear visual language.' })).toBeVisible();
  // Development preload URLs include a cache-busting query; CSS requests the
  // same two font assets without it.
  expect(new Set(fonts.map((url) => new URL(url).pathname)).size).toBe(2);
  expect(fonts.every((url) => new URL(url).origin === 'http://127.0.0.1:3100')).toBe(true);
  await expect(page.locator('[data-colour]')).toHaveCount(19);
  const sizes = await page
    .locator('[data-type]')
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [element.getAttribute('data-type'), getComputedStyle(element).fontSize]),
      ),
    );
  expect(sizes).toEqual({
    'display-xl': '64px',
    section: '48px',
    display: '56px',
    h1: '40px',
    h2: '28px',
    h3: '19px',
    body: '15px',
    small: '14px',
    dense: '13px',
    eyebrow: '12px',
    'amount-xl': '40px',
    'amount-lg': '24px',
    'amount-md': '15px',
  });
  const mapped = page.getByTestId('tailwind-tokens');
  await expect(mapped).toHaveCSS('background-color', 'rgb(245, 248, 248)');
  await expect(mapped).toHaveCSS('color', 'rgb(19, 26, 23)');
  await expect(mapped).toHaveCSS('border-radius', '24px');
  await expect(mapped).toHaveCSS('padding', '24px');

  const contrasts = await page.locator('[data-contrast]').evaluateAll((elements) => {
    const rgba = (value: string) => {
      const parts = value.match(/[\d.]+/g)!.map(Number);
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const luminance = (rgb: number[]) =>
      rgb
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const composite = (foreground: number[], background: number[]) =>
      foreground
        .slice(0, 3)
        .map((channel, index) => channel * foreground[3]! + background[index]! * (1 - foreground[3]!));
    const background = (element: Element | null): number[] => {
      if (!element) return [255, 255, 255];
      const style = getComputedStyle(element);
      const base = composite(rgba(style.backgroundColor), background(element.parentElement));
      const stops = style.backgroundImage.match(/rgba?\([^)]*\)/g);
      // Dark-band text is tested against its lightest gradient stop, the worst
      // contrast case for the white/white-alpha foreground used by this design.
      return stops
        ? stops
            .map(rgba)
            .map((colour) => composite(colour, base))
            .sort((a, b) => luminance(b) - luminance(a))[0]!
        : base;
    };
    return elements.map((element) => {
      const bg = background(element);
      const fg = composite(rgba(getComputedStyle(element).color), bg);
      const [dark, light] = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
      return { name: element.getAttribute('data-contrast'), ratio: (light! + 0.05) / (dark! + 0.05) };
    });
  });
  for (const result of contrasts) expect(result.ratio, `${result.name} contrast`).toBeGreaterThanOrEqual(4.5);
  await mkdir('docs/review', { recursive: true });
  await page.screenshot({ path: 'docs/review/tokens.png', fullPage: true });
  const onDark = page.getByRole('button', { name: 'Get started', exact: true });
  await onDark.hover();
  await expect(onDark).toHaveCSS('background-color', 'rgb(91, 211, 172)');
  await onDark.focus();
  await expect(onDark).toBeFocused();
  await expect(onDark).toHaveCSS('outline-style', 'solid');
});
