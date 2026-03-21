import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { DirectoriesModule } from './directories/directories.module';
import { TripsModule } from './trips/trips.module';
import { PresentationsModule } from './presentations/presentations.module';
import { ProductsModule } from './products/products.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { WalletsModule } from './wallets/wallets.module';
import { GuestListsModule } from './guest-lists/guest-lists.module';
import { StatsModule } from './stats/stats.module';
import { ContractsModule } from './contracts/contracts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10, name: 'default' }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    RolesModule,
    UsersModule,
    FilesModule,
    DirectoriesModule,
    TripsModule,
    PresentationsModule,
    ProductsModule,
    WarehousesModule,
    WalletsModule,
    GuestListsModule,
    StatsModule,
    ContractsModule,
  ],
})
export class AppModule {}
