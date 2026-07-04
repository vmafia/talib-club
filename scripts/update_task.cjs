const fs = require('fs');
const artifactPath = 'C:\\Users\\hp\\.gemini\\antigravity\\brain\\c69de4e9-4857-481b-ae74-3fce33eda006\\task.md';
let content = fs.readFileSync(artifactPath, 'utf8');

content = content.replace(
  '- `[ ]` Extract `VerseList.jsx`',
  '- `[x]` Extract `VerseList.jsx`'
);

content = content.replace(
  '- `[ ]` Extract `MushafView.jsx`',
  '- `[x]` Extract `MushafView.jsx`'
);

fs.writeFileSync(artifactPath, content);
