/**
 * Service Worker - Néia Salgados PWA
 *
 * Estratégia:
 * 1. Cache-first para assets estáticos (CSS, JS, imagens, ícones)
 * 2. Network-first para rotas dinâmicas (cardápio, pedidos)
 * 3. Push notifications para atualizações de pedidos
 *
 * Arquivos de autenticação, pedidos, pagamentos, Pix ou localização
 * NUNCA são armazenados em cache compartilhado.
 */

const CACHE_NAME = 'neia-salgados-v1';
const STATIC_CACHE = 'neia-static-v1';

// Assets estáticos para cache-first (apenas arquivos públicos, sem dados sensíveis)
const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/manifest.json',
  '/icons/icon-72x72.svg',
  '/icons/icon-96x96.svg',
  '/icons/icon-128x128.svg',
  '/icons/icon-144x144.svg',
  '/icons/icon-152x152.svg',
  '/icons/icon-192x192.svg',
  '/icons/icon-384x384.svg',
  '/icons/icon-512x512.svg',
  '/icons/icon-maskable-512x512.svg',
];

// Rotas públicas que podem ser cacheadas (sem dados pessoais)
const PUBLIC_ROUTES = [
  '/',
  '/combo',
  '/calculadora',
  '/parceiros',
  '/ajuda',
  '/historia',
];

// Rotas que NUNCA devem ser cacheadas (contêm dados sensíveis)
const NO_CACHE_ROUTES = [
  '/conta',
  '/checkout',
  '/pedido',
  '/auth',
  '/admin',
  '/atendente',
  '/contador',
  '/equipe',
  '/financeiro',
  '/gestao',
  '/operacao',
  '/producao',
  '/pdv',
  '/crm-config',
  '/crm-config',
];

function isNoCacheRoute(url) {
  return NO_CACHE_ROUTES.some((route) => url.pathname.startsWith(route));
}

function isPublicRoute(url) {
  return PUBLIC_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(route + '/'));
}

// Instalar - fazer cache prévio dos assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.warn('[SW] Falha ao cachear assets estáticos:', err);
    })
  );
  self.skipWaiting();
});

// Ativar - limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Buscar - estratégia híbrida
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não processar requisições não-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Não processar requisições para outras origens
  if (url.origin !== self.location.origin) {
    return;
  }

  // Não cachear rotas com dados sensíveis
  if (isNoCacheRoute(url)) {
    return;
  }

  // Cache-first para assets estáticos
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first para rotas públicas dinâmicas
  if (isPublicRoute(url)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        // Só cachear respostas bem-sucedidas
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback para cache se falhar a rede
        return caches.match(event.request);
      })
    );
    return;
  }

  // Para outras requisições, tentar rede primeiro
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Push notifications (mantido do service worker original)
self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = typeof dados.titulo === 'string' && dados.titulo
    ? dados.titulo
    : 'Néia Salgados';
  const corpo = typeof dados.corpo === 'string' && dados.corpo
    ? dados.corpo
    : 'Atualização do seu pedido.';
  const url = typeof dados.url === 'string' && dados.url.startsWith('/')
    ? dados.url
    : '/';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url },
      tag: typeof dados.pedido === 'string' ? `pedido-${dados.pedido}` : 'neia',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of janelas) {
        if (w.url.includes(new URL(url, self.location.origin).pathname)) {
          await w.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
