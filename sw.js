// sw.js
// Service Worker offline-first: cache-first para o app shell inteiro.
// O nome do cache leva a versão — mude CACHE_VERSAO para forçar a troca de
// cache num novo deploy (cache busting).

const CACHE_VERSAO = 'v4';
const CACHE_NOME = `tabuada-turbo-${CACHE_VERSAO}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/theme.css',
  './css/components.css',
  './css/kid-mode.css',
  './js/config.js',
  './js/main.js',
  './js/app.js',
  './js/db.js',
  './js/scheduler.js',
  './js/session.js',
  './js/tts.js',
  './js/analytics.js',
  './js/ui/home.js',
  './js/ui/pratica.js',
  './js/ui/jogo.js',
  './js/ui/conhecer.js',
  './js/ui/entender.js',
  './js/ui/responsavel.js',
  './data/tabuadas.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_NOME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith('tabuada-turbo-') && nome !== CACHE_NOME)
            .map((nome) => caches.delete(nome))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  evento.respondWith(
    caches.match(requisicao).then((respostaCacheada) => {
      if (respostaCacheada) return respostaCacheada;

      return fetch(requisicao)
        .then((respostaRede) => {
          if (respostaRede && respostaRede.ok) {
            const clone = respostaRede.clone();
            caches.open(CACHE_NOME).then((cache) => cache.put(requisicao, clone));
          }
          return respostaRede;
        })
        .catch(() => {
          if (requisicao.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
