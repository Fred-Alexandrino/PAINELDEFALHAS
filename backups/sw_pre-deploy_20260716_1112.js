/**
 * sw.js — Service Worker do Painel O&M
 * v2 — Push notifications + Cache offline
 */

const CACHE_NAME   = 'painel-om-v2';
const CACHE_URLS   = [
  '/PAINELDEFALHAS/',
  '/PAINELDEFALHAS/index.html',
];

// ── Instalação: pré-cacheia o shell do app ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Ativação: remove caches antigos ──────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// ── Fetch: Network First com fallback para cache ──────────────────────────
// Para o index.html: tenta rede → se offline, serve do cache
// Para Google Sheets (dados): tenta rede → se offline, retorna último cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições de outros domínios que não sejam Sheets ou o próprio app
  const ehApp    = url.origin === self.location.origin;
  const ehSheets = url.hostname === 'docs.google.com' || url.hostname === 'sheets.googleapis.com';

  if (!ehApp && !ehSheets) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza cache com resposta fresca
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline: serve do cache
        caches.match(event.request).then(cached =>
          cached || caches.match('/PAINELDEFALHAS/index.html')
        )
      )
  );
});

// ── Push: recebe notificação do servidor ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Painel O&M', body: event.data.text() };
  }

  const title   = data.title || 'Painel O&M — Grid Co';
  const options = {
    body:     data.body || 'Nova atualização disponível.',
    icon:     data.icon || '/PAINELDEFALHAS/icon-192.png',
    badge:    '/PAINELDEFALHAS/icon-192.png',
    tag:      data.tag || 'painel-om',
    renotify: true,
    vibrate:  [200, 100, 200],
    data: {
      url:  data.url || 'https://fred-alexandrino.github.io/PAINELDEFALHAS/',
      tipo: data.tipo || 'geral',
    },
    actions: [
      { action: 'abrir',  title: '📋 Ver no Painel' },
      { action: 'fechar', title: 'Fechar' },
    ],
  };

  // Vibração reforçada para desligamentos
  if (data.tipo === 'desligamento') {
    options.tag      = 'painel-desligamento';
    options.vibrate  = [300, 100, 300, 100, 300];
    options.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Clique na notificação ────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'fechar') return;

  const url = event.notification.data?.url ||
              'https://fred-alexandrino.github.io/PAINELDEFALHAS/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('PAINELDEFALHAS') && 'focus' in client) {
            // Navega a aba já aberta para o link específico (ex: ?atividade=20)
            // em vez de só focar nela como estava antes — senão o clique nunca
            // levava pro card certo quando o painel já estava aberto.
            if ('navigate' in client) {
              return client.navigate(url).then(c => c.focus());
            }
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── Sync em background: quando volta online, avisa o app ────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-dados') {
    event.waitUntil(
      clients.matchAll().then(clientList =>
        clientList.forEach(client =>
          client.postMessage({ type: 'SYNC_ONLINE' })
        )
      )
    );
  }
});
