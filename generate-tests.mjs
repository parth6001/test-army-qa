import 'dotenv/config';
import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node generate-tests.mjs <url>');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function crawlPage(url) {
  console.log(`→ Crawling ${url}...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  const pageData = await page.evaluate(() => {
    const getText = (el) => el?.textContent?.trim().slice(0, 100) || '';

    return {
      title: document.title,
      url: location.href,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(getText).filter(Boolean).slice(0, 10),
      buttons: [...document.querySelectorAll('button,[role=button]')].map(getText).filter(Boolean).slice(0, 15),
      links: [...document.querySelectorAll('a[href]')].map(a => ({ text: getText(a), href: a.getAttribute('href') })).filter(l => l.text).slice(0, 15),
      inputs: [...document.querySelectorAll('input,textarea,select')].map(el => ({
        type: el.type || el.tagName.toLowerCase(),
        name: el.name || el.id || el.placeholder || '',
        label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '',
      })).slice(0, 15),
      forms: document.querySelectorAll('form').length,
      images: [...document.querySelectorAll('img[alt]')].map(i => i.alt).filter(Boolean).slice(0, 10),
    };
  });

  await browser.close();
  return pageData;
}

async function generateTests(pageData, targetUrl) {
  console.log('→ Claude generating tests...');

  const prompt = `You are a Playwright test engineer. Generate comprehensive Playwright TypeScript test cases for this web page.

PAGE DATA:
- URL: ${targetUrl}
- Title: "${pageData.title}"
- Headings: ${JSON.stringify(pageData.headings)}
- Buttons: ${JSON.stringify(pageData.buttons)}
- Links: ${JSON.stringify(pageData.links)}
- Input fields: ${JSON.stringify(pageData.inputs)}
- Forms count: ${pageData.forms}
- Images (alt text): ${JSON.stringify(pageData.images)}

RULES:
1. Use baseURL config so tests use relative paths like page.goto('/')
2. Write realistic, meaningful test cases — not trivial ones
3. Cover: page load, visible elements, navigation, form interactions (if forms exist), user flows
4. Use page.getByRole(), page.getByText(), page.getByLabel() over CSS selectors
5. Each test should be independent
6. Return ONLY valid TypeScript code. No markdown, no explanation.
7. Start file with: import { test, expect } from '@playwright/test';

Generate 5-8 test cases.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

function sanitizeFilename(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
}

async function main() {
  try {
    const pageData = await crawlPage(url);
    console.log(`→ Found: ${pageData.forms} form(s), ${pageData.buttons.length} button(s), ${pageData.inputs.length} input(s), ${pageData.links.length} link(s)`);

    const testCode = await generateTests(pageData, url);

    const filename = `${sanitizeFilename(url)}.spec.ts`;
    const outPath = path.join('tests', filename);

    if (!fs.existsSync('tests')) fs.mkdirSync('tests');
    fs.writeFileSync(outPath, testCode);

    console.log(`✓ Saved: ${outPath}`);
    console.log('\nRun tests:');
    console.log(`  npx playwright test ${outPath}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
