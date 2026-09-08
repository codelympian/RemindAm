import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('reports ok when the database is reachable', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { isHealthy: async () => true } }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.service).toBe('remindam-backend');
  });

  it('reports error when the database is unreachable', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { isHealthy: async () => false } }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result.status).toBe('error');
    expect(result.database).toBe('down');
  });
});
