require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error(
    'ERRO: variável de ambiente DATABASE_URL não encontrada.\n' +
    'No Railway, adicione um plugin PostgreSQL ao projeto — ele cria essa variável automaticamente.\n' +
    'Para rodar localmente, copie .env.example para .env e preencha com a URL do seu banco.'
  );
  process.exit(1);
}

// Algumas conexões Postgres externas (ex: Railway público, Render) exigem SSL.
const useSSL = process.env.PGSSLMODE === 'require' || process.env.PGSSL === 'true';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// ---------------- SCHEMA ----------------
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      name TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_name_lower_idx ON users (LOWER(name));
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload JSONB NOT NULL
    );
  `);
}

// ---------------- USUÁRIOS ----------------
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, is_admin AS "isAdmin" FROM users ORDER BY name ASC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao buscar usuários.' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, pin } = req.body || {};
  if (!name || !/^\d{4}$/.test(String(pin || ''))) {
    return res.status(400).json({ ok: false, error: 'Dados inválidos.' });
  }
  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE LOWER(name) = LOWER($1)', [name]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ ok: false, error: 'Esse nome já existe. Escolha "Entrar" e use o PIN cadastrado.' });
    }
    await pool.query('INSERT INTO users (name, pin_hash) VALUES ($1, $2)', [name, hashPin(pin)]);
    res.json({ ok: true, name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao criar usuário.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { name, pin } = req.body || {};
  try {
    const { rows } = await pool.query('SELECT name, pin_hash, is_admin AS "isAdmin" FROM users WHERE LOWER(name) = LOWER($1)', [name]);
    const user = rows[0];
    if (!user) return res.status(404).json({ ok: false, error: 'Usuário não encontrado. Crie um novo cadastro.' });
    if (user.pin_hash !== hashPin(pin)) return res.status(401).json({ ok: false, error: 'PIN incorreto.' });
    res.json({ ok: true, name: user.name, isAdmin: user.isAdmin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao entrar.' });
  }
});

// ---------------- PROMOVER A ADMIN ----------------
// Protegido por uma chave definida no servidor (variável de ambiente ADMIN_SETUP_KEY).
// Uso: POST /api/admin/promote  { "name": "Carlos", "setupKey": "sua-chave-secreta" }
app.post('/api/admin/promote', async (req, res) => {
  const { name, setupKey } = req.body || {};
  if (!process.env.ADMIN_SETUP_KEY) {
    return res.status(400).json({ ok: false, error: 'ADMIN_SETUP_KEY não configurada no servidor.' });
  }
  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return res.status(401).json({ ok: false, error: 'Chave inválida.' });
  }
  try {
    const { rowCount } = await pool.query('UPDATE users SET is_admin = true WHERE LOWER(name) = LOWER($1)', [name]);
    if (rowCount === 0) return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao promover usuário.' });
  }
});

// ---------------- REGISTROS DE MANUTENÇÃO ----------------
app.get('/api/records', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, criado_em, payload FROM records ORDER BY criado_em ASC');
    const records = rows.map(r => ({
      ...r.payload,
      id: r.id,
      criadoEm: r.criado_em.toISOString()
    }));
    res.json(records);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao buscar registros.' });
  }
});

app.post('/api/records', async (req, res) => {
  const rec = req.body;
  if (!rec || !rec.placa || !rec.data || typeof rec.km !== 'number' || !rec.usuario) {
    return res.status(400).json({ ok: false, error: 'Registro inválido.' });
  }
  const id = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  try {
    const { rows } = await pool.query(
      'INSERT INTO records (id, payload) VALUES ($1, $2) RETURNING criado_em',
      [id, rec]
    );
    res.json({ ...rec, id, criadoEm: rows[0].criado_em.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao salvar registro.' });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM records WHERE id = $1', [req.params.id]);
    res.json({ ok: true, removed: rowCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Erro ao remover registro.' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
  })
  .catch(e => {
    console.error('Erro ao conectar/preparar o banco de dados:', e);
    process.exit(1);
  });
