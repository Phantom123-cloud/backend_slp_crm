const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.user.findFirst({ where: { email: 'admin@slp.com' } }),
  p.venue.findMany({ take: 10 }),
  p.presentationType.findMany({ take: 10 }),
]).then(([u, v, t]) => {
  console.log('admin_id=' + u.id);
  console.log('venues=' + JSON.stringify(v.map(x => ({ id: x.id, n: x.venueName, city: x.city }))));
  console.log('types=' + JSON.stringify(t.map(x => ({ id: x.id, n: x.name }))));
}).finally(() => p.$disconnect());
