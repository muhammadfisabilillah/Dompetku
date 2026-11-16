const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/db');

describe('Auth & Accounts', () => {
  afterEach(async () => {
    await query('TRUNCATE TABLE ledger, transactions, accounts RESTART IDENTITY CASCADE');
  });

  test('Register sukses (201, cek ada api_key)', async () => {
    const res = await request(app).post('/accounts').send({ name: 'Budi', email: 'budi@test.com' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('api_key');
    expect(res.body.balance).toBe(0);
  });

  test('Register body kosong / kurang field (422)', async () => {
    const res = await request(app).post('/accounts').send({});
    expect(res.status).toBe(422);
  });

  test('Register email yang sama persis 2x (kedua 409)', async () => {
    await request(app).post('/accounts').send({ name: 'Budi', email: 'budi@test.com' });
    const res = await request(app).post('/accounts').send({ name: 'Budi2', email: 'budi@test.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email sudah terdaftar');
  });

  test('Cek saldo sukses (200)', async () => {
    const reg = await request(app).post('/accounts').send({ name: 'Budi', email: 'budi@test.com' });
    const res = await request(app).get(`/accounts/${reg.body.id}/balance`).set('X-API-Key', reg.body.api_key);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
  });

  test('Cek saldo tanpa header x-api-key (401)', async () => {
    const reg = await request(app).post('/accounts').send({ name: 'Budi', email: 'budi@test.com' });
    const res = await request(app).get(`/accounts/${reg.body.id}/balance`);
    expect(res.status).toBe(401);
  });

  test('Cek saldo pakai x-api-key asal-asalan (401)', async () => {
    const reg = await request(app).post('/accounts').send({ name: 'Budi', email: 'budi@test.com' });
    const res = await request(app).get(`/accounts/${reg.body.id}/balance`).set('X-API-Key', 'randomkey123');
    expect(res.status).toBe(401);
  });

  test('Cek saldo: login pakai key akun A, panggil GET /accounts/<id_akun_B> (403)', async () => {
    const a = await request(app).post('/accounts').send({ name: 'A', email: 'a@test.com' });
    const b = await request(app).post('/accounts').send({ name: 'B', email: 'b@test.com' });
    const res = await request(app).get(`/accounts/${b.body.id}/balance`).set('X-API-Key', a.body.api_key);
    expect(res.status).toBe(403);
  });
});