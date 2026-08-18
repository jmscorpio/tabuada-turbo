// js/ui/pratica.js
// Loop de sessão (warm-up + bloco novo com IR), cronômetro discreto,
// feedback de acerto/erro sem punição, tela final com estrelas.

let intervaloCronometro = null;
let audioCtx = null;

function tocarSom(frequenciaHz, duracaoMs) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const ganho = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequenciaHz;
    ganho.gain.value = 0.08;
    osc.connect(ganho).connect(audioCtx.destination);
    osc.start();
    ganho.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracaoMs / 1000);
    osc.stop(audioCtx.currentTime + duracaoMs / 1000);
  } catch {
    // Web Audio indisponível — segue sem som, sem quebrar a prática.
  }
}

function formatarMMSS(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSeg / 60)).padStart(2, '0');
  const s = String(totalSeg % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function calcularEstrelas(tempoMedioMs, cfg) {
  if (tempoMedioMs > 0 && tempoMedioMs <= cfg.T_ESTRELA) return 3;
  if (tempoMedioMs > 0 && tempoMedioMs <= cfg.ESTRELA_2_MAX_MS) return 2;
  return 1; // nunca 0 — sem punição
}

function renderEstrelas(qtd) {
  return Array.from({ length: 3 }, (_, i) =>
    i < qtd
      ? '<span aria-hidden="true">⭐</span>'
      : '<span class="estrela--apagada" aria-hidden="true">⭐</span>'
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

export function montar(container, ctx) {
  container.innerHTML = '';
  intervaloCronometro && clearInterval(intervaloCronometro);

  const prefs = ctx.getPrefs();
  const semanaAtual = prefs.semanaAtual;

  let fatosState = ctx.getFatosState();
  const filtro = prefs.filtroPraticar;
  if (filtro) {
    ctx.salvarPrefs({ filtroPraticar: null }); // usa uma vez só
  }
  const fatosParaSessao = filtro
    ? fatosState.filter((f) => f.a === filtro || f.b === filtro)
    : fatosState;

  let sessionState = ctx.session.criarSessao({
    fatosState: fatosParaSessao.length > 0 ? fatosParaSessao : fatosState,
    agora: Date.now(),
    semanaAtual,
    rng: Math.random,
  });
  // Evita envio duplicado (Enter + toque no ✓, ou dois Enters rápidos)
  // enquanto a próxima pergunta ainda não foi montada.
  let processando = false;

  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <div class="tela-cabecalho">
      <button class="botao-voltar" type="button" aria-label="Voltar ao início">←</button>
      <h1 class="tela-titulo">Praticar</h1>
    </div>
    <div class="cronometro-discreto" data-el="cronometro">00:00</div>
    <div class="barra-progresso" style="margin-bottom:8px;">
      <div class="barra-progresso__preenchimento" data-el="barra" style="width:0%"></div>
    </div>
    <div data-el="conteudo"></div>
  `;
  container.appendChild(raiz);

  raiz.querySelector('.botao-voltar').addEventListener('click', () => ctx.navegarPara('/'));

  const elCronometro = raiz.querySelector('[data-el="cronometro"]');
  const elBarra = raiz.querySelector('[data-el="barra"]');
  const elConteudo = raiz.querySelector('[data-el="conteudo"]');

  intervaloCronometro = setInterval(() => {
    elCronometro.textContent = formatarMMSS(Date.now() - sessionState.inicioSessao);
  }, 1000);

  function atualizarBarra() {
    const pct =
      sessionState.fila.length > 0
        ? Math.min(100, Math.round((sessionState.indiceAtual / sessionState.fila.length) * 100))
        : 0;
    elBarra.style.width = `${pct}%`;
  }

  async function registrarNoScheduler(chave, correto, tempoMs) {
    const atualizado = await ctx.analytics.registrarResposta(
      { chave, correto, tempoMs, modo: 'pratica' },
      Date.now()
    );
    ctx.atualizarFatoEmCache(atualizado);
    fatosState = ctx.getFatosState();
  }

  async function concluirSessao() {
    clearInterval(intervaloCronometro);
    const resumo = ctx.session.calcularResumoSessao(sessionState, { fatosState, semanaAtual });
    const estrelas = calcularEstrelas(resumo.tempoMedioMs, ctx.config);

    const deltas = await ctx.analytics.registrarSessaoConcluida(resumo, ctx.getPrefs(), Date.now());
    ctx.salvarPrefs({
      streakDias: deltas.streakDias,
      ultimaDataAcesso: deltas.ultimaDataAcesso,
      semanaAtual: deltas.semanaAtual,
    });

    elConteudo.innerHTML = `
      <div class="pergunta-card">
        <p style="font-size:2.4rem;">🎉</p>
        <h2 class="tela-titulo">Muito bem!</h2>
        <div class="estrelas">${renderEstrelas(estrelas)}</div>
        <p>${resumo.acertos} de ${resumo.totalFatos} certas${deltas.avancouSemana ? ' — e você avançou de semana! 🎊' : ''}</p>
        <div class="linha-acoes">
          <button class="botao" type="button" data-acao="jogar">Jogar agora 🎮</button>
          <button class="botao botao--secundario" type="button" data-acao="inicio">Início</button>
        </div>
      </div>
    `;
    elConteudo.querySelector('[data-acao="jogar"]').addEventListener('click', () => ctx.navegarPara('/jogar'));
    elConteudo.querySelector('[data-acao="inicio"]').addEventListener('click', () => ctx.navegarPara('/'));
  }

  function renderPergunta() {
    atualizarBarra();

    if (sessionState.fatoAtual === null) {
      sessionState = ctx.session.avancarFase(sessionState, fatosState, Date.now(), {
        semanaAtual,
        rng: Math.random,
      });
      if (sessionState.fase === 'concluida') {
        concluirSessao();
        return;
      }
      renderPergunta();
      return;
    }

    const { a, b, ordemInvertida } = sessionState.fatoAtual;
    const primeiro = ordemInvertida ? b : a;
    const segundo = ordemInvertida ? a : b;
    const rotuloFase = sessionState.fase === 'warmup' ? 'Aquecimento' : 'Fatos novos';

    elConteudo.innerHTML = `
      <p style="text-align:center; color:var(--cor-texto-suave); font-weight:700; margin:0 0 6px;">${rotuloFase}</p>
      <div class="pergunta-card" data-el="card">
        <p class="pergunta-conta">${primeiro} × ${segundo}</p>
        <input
          class="input-resposta"
          type="text"
          inputmode="none"
          pattern="[0-9]*"
          aria-label="Digite a resposta"
          data-el="input"
        />
        <p class="feedback-mensagem" data-el="feedback" aria-live="polite"></p>
        <div data-el="teclado"></div>
      </div>
    `;

    const input = elConteudo.querySelector('[data-el="input"]');
    const feedback = elConteudo.querySelector('[data-el="feedback"]');
    const card = elConteudo.querySelector('[data-el="card"]');
    input.focus();
    processando = false;

    function confirmar() {
      if (processando) return;
      const valor = input.value.trim();
      if (valor === '') {
        input.focus();
        return;
      }
      processando = true;
      processarResposta(Number(valor), { input, feedback, card });
    }

    input.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') confirmar();
    });

    renderTecladoNumerico(elConteudo.querySelector('[data-el="teclado"]'), input, confirmar);
  }

  function processarResposta(valor, { input, feedback, card }) {
    if (!sessionState.fatoAtual) return; // defesa extra contra corrida de envio duplicado
    const chaveAtual = sessionState.fatoAtual.chave;
    const agora = Date.now();
    const r = ctx.session.avaliarResposta(sessionState, valor, fatosState, agora, Math.random);
    sessionState = r.novoEstado;
    input.value = '';

    if (r.acao === 'proximo') {
      if (r.tempoMs !== null) {
        registrarNoScheduler(chaveAtual, true, r.tempoMs);
      }
      feedback.textContent = 'Certinho! ✅';
      feedback.className = 'feedback-mensagem feedback-mensagem--sucesso';
      card.classList.add('pergunta-card--acertou');
      tocarSom(880, 150);
      setTimeout(renderPergunta, 350);
      return;
    }

    if (r.acao === 'erro') {
      registrarNoScheduler(chaveAtual, false, r.tempoMs);
      const respostaCerta = sessionState.fatoAtual.a * sessionState.fatoAtual.b;
      feedback.textContent = `Quase! A resposta é ${respostaCerta}. Digite ela pra gente guardar:`;
      feedback.className = 'feedback-mensagem feedback-mensagem--erro';
      processando = false;
      input.focus();
      return;
    }

    if (r.acao === 'repetirCorrecao') {
      processando = false;
      const respostaCerta = sessionState.fatoAtual.a * sessionState.fatoAtual.b;
      feedback.textContent = `Tenta de novo, digite ${respostaCerta}:`;
      feedback.className = 'feedback-mensagem feedback-mensagem--erro';
      input.focus();
    }
  }

  renderPergunta();
}

export function desmontar() {
  if (intervaloCronometro) {
    clearInterval(intervaloCronometro);
    intervaloCronometro = null;
  }
}
