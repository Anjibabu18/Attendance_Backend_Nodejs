const fs = require('fs');
let c = fs.readFileSync('src/routes/employeeRoutes.ts', 'utf8');

c = c.replace(/,\s*registerFace\s*,/g, ',');
c = c.replace(/router\.post\('\/face-register', registerFace\);\n?/g, '');

fs.writeFileSync('src/routes/employeeRoutes.ts', c);
console.log('Removed registerFace from employeeRoutes.ts');
