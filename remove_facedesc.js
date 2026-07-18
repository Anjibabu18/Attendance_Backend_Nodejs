const fs = require('fs');
let c = fs.readFileSync('src/controllers/employeePunchController.ts', 'utf8');

// Replace checkIn
c = c.replace(/const entry = await checkIn\(employee, latitude, longitude, photoBuffer, faceDescriptor\);/g, 'const entry = await checkIn(employee, latitude, longitude, photoBuffer, null);');

// Replace checkOut
c = c.replace(/const entry = await checkOut\(employee, latitude, longitude, photoBuffer, faceDescriptor\);/g, 'const entry = await checkOut(employee, latitude, longitude, photoBuffer, null);');

fs.writeFileSync('src/controllers/employeePunchController.ts', c);
console.log('Fixed employeePunchController.ts faceDescriptor calls');
