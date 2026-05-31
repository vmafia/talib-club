import fs from 'fs';
import https from 'https';

console.log('Fetching Surahs list...');
https.get('https://api.alquran.cloud/v1/surah', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.code === 200) {
        const surahs = json.data.map(s => ({
          number: s.number,
          name: s.name,
          englishName: s.englishName,
          englishNameTranslation: s.englishNameTranslation,
          numberOfAyahs: s.numberOfAyahs,
          revelationType: s.revelationType
        }));
        const out = `export const SURA_LIST = ${JSON.stringify(surahs, null, 2)};\n`;
        fs.writeFileSync('src/data/surahs.js', out, 'utf-8');
        console.log(`Successfully wrote ${surahs.length} Surahs to src/data/surahs.js`);
      } else {
        console.error('API error:', json);
      }
    } catch (err) {
      console.error('Parse error:', err);
    }
  });
}).on('error', (err) => {
  console.error('Fetch error:', err);
});
