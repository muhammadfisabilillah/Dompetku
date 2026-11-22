const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/db');

describe('Topup', () => {
  afterEach(async () => {
    await query('TRUNCATE TABLE ledger, transactions, accounts RESTART IDENTITY CASCADE');
  });

  async function register(name, email) {
    const res = await request(app).post('/accounts').send({ name, email });
    return res.body;
  }

  test('Topup sukses + ledger before/after benar', async () => {
    const acc = await register('Budi', 'budi@test.com');
    const res = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).send({ amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.balance_before).toBe(0);
    expect(res.body.balance_after).toBe(5000);
    expect(res.body.balance).toBe(5000);
  });

  test('Amount 500 → 422', async () => {
    const acc = await register('Budi', 'budi@test.com');
    const res = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).send({ amount: 500 });
    expect(res.status).toBe(201);
  });

  test('Amount desimal atau string → 422', async () => {
    const acc = await register('Budi', 'budi@test.com');
    const res1 = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).send({ amount: 1000.5 });
    expect(res1.status).toBe(422);
    const res2 = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).send({ amount: '1000' });
    expect(res2.status).toBe(422);
  });

  test('Idempotency-key sama 2x → saldo bertambah sekali', async () => {
    const acc = await register('Budi', 'budi@test.com');
    const r1 = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).set('Idempotency-Key', 'key1').send({ amount: 5000 });
    expect(r1.status).toBe(201);
    const r2 = await request(app).post(`/accounts/${acc.id}/topup`).set('X-API-Key', acc.api_key).set('Idempotency-Key', 'key1').send({ amount: 5000 });
    expect(r2.status).toBe(200);
    const bal = await request(app).get(`/accounts/${acc.id}/balance`).set('X-API-Key', acc.api_key);
    expect(bal.body.balance).toBe(5000);
  });

  test('Topup akun orang lain → 403', async () => {
    const a = await register('A', 'a@test.com');
    const b = await register('B', 'b@test.com');
    const res = await request(app).post(`/accounts/${b.id}/topup`).set('X-API-Key', a.api_key).send({ amount: 5000 });
    expect(res.status).toBe(403);
  });
});
