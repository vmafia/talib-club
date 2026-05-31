import fs from 'fs';
import path from 'path';

const mockupPath = 'C:/Users/HP/Documents/GitHub/talib-club/mockup.html';

async function parseMockup() {
  if (!fs.existsSync(mockupPath)) {
    console.error("Mockup file does not exist at:", mockupPath);
    return;
  }

  const content = fs.readFileSync(mockupPath, 'utf8');
  const startIdx = content.indexOf('const S = [');
  if (startIdx === -1) {
    console.error("Could not find 'const S = [' inside the HTML file.");
    return;
  }

  // Find the matching end bracket for the array
  let bracketCount = 1;
  let currentIdx = startIdx + 11;
  let arrayContent = '';
  
  while (bracketCount > 0 && currentIdx < content.length) {
    const char = content[currentIdx];
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
    if (bracketCount > 0) {
      arrayContent += char;
    }
    currentIdx++;
  }

  // Use a regex to match each object in the array: {n:"...", e:"...", ...}
  // Let's do a robust line-by-line parsing or object regex match
  const objectRegex = /\{[^{}]+\}/g;
  const matches = arrayContent.match(objectRegex);
  
  if (!matches) {
    console.error("Could not find any objects inside the array.");
    return;
  }

  console.log(`Found ${matches.length} scholar objects in the mockup array.`);

  const parsed = [];
  matches.forEach((objStr, idx) => {
    try {
      // Parse key-values using regex
      const n = objStr.match(/n:\s*"([^"]+)"/)?.[1] || '';
      const e = objStr.match(/e:\s*"([^"]+)"/)?.[1] || '';
      const ah = objStr.match(/ah:\s*"([^"]*)"/)?.[1] || '';
      const ce = objStr.match(/ce:\s*"([^"]*)"/)?.[1] || '';
      const aq = objStr.match(/aq:\s*"([^"]*)"/)?.[1] || '';
      const mh = objStr.match(/mh:\s*"([^"]*)"/)?.[1] || '';
      const mz = objStr.match(/mz:\s*"([^"]*)"/)?.[1] || '';
      const d = objStr.match(/d:\s*"([^"]*)"/)?.[1] || '';

      if (n) {
        parsed.push({ n, e, ah, ce, aq, mh, mz, d });
      } else {
        console.warn(`Object at index ${idx} had no name:`, objStr);
      }
    } catch (err) {
      console.error(`Error parsing object at index ${idx}:`, err.message);
    }
  });

  console.log(`Successfully parsed ${parsed.length} scholars.`);
  fs.writeFileSync('C:/Users/HP/Documents/GitHub/talib-club/scripts/parsed_mockup_scholars.json', JSON.stringify(parsed, null, 2));
  console.log("Sample first 3 parsed scholars:", parsed.slice(0, 3));
  console.log("Sample last 3 parsed scholars:", parsed.slice(-3));
}

parseMockup().catch(console.error);
