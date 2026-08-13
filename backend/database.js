// backend/database.js
// SQLite база данных для хранения контактов и статистики

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

// Берём путь из .env или по умолчанию ../output/leads.db
const RAW_DB_PATH = process.env.DATABASE_PATH || "../output/leads.db";

// Превращаем его в абсолютный путь относительно папки backend
// __dirname здесь = D:\parserOfCustumer\backend
const DB_PATH = path.resolve(__dirname, RAW_DB_PATH);

// Убеждаемся, что папка для БД существует
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("📁 Создана папка для БД:", dbDir);
}

let db = null;

/**
 * Инициализация базы данных
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    console.log("🗄  Открываю базу данных по пути:", DB_PATH);

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("❌ Ошибка подключения к БД:", err);
        reject(err);
        return;
      }

      console.log("✅ База данных подключена:", DB_PATH);

      // Создаём таблицы
      db.serialize(() => {
        // Таблица контактов
        db.run(`
          CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            full_name TEXT,
            phone TEXT,
            email TEXT,
            source TEXT,
            telegram_link TEXT,
            instagram_link TEXT,
            bio TEXT,
            followers INTEGER,
            has_whatsapp INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, phone)
          )
        `);

        // Таблица рассылок
        db.run(`
          CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel TEXT,
            message TEXT,
            sent_count INTEGER,
            failed_count INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Таблица логов рассылки
        db.run(`
          CREATE TABLE IF NOT EXISTS send_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            contact_id INTEGER,
            channel TEXT,
            status TEXT,
            error TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
            FOREIGN KEY(contact_id) REFERENCES contacts(id)
          )
        `);

        resolve();
      });
    });
  });
}

/**
 * Добавление контакта
 */
function addContact(contact) {
  return new Promise((resolve, reject) => {
    const {
      username,
      full_name,
      phone,
      email,
      source,
      telegram_link,
      instagram_link,
      bio,
      followers,
    } = contact;

    const sql = `
      INSERT OR IGNORE INTO contacts 
      (username, full_name, phone, email, source, telegram_link, instagram_link, bio, followers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,
      [
        username,
        full_name,
        phone,
        email,
        source,
        telegram_link,
        instagram_link,
        bio,
        followers,
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      },
    );
  });
}

/**
 * Добавление нескольких контактов
 */
async function addContacts(contacts) {
  let added = 0;
  for (const contact of contacts) {
    const success = await addContact(contact);
    if (success) added++;
  }
  return added;
}

/**
 * Получение всех контактов
 */
function getAllContacts() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM contacts ORDER BY created_at DESC",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

/**
 * Получение контактов с WhatsApp
 */
function getWhatsappContacts() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM contacts WHERE has_whatsapp = 1 ORDER BY created_at DESC",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

/**
 * Обновление статуса WhatsApp
 */
function updateWhatsappStatus(phone, hasWhatsapp) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE contacts SET has_whatsapp = ? WHERE phone = ?",
      [hasWhatsapp ? 1 : 0, phone],
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

/**
 * Статистика
 */
function getStats() {
  return new Promise((resolve, reject) => {
    const stats = {};

    db.get("SELECT COUNT(*) as total FROM contacts", [], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      stats.totalContacts = row.total;

      db.get(
        "SELECT COUNT(*) as total FROM contacts WHERE has_whatsapp = 1",
        [],
        (err2, row2) => {
          if (err2) {
            reject(err2);
            return;
          }
          stats.whatsappContacts = row2.total;

          db.get(
            "SELECT COUNT(*) as total FROM campaigns",
            [],
            (err3, row3) => {
              if (err3) {
                reject(err3);
                return;
              }
              stats.totalCampaigns = row3.total;

              resolve(stats);
            },
          );
        },
      );
    });
  });
}

/**
 * Закрытие базы
 */
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else {
          console.log("👋 База данных отключена");
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initDatabase,
  addContact,
  addContacts,
  getAllContacts,
  getWhatsappContacts,
  updateWhatsappStatus,
  getStats,
  closeDatabase,
};
