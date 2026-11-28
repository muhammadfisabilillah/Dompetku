const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/db');

describe('Transfer — aturan bisnis K03', () => {
  async function register(name, email) {
    const res = await request(app).post('/accounts').send({ name, email });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function topup(acc, amount, key) {
    const res = await request(app)
      .post(`/accounts/${acc.id}/topup`)
      .set('X-API-Key', acc.api_key)
      .set('Idempotency-Key', key)
      .send({ amount });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function transfer(from, to, amount, key) {
    return request(app)
      .post('/transfers')
      .set('X-API-Key', from.api_key)
      .set('Idempotency-Key', key)
      .send({ from_account_id: from.id, to_account_id: to.id, amount });
  }

  async function balance(acc) {
    const res = await request(app)
      .get(`/accounts/${acc.id}/balance`)
      .set('X-API-Key', acc.api_key);
    expect(res.status).toBe(200);
    return res.body.balance;
  }

  async function ledgerRows() {
    const res = await query('SELECT account_id, amount, balance_before, balance_after FROM ledger ORDER BY id');
    return res.rows.map(r => ({
      account_id: r.account_id,
      amount: Number(r.amount),
      balance_before: Number(r.balance_before),
      balance_after: Number(r.balance_after),
    }));
  }

  test('Transfer sukses: debit + kredit + ledger before/after benar (atomik)', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 10000, 'topup-atomik');

    const res = await transfer(a, b, 4000, 'tx-atomik');
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('TRANSFER');
    expect(res.body.balance_before).toBe(10000);
    expect(res.body.balance_after).toBe(6000);

    expect(await balance(a)).toBe(6000);
    expect(await balance(b)).toBe(4000);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(3); // 1 top-up + 1 debit + 1 kredit
    expect(rows.find(r => r.account_id === a.id && r.balance_after === 6000)).toMatchObject({
      amount: 4000, balance_before: 10000, balance_after: 6000,
    });
    expect(rows.find(r => r.account_id === b.id && r.balance_after === 4000)).toMatchObject({
      amount: 4000, balance_before: 0, balance_after: 4000,
    });
  });

  test('Saldo tidak cukup → 422, saldo dan ledger tidak berubah (tidak ada saldo negatif)', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 1000, 'topup-kurang');

    const res = await transfer(a, b, 2000, 'tx-kurang');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('saldo tidak cukup');

    expect(await balance(a)).toBe(1000);
    expect(await balance(b)).toBe(0);
    const tx = await query("SELECT COUNT(*)::int AS n FROM transfers WHERE type = 'TRANSFER'");
    expect(tx.rows[0].n).toBe(0);
    expect(await ledgerRows()).toHaveLength(1); // hanya top-up
  });

  test('Nominal di bawah Rp1.000 atau desimal → 422', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 10000, 'topup-min');

    expect((await transfer(a, b, 999, 'tx-min-1')).status).toBe(422);
    expect((await transfer(a, b, 1000.5, 'tx-min-2')).status).toBe(422);
    expect((await transfer(a, b, 0, 'tx-min-3')).status).toBe(422);
    expect(await balance(a)).toBe(10000);
  });

  test('Batas transfer keluar Rp2.000.000 per hari per akun', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 5000000, 'topup-limit');

    const first = await transfer(a, b, 1500000, 'tx-limit-1');
    expect(first.status).toBe(201);

    const second = await transfer(a, b, 600000, 'tx-limit-2');
    expect(second.status).toBe(422);
    expect(second.body.error).toContain('2.000.000');

    expect(await balance(a)).toBe(3500000);
    expect(await balance(b)).toBe(1500000);

    // Limit bersifat per-akun: akun lain tetap bisa transfer
    const c = await register('Siti', 'siti@test.com');
    const d = await register('Dewi', 'dewi@test.com');
    await topup(c, 100000, 'topup-c');
    expect((await transfer(c, d, 100000, 'tx-c')).status).toBe(201);
  });

  test('Idempotency-Key transfer yang sama 2x → hanya diproses sekali', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 10000, 'topup-idem');

    const first = await transfer(a, b, 3000, 'tx-idem');
    expect(first.status).toBe(201);
    const second = await transfer(a, b, 3000, 'tx-idem');
    expect(second.status).toBe(200);
    expect(second.body.transaction_id).toBe(first.body.transaction_id);

    expect(await balance(a)).toBe(7000);
    expect(await balance(b)).toBe(3000);
    const tx = await query(
      "SELECT COUNT(*)::int AS n FROM transfers WHERE idempotency_key = 'tx-idem'"
    );
    expect(tx.rows[0].n).toBe(1);
  });

  test('Transfer ke akun sendiri → 422', async () => {
    const a = await register('Andi', 'andi@test.com');
    await topup(a, 10000, 'topup-self');
    const res = await transfer(a, a, 1000, 'tx-self');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('tidak dapat transfer ke akun sendiri');
    expect(await balance(a)).toBe(10000);
  });

  test('Akun tujuan tidak ditemukan → 404, saldo pengirim utuh', async () => {
    const a = await register('Andi', 'andi@test.com');
    await topup(a, 10000, 'topup-404');
    const res = await request(app)
      .post('/transfers')
      .set('X-API-Key', a.api_key)
      .set('Idempotency-Key', 'tx-404')
      .send({ from_account_id: a.id, to_account_id: 99999, amount: 1000 });
    expect(res.status).toBe(404);
    expect(await balance(a)).toBe(10000);
  });

  test('Pakai API key akun lain → 403', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    const c = await register('Cici', 'cici@test.com');
    await topup(a, 10000, 'topup-403');

    const res = await request(app)
      .post('/transfers')
      .set('X-API-Key', c.api_key) // bukan key Andi (pengirim)
      .set('Idempotency-Key', 'tx-403')
      .send({ from_account_id: a.id, to_account_id: b.id, amount: 1000 });
    expect(res.status).toBe(403);
    expect(await balance(a)).toBe(10000);
  });

  test('Transfer paralel anti-overselling: 2x Rp6.000 dari saldo Rp10.000 → hanya satu sukses', async () => {
    const a = await register('Andi', 'andi@test.com');
    const b = await register('Budi', 'budi@test.com');
    await topup(a, 10000, 'topup-paralel');

    const results = await Promise.all([
      transfer(a, b, 6000, 'tx-paralel-1'),
      transfer(a, b, 6000, 'tx-paralel-2'),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([201, 422]);
    expect(await balance(a)).toBe(4000);
    expect(await balance(b)).toBe(6000);
  });
});
