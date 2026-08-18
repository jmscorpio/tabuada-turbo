// js/ui/home.js
// Tela inicial: 4 cards grandes (Praticar/Jogar/Conhecer/Entender), streak
// de dias consecutivos (aviso amigável se quebrar, nunca culpando) e um
// botão discreto 🔒 para o modo dos pais.

function dataISOLocal(timestampMs) {
  const d = new Date(timestampMs);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function mensagemStreak(prefs) {
  const hoje = dataISOLocal(Date.now());
  const ontem = dataISOLocal(Date.now() - 86400000);

  if (prefs.streakDias <= 0) {
    return { texto: 'Comece hoje sua sequência de dias praticando! 🚀', aviso: false };
  }

  const praticouHojeOuOntem =
    prefs.ultimaDataAcesso === hoje || prefs.ultimaDataAcesso === ontem;

  if (!praticouHojeOuOntem) {
    return {
      texto: `Você chegou a ${prefs.streakDias} dia${prefs.streakDias === 1 ? '' : 's'} seguidos. Tudo bem ter pausado — bora começar uma nova sequência hoje? 💜`,
      aviso: true,
    };
  }

  return {
    texto: `🔥 ${prefs.streakDias} dia${prefs.streakDias === 1 ? '' : 's'} seguidos praticando!`,
    aviso: false,
  };
}

export function montar(container, ctx) {
  container.innerHTML = '';
  const prefs = ctx.getPrefs();
  const streak = mensagemStreak(prefs);

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="tela-cabecalho" style="justify-content: space-between;">
      <h1 class="tela-titulo">Tabuada Turbo</h1>
      <div class="linha-acoes">
        <button class="botao-icone" type="button" data-acao="tema" aria-label="Alternar tema claro/escuro">
          ${prefs.tema === 'escuro' ? '☀️' : '🌙'}
        </button>
        <button class="botao-icone" type="button" data-acao="responsavel" aria-label="Modo responsável">
          🔒
        </button>
      </div>
    </div>

    <div class="grade-cards">
      <button class="card-grande card-grande--praticar" type="button" data-rota="/praticar">
        <span class="card-grande__emoji" aria-hidden="true">✏️</span>
        Praticar
      </button>
      <button class="card-grande card-grande--jogar" type="button" data-rota="/jogar">
        <span class="card-grande__emoji" aria-hidden="true">🎮</span>
        Jogar
      </button>
      <button class="card-grande card-grande--conhecer" type="button" data-rota="/conhecer">
        <span class="card-grande__emoji" aria-hidden="true">📚</span>
        Conhecer
      </button>
      <button class="card-grande card-grande--entender" type="button" data-rota="/entender">
        <span class="card-grande__emoji" aria-hidden="true">💡</span>
        Entender
      </button>
      <button class="card-grande card-grande--dividir card-grande--full" type="button" data-rota="/dividir">
        <span class="card-grande__emoji" aria-hidden="true">➗</span>
        Dividir
      </button>
    </div>

    <div class="streak ${streak.aviso ? 'streak--aviso' : ''}">
      <span>${streak.texto}</span>
    </div>
  `;

  div.querySelectorAll('[data-rota]').forEach((botao) => {
    botao.addEventListener('click', () => ctx.navegarPara(botao.dataset.rota));
  });

  div.querySelector('[data-acao="responsavel"]').addEventListener('click', () => {
    ctx.navegarPara('/responsavel');
  });

  div.querySelector('[data-acao="tema"]').addEventListener('click', () => {
    const novoTema = ctx.getPrefs().tema === 'escuro' ? 'claro' : 'escuro';
    ctx.salvarPrefs({ tema: novoTema });
    montar(container, ctx); // re-renderiza com o ícone/tema atualizado
  });

  container.appendChild(div);
}

export function desmontar() {}
