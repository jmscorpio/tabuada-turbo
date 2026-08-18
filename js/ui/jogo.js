// js/ui/jogo.js
// Hub de jogos + 3 minijogos, sempre só com fatos maduros, medindo contra
// RECORDES PESSOAIS (não há ranking — só existe uma jogadora). Sem "vidas",
// sem punição por erro.

const CHAVE_RECORDES = 'tt_recordes_v1';

let ctxAtual = null;
let intervalosAtivos = [];

function limparIntervalos() {
  intervalosAtivos.forEach(clearInterval);
  intervalosAtivos = [];
}

function lerRecordes() {
  try {
    const bruto = localStorage.getItem(CHAVE_RECORDES);
    return bruto
      ? { melhorMediaSequenciaMs: null, vitoriasBatalha: 0, melhorAcertosDetetive: 0, ...JSON.parse(bruto) }
      : { melhorMediaSequenciaMs: null, vitoriasBatalha: 0, melhorAcertosDetetive: 0 };
  } catch {
    return { melhorMediaSequenciaMs: null, vitoriasBatalha: 0, melhorAcertosDetetive: 0 };
  }
}

function salvarRecordes(recordes) {
  try {
    localStorage.setItem(CHAVE_RECORDES, JSON.stringify(recordes));
  } catch {
    // segue sem salvar recorde se localStorage estiver indisponível
  }
}

function embaralhar(array) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function montarFilaDeContas(fatosMaduros, quantidade) {
  const embaralhados = embaralhar(fatosMaduros);
  const fila = [];
  for (let i = 0; i < quantidade; i++) {
    fila.push(embaralhados[i % embaralhados.length]);
  }
  return fila;
}

function calcularEstrelas(mediaMs, cfg) {
  if (mediaMs > 0 && mediaMs <= cfg.T_ESTRELA) return 3;
  if (mediaMs > 0 && mediaMs <= cfg.ESTRELA_2_MAX_MS) return 2;
  return 1;
}

function renderEstrelasHtml(qtd) {
  return Array.from({ length: 3 }, (_, i) =>
    i < qtd ? '<span aria-hidden="true">⭐</span>' : '<span class="estrela--apagada" aria-hidden="true">⭐</span>'
  ).join('');
}

function renderTecladoNumerico(container, input, aoConfirmar) {
  const teclado = document.createElement('div');
  teclado.className = 'grade-cards';
  teclado.style.gridTemplateColumns = 'repeat(3, 1fr)';
  teclado.style.gap = '8px';
  teclado.setAttribute('role', 'group');
  teclado.setAttribute('aria-label', 'Teclado numérico');

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
  for (const tecla of teclas) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao botao--secundario';
    botao.style.minHeight = '52px';
    botao.style.fontSize = '1.35rem';
    botao.textContent = tecla;
    botao.setAttribute('aria-label', tecla === '⌫' ? 'Apagar' : tecla === '✓' ? 'Confirmar' : tecla);
    botao.addEventListener('click', () => {
      if (tecla === '⌫') {
        input.value = input.value.slice(0, -1);
      } else if (tecla === '✓') {
        aoConfirmar();
        return;
      } else {
        input.value += tecla;
      }
      input.focus();
    });
    teclado.appendChild(botao);
  }
  container.appendChild(teclado);
}

function cabecalho(titulo, aoVoltar) {
  const div = document.createElement('div');
  div.className = 'tela-cabecalho';
  div.innerHTML = `
    <button class="botao-voltar" type="button" aria-label="Voltar">←</button>
    <h1 class="tela-titulo">${titulo}</h1>
  `;
  div.querySelector('.botao-voltar').addEventListener('click', aoVoltar);
  return div;
}

// ---------------------------------------------------------------------
// HUB
// ---------------------------------------------------------------------

function renderizarHub(container, ctx) {
  container.innerHTML = '';
  const fatosMaduros = ctx.getFatosState().filter((f) => ctx.scheduler.isFatoMaduro(f));
  const recordes = lerRecordes();

  const raiz = document.createElement('div');
  raiz.appendChild(cabecalho('Jogar', () => ctx.navegarPara('/')));

  if (fatosMaduros.length < 3) {
    raiz.innerHTML += `
      <div class="aviso-caixa">
        Pratique mais um pouquinho pra desbloquear os jogos — eles usam só as
        contas que você já domina bem! 🔓
      </div>
      <div class="linha-acoes" style="margin-top:16px;">
        <button class="botao" type="button" data-acao="praticar">Ir praticar ✏️</button>
      </div>
    `;
    raiz.querySelector('[data-acao="praticar"]').addEventListener('click', () => ctx.navegarPara('/praticar'));
    container.appendChild(raiz);
    return;
  }

  const cards = document.createElement('div');
  cards.className = 'grade-cards';
  cards.innerHTML = `
    <button class="card-grande card-grande--jogar" type="button" data-jogo="sequencia">
      <span class="card-grande__emoji" aria-hidden="true">⚡</span>
      Sequência rápida
      ${recordes.melhorMediaSequenciaMs ? `<small>recorde: ${Math.round(recordes.melhorMediaSequenciaMs)}ms/conta</small>` : ''}
    </button>
    <button class="card-grande card-grande--praticar" type="button" data-jogo="batalha">
      <span class="card-grande__emoji" aria-hidden="true">🤖</span>
      Batalha contra o Robô
      <small>vitórias: ${recordes.vitoriasBatalha}</small>
    </button>
    <button class="card-grande card-grande--conhecer" type="button" data-jogo="detetive">
      <span class="card-grande__emoji" aria-hidden="true">🕵️</span>
      Detetive
      ${recordes.melhorAcertosDetetive ? `<small>recorde: ${recordes.melhorAcertosDetetive} acertos</small>` : ''}
    </button>
  `;
  cards.querySelectorAll('[data-jogo]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const jogo = botao.dataset.jogo;
      if (jogo === 'sequencia') renderizarSequenciaRapida(container, ctx, fatosMaduros);
      if (jogo === 'batalha') renderizarEscolhaDificuldadeBatalha(container, ctx, fatosMaduros);
      if (jogo === 'detetive') renderizarDetetive(container, ctx, fatosMaduros);
    });
  });
  raiz.appendChild(cards);
  container.appendChild(raiz);
}

// ---------------------------------------------------------------------
// Jogo 1: Sequência rápida
// ---------------------------------------------------------------------

function renderizarSequenciaRapida(container, ctx, fatosMaduros) {
  container.innerHTML = '';
  const TOTAL = 10;
  const fila = montarFilaDeContas(fatosMaduros, TOTAL);
  let indice = 0;
  let acertos = 0;
  let respondeu = false; // trava contra duplo envio (Enter repetido antes do próximo render)
  const inicioTotal = Date.now();
  let inicioConta = Date.now();

  const raiz = document.createElement('div');
  raiz.appendChild(cabecalho('Sequência rápida', () => renderizarHub(container, ctx)));
  const areaJogo = document.createElement('div');
  raiz.appendChild(areaJogo);
  container.appendChild(raiz);

  function proximaConta() {
    if (indice >= fila.length) {
      finalizar();
      return;
    }
    const fato = fila[indice];
    const inverte = Math.random() < 0.5;
    const primeiro = inverte ? fato.b : fato.a;
    const segundo = inverte ? fato.a : fato.b;
    inicioConta = Date.now();
    respondeu = false;

    areaJogo.innerHTML = `
      <p style="text-align:center; font-weight:700; margin:0 0 6px;">Conta ${indice + 1} de ${TOTAL}</p>
      <div class="pergunta-card">
        <p class="pergunta-conta">${primeiro} × ${segundo}</p>
        <input class="input-resposta" type="text" inputmode="none" pattern="[0-9]*" aria-label="Digite a resposta" data-el="input" />
        <p class="feedback-mensagem" data-el="feedback" aria-live="polite"></p>
        <div data-el="teclado"></div>
      </div>
    `;
    const input = areaJogo.querySelector('[data-el="input"]');
    input.focus();
    const aoConfirmar = () => confirmar(fato, primeiro, segundo, input);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') aoConfirmar();
    });
    renderTecladoNumerico(areaJogo.querySelector('[data-el="teclado"]'), input, aoConfirmar);
  }

  function confirmar(fato, primeiro, segundo, input) {
    if (respondeu || input.value.trim() === '') return;
    respondeu = true;
    const tempoMs = Date.now() - inicioConta;
    const correto = Number(input.value) === fato.a * fato.b;
    ctx.db.addResposta({ chave: fato.chave, correto, tempoMs, timestamp: Date.now(), modo: 'jogo-sequencia' });
    if (correto) acertos++;

    const feedback = areaJogo.querySelector('[data-el="feedback"]');
    feedback.textContent = correto ? 'Certinho! ✅' : `Quase! Era ${fato.a * fato.b}.`;
    feedback.className = `feedback-mensagem ${correto ? 'feedback-mensagem--sucesso' : 'feedback-mensagem--erro'}`;
    indice++;
    setTimeout(proximaConta, 500);
  }

  function finalizar() {
    const mediaMs = (Date.now() - inicioTotal) / TOTAL;
    const estrelas = calcularEstrelas(mediaMs, ctx.config);
    const recordes = lerRecordes();
    const bateuRecorde = !recordes.melhorMediaSequenciaMs || mediaMs < recordes.melhorMediaSequenciaMs;
    if (bateuRecorde) {
      recordes.melhorMediaSequenciaMs = mediaMs;
      salvarRecordes(recordes);
    }

    areaJogo.innerHTML = `
      <div class="pergunta-card">
        <p style="font-size:2.4rem;">🏁</p>
        <h2 class="tela-titulo">Resultado</h2>
        <div class="estrelas">${renderEstrelasHtml(estrelas)}</div>
        <p>${acertos} de ${TOTAL} certas — média de ${Math.round(mediaMs)}ms por conta</p>
        ${bateuRecorde ? '<p><strong>Novo recorde pessoal! 🏆</strong></p>' : ''}
        <div class="linha-acoes">
          <button class="botao" type="button" data-acao="repetir">Jogar de novo</button>
          <button class="botao botao--secundario" type="button" data-acao="hub">Outros jogos</button>
        </div>
      </div>
    `;
    areaJogo.querySelector('[data-acao="repetir"]').addEventListener('click', () =>
      renderizarSequenciaRapida(container, ctx, fatosMaduros)
    );
    areaJogo.querySelector('[data-acao="hub"]').addEventListener('click', () => renderizarHub(container, ctx));
  }

  proximaConta();
}

// ---------------------------------------------------------------------
// Jogo 2: Batalha contra o Robô
// ---------------------------------------------------------------------

const RITMOS_ROBO = {
  tranquilo: { rotulo: 'Tranquilo', intervaloMs: 6000, chanceErro: 0.1 },
  esperto: { rotulo: 'Esperto', intervaloMs: 4000, chanceErro: 0 },
  turbo: { rotulo: 'Turbo', intervaloMs: 2500, chanceErro: 0 },
};

function renderizarEscolhaDificuldadeBatalha(container, ctx, fatosMaduros) {
  container.innerHTML = '';
  const raiz = document.createElement('div');
  raiz.appendChild(cabecalho('Batalha contra o Robô', () => renderizarHub(container, ctx)));
  raiz.innerHTML += `
    <p>Escolha o ritmo do robô 🤖 — vence quem chegar a 20 pontos primeiro!</p>
    <div class="linha-acoes" style="flex-direction:column;">
      <button class="botao botao--bloco" type="button" data-nivel="tranquilo">Tranquilo</button>
      <button class="botao botao--bloco botao--secundario" type="button" data-nivel="esperto">Esperto</button>
      <button class="botao botao--bloco" type="button" data-nivel="turbo" style="background:var(--cor-amarelo)">Turbo</button>
    </div>
  `;
  raiz.querySelectorAll('[data-nivel]').forEach((botao) => {
    botao.addEventListener('click', () => renderizarBatalha(container, ctx, fatosMaduros, botao.dataset.nivel));
  });
  container.appendChild(raiz);
}

function renderizarBatalha(container, ctx, fatosMaduros, nivel) {
  container.innerHTML = '';
  const ritmo = RITMOS_ROBO[nivel];
  const META = 20;
  let pontosJogador = 0;
  let pontosRobo = 0;
  let terminado = false;

  const raiz = document.createElement('div');
  raiz.appendChild(cabecalho(`Batalha (${ritmo.rotulo})`, () => {
    limparIntervalos();
    renderizarHub(container, ctx);
  }));

  const placar = document.createElement('p');
  placar.style.textAlign = 'center';
  placar.style.fontWeight = '800';
  placar.style.fontSize = '1.2rem';
  placar.style.margin = '0 0 6px';
  raiz.appendChild(placar);

  const areaJogo = document.createElement('div');
  raiz.appendChild(areaJogo);
  container.appendChild(raiz);

  function atualizarPlacar() {
    placar.textContent = `Você ${pontosJogador} × ${pontosRobo} Robô 🤖`;
  }

  function terminar(vencedor) {
    if (terminado) return;
    terminado = true;
    limparIntervalos();

    if (vencedor === 'jogador') {
      const recordes = lerRecordes();
      recordes.vitoriasBatalha += 1;
      salvarRecordes(recordes);
    }

    areaJogo.innerHTML = `
      <div class="pergunta-card">
        <p style="font-size:2.4rem;">${vencedor === 'jogador' ? '🏆' : '🤖'}</p>
        <h2 class="tela-titulo">${vencedor === 'jogador' ? 'Você venceu!' : 'O robô venceu desta vez!'}</h2>
        <p>${vencedor === 'jogador' ? 'Mandou muito bem! 🎉' : 'Ele não zomba de ninguém — só quer a revanche! 😄'}</p>
        <div class="linha-acoes">
          <button class="botao" type="button" data-acao="revanche">Revanche 🔁</button>
          <button class="botao botao--secundario" type="button" data-acao="hub">Outros jogos</button>
        </div>
      </div>
    `;
    areaJogo.querySelector('[data-acao="revanche"]').addEventListener('click', () =>
      renderizarBatalha(container, ctx, fatosMaduros, nivel)
    );
    areaJogo.querySelector('[data-acao="hub"]').addEventListener('click', () => renderizarHub(container, ctx));
  }

  const idIntervalo = setInterval(() => {
    if (terminado) return;
    const errou = Math.random() < ritmo.chanceErro;
    if (!errou) pontosRobo++;
    atualizarPlacar();
    if (pontosRobo >= META) terminar('robo');
  }, ritmo.intervaloMs);
  intervalosAtivos.push(idIntervalo);

  function proximaConta() {
    if (terminado) return;
    const fato = fatosMaduros[Math.floor(Math.random() * fatosMaduros.length)];
    const inverte = Math.random() < 0.5;
    const primeiro = inverte ? fato.b : fato.a;
    const segundo = inverte ? fato.a : fato.b;

    areaJogo.innerHTML = `
      <div class="pergunta-card">
        <p class="pergunta-conta">${primeiro} × ${segundo}</p>
        <input class="input-resposta" type="text" inputmode="none" pattern="[0-9]*" aria-label="Digite a resposta" data-el="input" />
        <p class="feedback-mensagem" data-el="feedback" aria-live="polite"></p>
        <div data-el="teclado"></div>
      </div>
    `;
    const input = areaJogo.querySelector('[data-el="input"]');
    input.focus();
    let respondeu = false;

    function confirmar() {
      if (terminado || respondeu || input.value.trim() === '') return;
      respondeu = true;
      const correto = Number(input.value) === fato.a * fato.b;
      ctx.db.addResposta({
        chave: fato.chave,
        correto,
        tempoMs: null,
        timestamp: Date.now(),
        modo: 'jogo-batalha',
      });
      const feedback = areaJogo.querySelector('[data-el="feedback"]');
      if (correto) {
        pontosJogador++;
        atualizarPlacar();
        feedback.textContent = 'Ponto seu! ✅';
        feedback.className = 'feedback-mensagem feedback-mensagem--sucesso';
        if (pontosJogador >= META) {
          terminar('jogador');
          return;
        }
      } else {
        feedback.textContent = `Era ${fato.a * fato.b}. Bora pra próxima!`;
        feedback.className = 'feedback-mensagem feedback-mensagem--erro';
      }
      setTimeout(proximaConta, 450);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmar();
    });
    renderTecladoNumerico(areaJogo.querySelector('[data-el="teclado"]'), input, confirmar);
  }

  atualizarPlacar();
  proximaConta();
}

// ---------------------------------------------------------------------
// Jogo 3: Detetive (TTS fala a conta sem mostrar na tela)
// ---------------------------------------------------------------------

async function renderizarDetetive(container, ctx, fatosMaduros) {
  container.innerHTML = '';
  const TOTAL = 8;
  const fila = montarFilaDeContas(fatosMaduros, TOTAL);
  let indice = 0;
  let acertos = 0;

  const raiz = document.createElement('div');
  raiz.appendChild(cabecalho('Detetive', () => {
    ctx.tts.pararFala();
    renderizarHub(container, ctx);
  }));
  const areaJogo = document.createElement('div');
  raiz.appendChild(areaJogo);
  container.appendChild(raiz);

  const vozOk = await ctx.tts.vozDisponivel();

  async function proximaConta() {
    if (indice >= fila.length) {
      finalizar();
      return;
    }
    const fato = fila[indice];
    const inverte = Math.random() < 0.5;
    const primeiro = inverte ? fato.b : fato.a;
    const segundo = inverte ? fato.a : fato.b;
    const inicio = Date.now();

    areaJogo.innerHTML = `
      <p style="text-align:center; font-weight:700; margin:0 0 6px;">Conta ${indice + 1} de ${TOTAL}</p>
      <div class="pergunta-card">
        ${
          vozOk
            ? `<p style="margin:0; font-size:1.5rem;">🕵️👂 <span style="font-size:1rem; font-weight:700;">Escute e digite:</span></p>`
            : `<div class="aviso-caixa" style="margin:0;">Sem voz em português disponível neste aparelho — mostrando a conta na tela.</div><p class="pergunta-conta">${primeiro} × ${segundo}</p>`
        }
        <input class="input-resposta" type="text" inputmode="none" pattern="[0-9]*" aria-label="Digite a resposta" data-el="input" />
        <p class="feedback-mensagem" data-el="feedback" aria-live="polite"></p>
        ${vozOk ? '<button class="botao botao--secundario" type="button" data-acao="repetir-audio" style="min-height:44px; padding:6px 16px; font-size:0.95rem;">🔊 Repetir</button>' : ''}
        <div data-el="teclado"></div>
      </div>
    `;

    const input = areaJogo.querySelector('[data-el="input"]');
    input.focus();
    let respondeu = false;

    if (vozOk) {
      ctx.tts.falar(`Quanto é ${primeiro} vezes ${segundo}?`);
      areaJogo.querySelector('[data-acao="repetir-audio"]')?.addEventListener('click', () => {
        ctx.tts.falar(`Quanto é ${primeiro} vezes ${segundo}?`);
      });
    }

    function confirmar() {
      if (respondeu || input.value.trim() === '') return;
      respondeu = true;
      const tempoMs = Date.now() - inicio;
      const correto = Number(input.value) === fato.a * fato.b;
      ctx.db.addResposta({ chave: fato.chave, correto, tempoMs, timestamp: Date.now(), modo: 'jogo-detetive' });
      if (correto) acertos++;
      const feedback = areaJogo.querySelector('[data-el="feedback"]');
      feedback.textContent = correto ? 'Isso mesmo! ✅' : `Era ${fato.a * fato.b}.`;
      feedback.className = `feedback-mensagem ${correto ? 'feedback-mensagem--sucesso' : 'feedback-mensagem--erro'}`;
      indice++;
      setTimeout(proximaConta, 600);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmar();
    });
    renderTecladoNumerico(areaJogo.querySelector('[data-el="teclado"]'), input, confirmar);
  }

  function finalizar() {
    const recordes = lerRecordes();
    const bateuRecorde = acertos > recordes.melhorAcertosDetetive;
    if (bateuRecorde) {
      recordes.melhorAcertosDetetive = acertos;
      salvarRecordes(recordes);
    }
    areaJogo.innerHTML = `
      <div class="pergunta-card">
        <p style="font-size:2.4rem;">🕵️</p>
        <h2 class="tela-titulo">Caso encerrado!</h2>
        <p>${acertos} de ${TOTAL} certas</p>
        ${bateuRecorde ? '<p><strong>Novo recorde pessoal! 🏆</strong></p>' : ''}
        <div class="linha-acoes">
          <button class="botao" type="button" data-acao="repetir">Jogar de novo</button>
          <button class="botao botao--secundario" type="button" data-acao="hub">Outros jogos</button>
        </div>
      </div>
    `;
    areaJogo.querySelector('[data-acao="repetir"]').addEventListener('click', () =>
      renderizarDetetive(container, ctx, fatosMaduros)
    );
    areaJogo.querySelector('[data-acao="hub"]').addEventListener('click', () => renderizarHub(container, ctx));
  }

  proximaConta();
}

// ---------------------------------------------------------------------

export function montar(container, ctx) {
  ctxAtual = ctx;
  renderizarHub(container, ctx);
}

export function desmontar() {
  limparIntervalos();
  ctxAtual?.tts?.pararFala?.();
  ctxAtual = null;
}
