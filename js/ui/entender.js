// js/ui/entender.js
// 3 páginas ilustradas (SVG inline, sem imagens externas) com linguagem
// simples: soma de parcelas iguais, comutatividade (retângulo girando) e
// dobro/metade.

let paginaAtual = 0;

function svgCirculos(qtdGrupos, porGrupo, cor) {
  const raio = 10;
  const espacoX = 26;
  const espacoY = 30;
  let circulos = '';
  for (let g = 0; g < qtdGrupos; g++) {
    for (let i = 0; i < porGrupo; i++) {
      const cx = 20 + i * espacoX;
      const cy = 20 + g * espacoY;
      circulos += `<circle cx="${cx}" cy="${cy}" r="${raio}" fill="${cor}" />`;
    }
  }
  const largura = 20 + porGrupo * espacoX;
  const altura = 20 + qtdGrupos * espacoY;
  return `<svg viewBox="0 0 ${largura} ${altura}" style="width:100%; height:auto;" role="img" aria-label="${qtdGrupos} grupos de ${porGrupo} bolinhas">${circulos}</svg>`;
}

function paginaParcelasIguais() {
  return `
    <h2 class="tela-titulo">Multiplicar é somar em grupos iguais</h2>
    <p>3 × 4 quer dizer: <strong>3 grupos de 4</strong>, tudo somado.</p>
    <div class="pagina-entender__ilustracao">${svgCirculos(3, 4, 'var(--cor-primaria)')}</div>
    <p>4 + 4 + 4 = <strong>12</strong>, e 3 × 4 = <strong>12</strong> também!</p>
  `;
}

function paginaComutatividade() {
  return `
    <h2 class="tela-titulo">3 × 4 é igual a 4 × 3</h2>
    <p>Não importa a ordem — o total de bolinhas é sempre o mesmo. Toque para girar!</p>
    <div class="pagina-entender__ilustracao">
      <div data-el="grade-girar" style="display:inline-block; transition: transform 500ms ease; cursor:pointer;">
        ${svgCirculos(3, 4, 'var(--cor-azul)')}
      </div>
    </div>
    <p data-el="legenda-comutatividade">3 linhas de 4 = <strong>12</strong></p>
  `;
}

function paginaDobroMetade() {
  function barra(comprimento, cor, rotulo) {
    return `
      <div style="display:flex; align-items:center; gap:10px; margin:10px 0;">
        <div style="width:${comprimento}px; max-width:70vw; height:24px; background:${cor}; border-radius:8px;"></div>
        <span>${rotulo}</span>
      </div>
    `;
  }
  return `
    <h2 class="tela-titulo">Dobro e metade</h2>
    <p><strong>Dobro</strong> é multiplicar por 2. <strong>Metade</strong> é dividir por 2.</p>
    <div class="pagina-entender__ilustracao" style="text-align:left; display:inline-block;">
      ${barra(60, 'var(--cor-verde)', 'metade de 8 é 4')}
      ${barra(120, 'var(--cor-verde)', 'dobro de 4 é 8')}
    </div>
    <p>Dica: se você sabe a tabuada do 2, sempre pode achar o dobro de qualquer número! 💡</p>
  `;
}

const PAGINAS = [paginaParcelasIguais, paginaComutatividade, paginaDobroMetade];

function renderizarPagina(raiz, ctx) {
  const conteudo = raiz.querySelector('[data-el="conteudo-pagina"]');
  conteudo.innerHTML = `<div class="pagina-entender">${PAGINAS[paginaAtual]()}</div>`;

  if (paginaAtual === 1) {
    const grade = conteudo.querySelector('[data-el="grade-girar"]');
    const legenda = conteudo.querySelector('[data-el="legenda-comutatividade"]');
    let girado = false;
    grade.addEventListener('click', () => {
      girado = !girado;
      grade.style.transform = girado ? 'rotate(90deg)' : 'rotate(0deg)';
      legenda.innerHTML = girado ? '4 linhas de 3 = <strong>12</strong>' : '3 linhas de 4 = <strong>12</strong>';
    });
  }

  raiz.querySelectorAll('.paginacao__ponto').forEach((ponto, i) => {
    ponto.setAttribute('aria-current', String(i === paginaAtual));
  });

  raiz.querySelector('[data-acao="anterior"]').disabled = paginaAtual === 0;
  raiz.querySelector('[data-acao="proxima"]').disabled = paginaAtual === PAGINAS.length - 1;
}

export function montar(container, ctx) {
  container.innerHTML = '';
  paginaAtual = 0;

  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <div class="tela-cabecalho">
      <button class="botao-voltar" type="button" aria-label="Voltar ao início">←</button>
      <h1 class="tela-titulo">Entender</h1>
    </div>
    <div data-el="conteudo-pagina"></div>
    <div class="paginacao" role="tablist" aria-label="Páginas">
      ${PAGINAS.map((_, i) => `<button class="paginacao__ponto" type="button" aria-label="Página ${i + 1}"></button>`).join('')}
    </div>
    <div class="linha-acoes" style="justify-content:center; margin-top:12px;">
      <button class="botao botao--secundario" type="button" data-acao="anterior">← Anterior</button>
      <button class="botao" type="button" data-acao="proxima">Próxima →</button>
    </div>
  `;

  raiz.querySelector('.botao-voltar').addEventListener('click', () => ctx.navegarPara('/'));
  raiz.querySelector('[data-acao="anterior"]').addEventListener('click', () => {
    if (paginaAtual > 0) {
      paginaAtual--;
      renderizarPagina(raiz, ctx);
    }
  });
  raiz.querySelector('[data-acao="proxima"]').addEventListener('click', () => {
    if (paginaAtual < PAGINAS.length - 1) {
      paginaAtual++;
      renderizarPagina(raiz, ctx);
    }
  });
  raiz.querySelectorAll('.paginacao__ponto').forEach((ponto, i) => {
    ponto.addEventListener('click', () => {
      paginaAtual = i;
      renderizarPagina(raiz, ctx);
    });
  });

  container.appendChild(raiz);
  renderizarPagina(raiz, ctx);
}

export function desmontar() {}
