// frontend/app.js
// Логика веб-админки

const API = "";

// Переключение вкладок
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("nav button")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "stats") loadStats();
    if (btn.dataset.tab === "contacts") loadContacts();
  });
});

// Загрузка статистики
async function loadStats() {
  const container = document.getElementById("stats-content");
  container.innerHTML = "Загрузка...";

  try {
    const res = await fetch(`${API}/api/stats`);
    const stats = await res.json();

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalContacts || 0}</div>
          <div class="stat-label">Всего контактов</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.whatsappContacts || 0}</div>
          <div class="stat-label">С WhatsApp</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalCampaigns || 0}</div>
          <div class="stat-label">Рассылок</div>
        </div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `Ошибка: ${error.message}`;
  }
}

// Загрузка контактов
async function loadContacts() {
  const tbody = document.querySelector("#contacts-table tbody");
  tbody.innerHTML = "Загрузка...";

  try {
    const res = await fetch(`${API}/api/contacts`);
    const contacts = await res.json();

    tbody.innerHTML = contacts
      .map(
        (c) => `
      <tr>
        <td>${c.full_name || c.username || "-"}</td>
        <td>${c.source || "-"}</td>
        <td>${c.phone || "-"}</td>
        <td>${c.telegram_link ? `<a href="${c.telegram_link}" target="_blank">Профиль</a>` : "-"}</td>
        <td>${c.instagram_link ? `<a href="${c.instagram_link}" target="_blank">Профиль</a>` : "-"}</td>
        <td>${c.has_whatsapp ? "✅" : "❌"}</td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    tbody.innerHTML = `Ошибка: ${error.message}`;
  }
}

// Парсинг Telegram
document.getElementById("tg-parse-btn").addEventListener("click", async () => {
  const log = document.getElementById("tg-parse-log");
  const btn = document.getElementById("tg-parse-btn");

  // Если уже идёт запрос — повторно не запускаем
  if (btn.disabled) return;

  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Выполняется...";
  log.textContent = "Запуск...";

  const apiId = document.getElementById("tg-api-id").value.trim();
  const apiHash = document.getElementById("tg-api-hash").value.trim();
  const chatIds = document.getElementById("tg-chats").value.trim();

  if (!apiId || !apiHash || !chatIds) {
    log.textContent = "Ошибка: заполните API ID, API Hash и чаты.";
    btn.disabled = false;
    btn.textContent = oldText;
    return;
  }

  try {
    const res = await fetch("/api/parse/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiId, apiHash, chatIds }),
    });

    const result = await res.json();

    if (!res.ok) {
      log.textContent = `Ошибка: ${result.error || "неизвестная ошибка"}`;
    } else {
      log.textContent = result.message || JSON.stringify(result, null, 2);
    }
  } catch (error) {
    log.textContent = `Ошибка сети: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
});
// Парсинг Instagram
document.getElementById("ig-parse-btn").addEventListener("click", async () => {
  const log = document.getElementById("ig-parse-log");
  log.textContent = "Запуск...";

  const hashtags = document.getElementById("ig-hashtags").value;
  const maxPostsPerHashtag = document.getElementById("ig-max-posts").value;

  try {
    const res = await fetch(`${API}/api/parse/instagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashtags, maxPostsPerHashtag }),
    });

    const result = await res.json();
    log.textContent = result.message || JSON.stringify(result, null, 2);
  } catch (error) {
    log.textContent = `Ошибка: ${error.message}`;
  }
});

// Проверка WhatsApp
document.getElementById("wa-check-btn").addEventListener("click", async () => {
  const log = document.getElementById("wa-check-log");
  log.textContent = "Запуск...";

  try {
    const res = await fetch(`${API}/api/check/whatsapp`, {
      method: "POST",
    });

    const result = await res.json();
    log.textContent = `${result.message}\n✅ Есть WhatsApp: ${result.ok}\n❌ Нет WhatsApp: ${result.bad}\n⚠️ Ошибки: ${result.errors}`;
  } catch (error) {
    log.textContent = `Ошибка: ${error.message}`;
  }
});

// Рассылка
document.getElementById("send-btn").addEventListener("click", async () => {
  const log = document.getElementById("send-log");
  log.textContent = "Отправка...";

  const channel = document.getElementById("send-channel").value;
  const message = document.getElementById("send-message").value;

  try {
    const res = await fetch(`${API}/api/send/${channel}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const result = await res.json();
    log.textContent = `${result.message}\n✅ Отправлено: ${result.sent}\n❌ Ошибки: ${result.failed}`;
  } catch (error) {
    log.textContent = `Ошибка: ${error.message}`;
  }
});

// Обновление контактов
document
  .getElementById("contacts-refresh")
  .addEventListener("click", loadContacts);

// Экспорт в CSV
document.getElementById("contacts-export").addEventListener("click", () => {
  window.location.href = `${API}/api/export/csv`;
});

// Загрузка статистики при старте
loadStats();
