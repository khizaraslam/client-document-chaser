import 'dotenv/config';
import { PlanCode } from '@cdc/contracts';
import { AppDataSource } from '../data-source';
import { PlanEntity } from '../entities/plan.entity';

async function seedPlans(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const planRepo = AppDataSource.getRepository(PlanEntity);
    const definitions = [
      {
        code: PlanCode.STARTER,
        name: 'Starter',
        monthlyPriceCents: 1900,
        maxActiveClients: 50,
        maxTeamSeats: 5,
        maxStorageBytes: String(10 * 1024 * 1024 * 1024),
        maxEmailsPerMonth: 2500,
      },
      {
        code: PlanCode.PROFESSIONAL,
        name: 'Professional',
        monthlyPriceCents: 3900,
        maxActiveClients: 250,
        maxTeamSeats: 25,
        maxStorageBytes: String(100 * 1024 * 1024 * 1024),
        maxEmailsPerMonth: 15000,
      },
    ];

    for (const def of definitions) {
      const existing = await planRepo.findOne({ where: { code: def.code } });
      if (existing) {
        await planRepo.update({ id: existing.id }, def);
      } else {
        await planRepo.save(planRepo.create(def));
      }
    }
    console.warn('Seeded STARTER and PROFESSIONAL plans successfully.');
  } finally {
    await AppDataSource.destroy();
  }
}

seedPlans().catch((err: unknown) => {
  console.error('Plan seed failed:', err);
  process.exit(1);
});
