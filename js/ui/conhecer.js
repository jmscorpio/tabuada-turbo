// js/ui/conhecer.js
// Carrossel de tabuadas (1–10). Ao abrir uma, mostra os 10 fatos com TTS
// lendo cada um e um botão para praticar aquela tabuada especificamente.

let tabuadaSelecionada = 1;

function renderizarLista(container, ctx) {
  const listaEl = container.querySelector('[data-el="lista"]');
  const tituloEl = container.querySelector('[data-el="titulo-tabuada"]');
  if (!listaEl) return;

  tituloEl.textContent = `Tabuada do ${tabuadaSelecionada}`;

  const itens = [];
  for (let n = 1; n <= 10; n++) {
    const resultado = tabuadaSelecionada * n;
    itens.push(`
      <li class="lista-fatos__item">
        <span>${tabuadaSelecionada} × ${n} = ${resultado}</span>
        <button class="botao-icone" type="button" data-falar="${tabuadaSelecionada} vezes ${n} é igual a ${resultado}" aria-label="Ouvir ${tabuadaSelecionada} vezes ${n}">🔊</button>
      </li>
    `);
  }
  listaEl.innerHTML = itens.join('');

  listaEl.querySelectorAll('[data-falar]').forEach((botao) => {
    botao.addEventListener('click', () => ctx.tts.falar(botao.dataset.falar));
  });
}

export function montar(container, ctx) {
  container.innerHTML = '';

  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <div class="tela-cabecalho">
      <button class="botao-voltar" type="button" aria-label="Voltar ao início">←</button>
      <h1 class="tela-titulo">Conhecer</h1>
    </div>
    <div class="carrossel-tabuadas" role="tablist" aria-label="Escolha uma tabuada" data-el="carrossel"></div>
    <h2 class="tela-titulo" data-el="titulo-tabuada" style="font-size:1.2rem;"></h2>
    <ul class="lista-fatos" data-el="lista"></ul>
    <div class="linha-acoes">
      <button class="botao botao--bloco" type="button" data-acao="praticar-esta">Praticar esta tabuada ✏️</button>
    </div>
  `;

  raiz.querySelector('.botao-voltar').addEventListener('click', () => ctx.navegarPara('/'));

  const carrossel = raiz.querySelector('[data-el="carrossel"]');
  for (let t = 1; t <= 10; t++) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'carrossel-tabuadas__item';
    botao.textContent = t;
    botao.setAttribute('role', 'tab');
    botao.setAttribute('aria-current', String(t === tabuadaSelecionada));
    botao.addEventListener('click', () => {
      tabuadaSelecionada = t;
      carrossel
        .querySelectorAll('.carrossel-tabuadas__item')
        .forEach((b) => b.setAttribute('aria-current', String(Number(b.textContent) === t)));
      renderizarLista(raiz, ctx);
    });
    carrossel.appendChild(botao);
  }

  raiz.querySelector('[data-acao="praticar-esta"]').addEventListener('click', () => {
    ctx.salvarPrefs({ filtroPraticar: tabuadaSelecionada });
    ctx.navegarPara('/praticar');
  });

  container.appendChild(raiz);
  renderizarLista(raiz, ctx);
}

export function desmontar() {}
