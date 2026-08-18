// js/ui/dividir.js
// Divisão pelo Método das Estimativas: a criança retira do dividendo
// múltiplos do divisor que ela mesma escolhe, quantas vezes quiser, até o
// resto ficar menor que o divisor. SEM cronômetro, SEM meta de tempo — o
// objetivo é compreensão e raciocínio flexível, não velocidade.

let ctxAtual = null;
let overlayTabelaAtual = null;

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
      input.dispatchEvent(new Event('input'));
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

function renderEstrelasHtml(qtd) {
  return Array.from({ length: 3 }, (_, i) =>
    i < qtd ? '<span aria-hidden="true">⭐</span>' : '<span class="estrela--apagada" aria-hidden="true">⭐</span>'
  ).join('');
}

// ---------------------------------------------------------------------
// Tabela de Pitágoras — overlay de consulta livre (não gasta estrela, não
// registra nada). Anexada em document.body pra ficar por cima de qualquer
// re-render da tela de trás.
// ---------------------------------------------------------------------

const CORES_LINHA_TABELA = [
  '#fee2e2', '#ffedd5', '#fff4d6', '#fef9c3', '#dcfce7',
  '#dbeafe', '#e0e7ff', '#ede9fe', '#fae8ff', '#fce7f3',
];

function fecharTabelaPitagoras() {
  if (overlayTabelaAtual) {
    overlayTabelaAtual.remove();
    overlayTabelaAtual = null;
  }
}

function abrirTabelaPitagoras() {
  fecharTabelaPitagoras();

  let linhaSelecionada = null;
  let colunaSelecionada = null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-tabela';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Tabela de Pitágoras');

  const painel = document.createElement('div');
  painel.className = 'overlay-tabela__painel';
  painel.innerHTML = `
    <button class="overlay-tabela__fechar" type="button" aria-label="Fechar tabela">✕</button>
    <h2 class="overlay-tabela__titulo">📋 Tabela de Pitágoras</h2>
    <p style="text-align:center; color:var(--cor-texto-suave, #5b5468); font-size:0.85rem; margin:0;">
      Toque numa linha e numa coluna pra ver o cruzamento
    </p>
    <div class="tabela-pitagoras" data-el="grade" role="grid"></div>
  `;
  overlay.appendChild(painel);

  const grade = painel.querySelector('[data-el="grade"]');

  function criarCelulaValor(numero, cor, destacada) {
    const div = document.createElement('div');
    div.className = 'tabela-pitagoras__celula';
    if (destacada) div.classList.add('tabela-pitagoras__celula--destacada');
    div.style.background = cor;
    div.textContent = String(numero);
    return div;
  }

  function criarCabecalho(numero, eixo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabela-pitagoras__celula tabela-pitagoras__celula--cabecalho';
    const selecionada = eixo === 'linha' ? linhaSelecionada === numero : colunaSelecionada === numero;
    if (selecionada) btn.classList.add('tabela-pitagoras__celula--selecionada');
    btn.textContent = String(numero);
    btn.setAttribute('aria-label', `${eixo === 'linha' ? 'Linha' : 'Coluna'} ${numero}`);
    btn.addEventListener('click', () => {
      if (eixo === 'linha') linhaSelecionada = linhaSelecionada === numero ? null : numero;
      else colunaSelecionada = colunaSelecionada === numero ? null : numero;
      renderGrade();
    });
    return btn;
  }

  function renderGrade() {
    grade.innerHTML = '';
    const canto = document.createElement('div');
    canto.className = 'tabela-pitagoras__celula tabela-pitagoras__celula--canto';
    grade.appendChild(canto);
    for (let c = 1; c <= 10; c++) grade.appendChild(criarCabecalho(c, 'coluna'));
    for (let l = 1; l <= 10; l++) {
      grade.appendChild(criarCabecalho(l, 'linha'));
      for (let c = 1; c <= 10; c++) {
        const destacada = linhaSelecionada === l && colunaSelecionada === c;
        grade.appendChild(criarCelulaValor(l * c, CORES_LINHA_TABELA[l - 1], destacada));
      }
    }
  }

  renderGrade();

  function aoTeclaEsc(e) {
    if (e.key === 'Escape') fecharTabelaPitagoras();
  }
  painel.querySelector('.overlay-tabela__fechar').addEventListener('click', fecharTabelaPitagoras);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharTabelaPitagoras();
  });
  document.addEventListener('keydown', aoTeclaEsc, { once: true });

  document.body.appendChild(overlay);
  overlayTabelaAtual = overlay;
}

// ---------------------------------------------------------------------
// A "chave" da divisão
// ---------------------------------------------------------------------

/**
 * Monta as células da chave a partir do estado atual: cabeçalho
 * (dividendo | divisor), depois cada passo como duas linhas (subtração +
 * resto parcial), com o quociente só aparecendo na última linha de resto
 * depois que a fase de fechamento confirmar.
 */
function montarCelulasChave(problema, estadoConta, quocienteConfirmado) {
  const celulas = [
    { texto: String(problema.dividendo), coluna: 'esquerda', tipo: 'cabecalho' },
    { texto: String(problema.divisor), coluna: 'direita', tipo: 'cabecalho' },
  ];

  let restoAcumulado = problema.dividendo;
  const passos = estadoConta.passos;
  passos.forEach((passo, i) => {
    restoAcumulado -= passo.retirado;
    const ehUltimoPasso = i === passos.length - 1;
    const terminouAqui = ehUltimoPasso && restoAcumulado < problema.divisor;

    celulas.push({ texto: `− ${passo.retirado}`, coluna: 'esquerda', tipo: 'subtracao' });
    celulas.push({
      texto: `${passo.vezes}${terminouAqui ? '' : ' +'}`,
      coluna: 'direita',
      tipo: 'estimativa',
    });

    celulas.push({
      texto: String(restoAcumulado),
      coluna: 'esquerda',
      tipo: terminouAqui ? 'final' : 'resto',
    });
    celulas.push({
      texto: terminouAqui && quocienteConfirmado !== null ? String(quocienteConfirmado) : '',
      coluna: 'direita',
      tipo: terminouAqui ? 'final' : 'resto',
    });
  });

  return celulas;
}

function renderChave(elChave, problema, estadoConta, quocienteConfirmado) {
  const celulas = montarCelulasChave(problema, estadoConta, quocienteConfirmado);
  const ultimasDuasLinhas = celulas.slice(-4); // último par subtração+resto (ou só o cabeçalho, se ainda vazio)

  elChave.innerHTML = celulas
    .map((cel) => {
      const nova = ultimasDuasLinhas.includes(cel) ? ' chave-divisao__cel--nova' : '';
      return `<div class="chave-divisao__cel chave-divisao__cel--${cel.coluna} chave-divisao__cel--${cel.tipo}${nova}">${cel.texto}</div>`;
    })
    .join('');
}

// ---------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------

export async function montar(container, ctx) {
  ctxAtual = ctx;
  container.innerHTML = '';

  const prefs = ctx.getPrefs();
  let nivelAtual = prefs.nivelDivisao || ctx.config.DIV_NIVEL_INICIAL;
  const TOTAL = ctx.config.DIV_PROBLEMAS_POR_SESSAO;

  let indiceProblema = 0;
  const estrelasSessao = [];

  const vozOk = await ctx.tts.vozDisponivel();

  const raiz = document.createElement('div');
  raiz.appendChild(
    cabecalho('Dividir ➗', () => {
      ctx.tts.pararFala();
      fecharTabelaPitagoras();
      ctx.navegarPara('/');
    })
  );
  const areaJogo = document.createElement('div');
  raiz.appendChild(areaJogo);
  container.appendChild(raiz);

  function proximoProblema() {
    if (indiceProblema >= TOTAL) {
      finalizarSessao();
      return;
    }
    renderizarProblema();
  }

  function renderizarProblema() {
    const fatosState = ctx.getFatosState();
    const problema = ctx.divisao.gerarProblema({ nivel: nivelAtual, fatosState, rng: Math.random });
    let estadoConta = ctx.divisao.criarEstadoConta(problema.dividendo);
    let fechouDePrimeira = true;
    let tentouQuociente = false;
    let tentouResto = false;
    const inicio = Date.now();

    areaJogo.innerHTML = `
      <p style="text-align:center; font-weight:700; margin:0 0 4px;">Problema ${indiceProblema + 1} de ${TOTAL} — nível ${nivelAtual}</p>
      <div data-el="enunciado"></div>
      <div class="pergunta-card" data-el="card">
        <div class="chave-divisao" data-el="chave"></div>
        <p class="feedback-mensagem" data-el="feedback" aria-live="polite"></p>
        <div data-el="entrada"></div>
      </div>
      <div class="linha-acoes" style="justify-content:center; margin-top:12px;">
        <button class="botao botao--secundario" type="button" data-acao="tabela">📋 Tabela</button>
      </div>
    `;

    const elEnunciado = areaJogo.querySelector('[data-el="enunciado"]');
    const elChave = areaJogo.querySelector('[data-el="chave"]');
    const elFeedback = areaJogo.querySelector('[data-el="feedback"]');
    const elEntrada = areaJogo.querySelector('[data-el="entrada"]');

    areaJogo.querySelector('[data-acao="tabela"]').addEventListener('click', abrirTabelaPitagoras);

    if (problema.enunciado) {
      elEnunciado.innerHTML = `
        <div class="aviso-caixa" style="margin-bottom:12px; text-align:left; display:flex; gap:10px; align-items:flex-start;">
          <p style="margin:0; flex:1;">${problema.enunciado}</p>
          ${vozOk ? '<button class="botao-icone" type="button" data-acao="ouvir" aria-label="Ouvir o enunciado" style="flex-shrink:0;">🔊</button>' : ''}
        </div>
      `;
      if (vozOk) {
        elEnunciado.querySelector('[data-acao="ouvir"]').addEventListener('click', () => {
          ctx.tts.falar(problema.enunciado);
        });
        ctx.tts.falar(problema.enunciado);
      }
    }

    renderChave(elChave, problema, estadoConta, null);
    renderFaseEstimando();

    function renderFaseEstimando() {
      elFeedback.textContent = '';
      elEntrada.innerHTML = `
        <p style="margin:6px 0 2px; font-weight:700; text-align:center;">Quantas vezes você tira o ${problema.divisor}?</p>
        <input
          class="input-resposta"
          type="text"
          inputmode="none"
          pattern="[0-9]*"
          aria-label="Quantas vezes"
          data-el="input"
          style="max-width:180px; font-size:1.8rem;"
        />
        <p data-el="previa" style="min-height:1.4em; font-weight:700; color:var(--cor-texto-suave); text-align:center; margin:4px 0;"></p>
        <div data-el="teclado"></div>
      `;

      const input = elEntrada.querySelector('[data-el="input"]');
      const previa = elEntrada.querySelector('[data-el="previa"]');
      input.focus();

      input.addEventListener('input', () => {
        const v = Number(input.value);
        previa.textContent =
          input.value.trim() !== '' && v > 0 ? `${v} × ${problema.divisor} = ${v * problema.divisor}` : '';
      });

      let processando = false;
      function confirmar() {
        if (processando) return;
        if (input.value.trim() === '') {
          input.focus();
          return;
        }
        processando = true;
        const vezes = Number(input.value);
        const resultado = ctx.divisao.aplicarEstimativa(estadoConta, problema.divisor, vezes);

        if (!resultado.validacao.ok) {
          if (resultado.validacao.motivo === 'excede') {
            const retirado = vezes * problema.divisor;
            elFeedback.textContent = `Opa, ${vezes} × ${problema.divisor} = ${retirado} é mais do que os ${estadoConta.restoAtual} que restam — tenta um número menor!`;
          } else {
            elFeedback.textContent = 'Digite um número maior que zero.';
          }
          elFeedback.className = 'feedback-mensagem feedback-mensagem--atencao';
          input.value = '';
          previa.textContent = '';
          processando = false;
          input.focus();
          return;
        }

        estadoConta = resultado.estado;
        elFeedback.textContent = '';
        renderChave(elChave, problema, estadoConta, null);

        if (ctx.divisao.contaTerminada(estadoConta, problema.divisor)) {
          renderFaseFechamentoQuociente();
        } else {
          input.value = '';
          previa.textContent = '';
          processando = false;
          input.focus();
        }
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmar();
      });
      renderTecladoNumerico(elEntrada.querySelector('[data-el="teclado"]'), input, confirmar);
    }

    function renderFaseFechamentoQuociente() {
      elFeedback.textContent = 'A conta terminou! 🎉';
      elFeedback.className = 'feedback-mensagem feedback-mensagem--sucesso';
      elEntrada.innerHTML = `
        <p style="margin:6px 0 2px; font-weight:700; text-align:center;">Qual é o quociente total? (some as estimativas)</p>
        <input class="input-resposta" type="text" inputmode="none" pattern="[0-9]*" aria-label="Quociente total" data-el="input" style="max-width:180px; font-size:1.8rem;" />
        <div data-el="teclado"></div>
      `;
      const input = elEntrada.querySelector('[data-el="input"]');
      input.focus();
      let processando = false;

      function confirmar() {
        if (processando || input.value.trim() === '') {
          input.focus();
          return;
        }
        processando = true;
        const valor = Number(input.value);
        if (valor === problema.quociente) {
          if (problema.resto > 0) {
            renderFaseFechamentoResto();
          } else {
            concluirProblema();
          }
          return;
        }

        if (!tentouQuociente) {
          tentouQuociente = true;
          fechouDePrimeira = false;
        }
        const parcelas = estadoConta.passos.map((p) => p.vezes).join(' + ');
        elFeedback.textContent = `Confere: ${parcelas} = ?`;
        elFeedback.className = 'feedback-mensagem feedback-mensagem--erro';
        input.value = '';
        processando = false;
        input.focus();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmar();
      });
      renderTecladoNumerico(elEntrada.querySelector('[data-el="teclado"]'), input, confirmar);
    }

    function renderFaseFechamentoResto() {
      renderChave(elChave, problema, estadoConta, problema.quociente);
      elFeedback.textContent = '';
      elEntrada.innerHTML = `
        <p style="margin:6px 0 2px; font-weight:700; text-align:center;">E quanto sobrou (o resto)?</p>
        <input class="input-resposta" type="text" inputmode="none" pattern="[0-9]*" aria-label="Resto" data-el="input" style="max-width:180px; font-size:1.8rem;" />
        <div data-el="teclado"></div>
      `;
      const input = elEntrada.querySelector('[data-el="input"]');
      input.focus();
      let processando = false;

      function confirmar() {
        if (processando || input.value.trim() === '') {
          input.focus();
          return;
        }
        processando = true;
        const valor = Number(input.value);
        if (valor === problema.resto) {
          concluirProblema();
          return;
        }

        if (!tentouResto) {
          tentouResto = true;
          fechouDePrimeira = false;
        }
        elFeedback.textContent = 'Confere: olha o número que sobrou lá em cima na conta — quanto deu?';
        elFeedback.className = 'feedback-mensagem feedback-mensagem--erro';
        input.value = '';
        processando = false;
        input.focus();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmar();
      });
      renderTecladoNumerico(elEntrada.querySelector('[data-el="teclado"]'), input, confirmar);
    }

    async function concluirProblema() {
      renderChave(elChave, problema, estadoConta, problema.quociente);

      const passosUsados = estadoConta.passos.length;
      const par = ctx.divisao.parDePassos(problema.quociente);
      const estrelas = ctx.divisao.calcularEstrelasDivisao(passosUsados, problema.quociente);
      const duracaoMs = Date.now() - inicio;

      const registro = {
        timestamp: Date.now(),
        dividendo: problema.dividendo,
        divisor: problema.divisor,
        quociente: problema.quociente,
        resto: problema.resto,
        passos: passosUsados,
        par,
        estrelas,
        fechouDePrimeira,
        nivel: nivelAtual,
        enunciado: problema.enunciado,
        duracaoMs,
      };
      await ctx.db.addDivisao(registro);
      estrelasSessao.push(estrelas);

      let subiuNivel = false;
      const todasDivisoes = await ctx.db.getTodasDivisoes();
      const avanca = ctx.divisao.deveAvancarNivel(
        todasDivisoes.map((d) => ({ nivel: d.nivel, fechouDePrimeira: d.fechouDePrimeira })),
        nivelAtual
      );
      if (avanca) {
        nivelAtual = Math.min(nivelAtual + 1, ctx.config.DIV_NIVEL_MAX);
        ctx.salvarPrefs({ nivelDivisao: nivelAtual });
        subiuNivel = true;
      }

      const incentivo =
        passosUsados > par
          ? '<p>Da próxima, tenta tirar uma quantidade maior de uma vez — chega mais rápido! 💪</p>'
          : '';
      const linhaResto = problema.resto > 0 ? `<p>Sobraram ${problema.resto}!</p>` : '';

      elEntrada.innerHTML = '';
      elFeedback.textContent = '';
      areaJogo.querySelector('[data-el="card"]').innerHTML = `
        <p style="font-size:2.2rem; margin:0;">🎉</p>
        <h2 class="tela-titulo" style="font-size:1.2rem;">Você resolveu em ${passosUsados} passo${passosUsados === 1 ? '' : 's'}!</h2>
        <div class="estrelas">${renderEstrelasHtml(estrelas)}</div>
        ${linhaResto}
        ${incentivo}
        ${subiuNivel ? '<p><strong>🎊 Você subiu de nível!</strong></p>' : ''}
        <button class="botao botao--bloco" type="button" data-acao="continuar">Continuar</button>
      `;
      areaJogo.querySelector('[data-acao="continuar"]').addEventListener('click', () => {
        indiceProblema++;
        proximoProblema();
      });
    }
  }

  async function finalizarSessao() {
    const prefsAtuais = ctx.getPrefs();
    const streak = ctx.analytics.calcularStreak(prefsAtuais, Date.now());
    ctx.salvarPrefs({ streakDias: streak.streakDias, ultimaDataAcesso: streak.ultimaDataAcesso });

    const estrelaMedia =
      estrelasSessao.length > 0
        ? Math.round(estrelasSessao.reduce((soma, e) => soma + e, 0) / estrelasSessao.length)
        : 3;

    areaJogo.innerHTML = `
      <div class="pergunta-card">
        <p style="font-size:2.4rem;">🏁</p>
        <h2 class="tela-titulo">Muito bem!</h2>
        <div class="estrelas">${renderEstrelasHtml(estrelaMedia)}</div>
        <p>Você resolveu ${TOTAL} problemas de divisão!</p>
        <div class="linha-acoes">
          <button class="botao" type="button" data-acao="repetir">Resolver mais 5</button>
          <button class="botao botao--secundario" type="button" data-acao="inicio">Início</button>
        </div>
      </div>
    `;
    areaJogo.querySelector('[data-acao="repetir"]').addEventListener('click', () => montar(container, ctx));
    areaJogo.querySelector('[data-acao="inicio"]').addEventListener('click', () => ctx.navegarPara('/'));
  }

  proximoProblema();
}

export function desmontar() {
  fecharTabelaPitagoras();
  ctxAtual?.tts?.pararFala?.();
  ctxAtual = null;
}
