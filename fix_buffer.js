const fs = require('fs');
let c = fs.readFileSync('src/controllers/employeePunchController.ts', 'utf8');

c = c.replace(/if \(!file\) \{\s*return res\.status\(400\)\.json\(\{ error: 'Selfie photo is required for punch' \}\);\s*\}/g, 
`    const photoBase64 = req.body.photoBase64;
    let photoBuffer;
    if (file) {
      photoBuffer = file.buffer;
    } else if (photoBase64) {
      photoBuffer = Buffer.from(photoBase64.replace(/^data:image\\/\\w+;base64,/, ""), 'base64');
    }

    if (!photoBuffer) {
      return res.status(400).json({ error: 'Selfie photo is required for punch' });
    }`);

fs.writeFileSync('src/controllers/employeePunchController.ts', c);
console.log('Fixed employeePunchController.ts');
