import { AppDataSource } from './data-source';

async function runMigrations(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const executed = await AppDataSource.runMigrations();
    console.warn(
      `Executed ${executed.length} pending database migration(s).`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

runMigrations().catch((err: unknown) => {
  console.error('Database migration failed:', err);
  process.exit(1);
});
