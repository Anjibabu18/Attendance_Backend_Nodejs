const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL.replace('prisma+', '')
  });
  
  const newPassword = 'password123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  
  await connection.execute("UPDATE users SET password_hash = ? WHERE role = 'ROLE_ADMIN'", [hash]);
  console.log("Admin password reset to: " + newPassword);
  
  await connection.end();
}
main().catch(console.error);
