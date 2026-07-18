const fs = require('fs');
let c = fs.readFileSync('src/controllers/employeeController.ts', 'utf8');

c = c.replace(/export const registerFace = async[\s\S]*?res\.status\(400\)\.json\(\{ error: e\.message \};\s*\}\s*};/g, '');

fs.writeFileSync('src/controllers/employeeController.ts', c);
console.log('Removed registerFace from employeeController.ts');
