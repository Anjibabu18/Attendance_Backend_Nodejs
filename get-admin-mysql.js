const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  // Parse DB_URL or DATABASE_URL
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL.replace('prisma+', '')
  });
  const [rows] = await connection.execute("SELECT username, role, password_hash FROM users WHERE role = 'ROLE_ADMIN' LIMIT 1");
  console.log("Admin details:", rows[0] ? rows[0].username : "No admin found");
  await connection.end();
}
main().catch(console.error);
