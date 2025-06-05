const fs = require('fs');
const path = require('path');

const report = { test: "it works" };
const fileName = `test-${Date.now()}.json`;

fs.writeFileSync(path.join('reports', fileName), JSON.stringify(report, null, 2));
console.log('✅ File written!');
