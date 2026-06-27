/**
 * sw.js — Service Worker do Painel O&M
 * Responsável por receber notificações push e exibi-las no Android.
 */

const CACHE_NAME = 'painel-om-v1';

// Instala o Service Worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Recebe notificação push do servidor
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
    body:    data.body || 'Nova atualização disponível.',
    icon:    data.icon || '/PAINELDEFALHAS/icon-192.png',
    badge:   data.badge || '/PAINELDEFALHAS/icon-192.png',
    tag:     data.tag || 'painel-om',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || 'https://fred-alexandrino.github.io/PAINELDEFALHAS/',
      tipo: data.tipo || 'geral',
    },
    actions: [
      { action: 'abrir', title: '📋 Ver no Painel' },
      { action: 'fechar', title: 'Fechar' },
    ],
  };

  // Cor do ícone por tipo
  if (data.tipo === 'desligamento') {
    options.tag = 'painel-desligamento';
    options.renotify = true;
    options.vibrate = [300, 100, 300, 100, 300];
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'fechar') return;

  const url = event.notification.data?.url ||
              'https://fred-alexandrino.github.io/PAINELDEFALHAS/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Se o painel já está aberto, foca nele
        for (const client of clientList) {
          if (client.url.includes('PAINELDEFALHAS') && 'focus' in client) {
            return client.focus();
          }
        }
        // Senão abre uma nova janela
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
