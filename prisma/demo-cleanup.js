/**
 * demo-cleanup.js — удаляет все демо-выезды (AA..PP)
 * Запуск: node prisma/demo-cleanup.js
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DEMO_TEAMS = ['AA','BB','CC','DD','EE','FF','GG','HH','II','JJ','KK','LL','MM','NN','OO','PP'];

async function main() {
  const trips = await p.trip.findMany({
    where: { teamName: { in: DEMO_TEAMS } },
    select: { id: true, name: true },
  });

  if (trips.length === 0) {
    console.log('Демо-выезды не найдены.');
    return;
  }

  const ids = trips.map(t => t.id);

  // Удаляем в правильном порядке (обходим ограничения FK)
  await p.guestRecord.deleteMany({ where: { guestList: { tripId: { in: ids } } } });
  await p.guestImportLog.deleteMany({ where: { tripId: { in: ids } } });
  await p.guestList.deleteMany({ where: { tripId: { in: ids } } });

  // Презентации и их зависимости
  const presIds = (await p.presentation.findMany({ where: { tripId: { in: ids } }, select: { id: true } })).map(p => p.id);
  if (presIds.length > 0) {
    await p.presentationCrew.deleteMany({ where: { presentationId: { in: presIds } } }).catch(() => {});
    await p.presentationSummary.deleteMany({ where: { presentationId: { in: presIds } } }).catch(() => {});
  }
  await p.presentation.deleteMany({ where: { tripId: { in: ids } } });
  await p.tripCrew.deleteMany({ where: { tripId: { in: ids } } });

  // Склады и транзакции
  const warehouses = await p.warehouse.findMany({ where: { tripId: { in: ids } }, select: { id: true } });
  const whIds = warehouses.map(w => w.id);
  if (whIds.length > 0) {
    const txIds = (await p.transaction.findMany({ where: { OR: [{ fromWarehouseId: { in: whIds } }, { toWarehouseId: { in: whIds } }] }, select: { id: true } })).map(t => t.id);
    if (txIds.length > 0) await p.transactionItem.deleteMany({ where: { transactionId: { in: txIds } } });
    await p.transaction.deleteMany({ where: { OR: [{ fromWarehouseId: { in: whIds } }, { toWarehouseId: { in: whIds } }] } });
    await p.stock.deleteMany({ where: { warehouseId: { in: whIds } } });
    await p.warehouse.deleteMany({ where: { id: { in: whIds } } });
  }

  // Кошельки
  const wallets = await p.wallet.findMany({ where: { tripId: { in: ids } }, select: { id: true } });
  const walletIds = wallets.map(w => w.id);
  if (walletIds.length > 0) {
    // Обнуляем self-reference reversalOfId перед удалением транзакций
    await p.walletTx.updateMany({ where: { walletId: { in: walletIds } }, data: { reversalOfId: null } });
    // Картинки к транзакциям
    const txIds = (await p.walletTx.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } })).map(t => t.id);
    if (txIds.length > 0) {
      await p.walletTxImage.deleteMany({ where: { txId: { in: txIds } } });
    }
    // Переводы (по walletId)
    await p.walletTransfer.deleteMany({ where: { OR: [{ fromWalletId: { in: walletIds } }, { toWalletId: { in: walletIds } }] } });
    // Транзакции и балансы
    await p.walletTx.deleteMany({ where: { walletId: { in: walletIds } } });
    await p.walletBalance.deleteMany({ where: { walletId: { in: walletIds } } });
    await p.wallet.deleteMany({ where: { id: { in: walletIds } } });
    console.log(`  ✓ Удалено ${walletIds.length} кошельков`);
  }

  for (const t of trips) {
    await p.trip.delete({ where: { id: t.id } });
    console.log(`✓ Удалён: ${t.name}`);
  }

  console.log(`\n✅ Удалено ${trips.length} выездов.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
