import dotenv from 'dotenv';

dotenv.config();

const normalizeDatabaseUrl = () => {
  if (process.env.DATABASE_URL || !process.env.DB_URL) return;

  const rawUrl = process.env.DB_URL.trim();

  try {
    const mysqlUrl = rawUrl.startsWith('jdbc:mysql://')
      ? rawUrl.replace(/^jdbc:/, '')
      : rawUrl;

    if (!mysqlUrl.startsWith('mysql://')) return;

    const url = new URL(mysqlUrl);
    if (process.env.DB_USER) url.username = process.env.DB_USER;
    if (process.env.DB_PASS) url.password = process.env.DB_PASS;

    if (!url.searchParams.has('sslaccept')) {
      url.searchParams.set('sslaccept', 'strict');
    }

    process.env.DATABASE_URL = url.toString();
  } catch (error) {
    console.warn('DB_URL could not be converted to DATABASE_URL', error);
  }
};

normalizeDatabaseUrl();
