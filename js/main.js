// js/main.js
// Ponto de entrada: registra o Service Worker (offline-first) e inicia o app.

import { iniciar } from './app.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((erro) => {
      console.warn('Não foi possível registrar o Service Worker:', erro);
    });
  });
}

function comecar() {
  iniciar().catch((erro) => {
    console.error('Falha ao iniciar o Tabuada Turbo:', erro);
    const container = document.getElementById('app');
    if (container) {
      container.innerHTML =
        '<p class="aviso-caixa">Não consegui carregar o app. Recarregue a página, por favor.</p>';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', comecar);
} else {
  comecar();
}
