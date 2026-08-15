// js/app.js
// Estado global do app + roteador de views por hash. Única porta de
// entrada para localStorage (chave `tt_prefs_v1`). Cada view em js/ui/*.js
// recebe um `ctx` com acesso a db/scheduler/session/analytics/tts em vez de
// importar esses módulos diretamente — mantém app.js como fonte única da
// verdade do estado em memória.

import * as db from './db.js';
import * as scheduler from './scheduler.js';
import * as session from './session.js';
import * as analytics from './analytics.js';
import * as tts from './tts.js';
import * as config from './config.js';
import { TABUADAS_CONHECIDAS_DEFAULT, SEMANA_INICIAL } from './config.js';

const CHAVE_PREFS = 'tt_prefs_v1';

const ROTAS = {
  '': 'home',
  '/': 'home',
  '/praticar': 'pratica',
  '/jogar': 'jogo',
  '/conhecer': 'conhecer',
  '/entender': 'entender',
  '/responsavel': 'responsavel',
};

function prefsPadrao() {
  return {
    tema: 'claro',
    ultimoModo: 'home',
    tabuadasConhecidas: [...TABUADAS_CONHECIDAS_DEFAULT],
    semanaAtual: SEMANA_INICIAL,
    pausaAteTimestamp: null,
    streakDias: 0,
    ultimaDataAcesso: null,
    filtroPraticar: null,
    vozPreferidaURI: null,
  };
}

function carregarPrefs() {
  try {
    const bruto = localStorage.getItem(CHAVE_PREFS);
    if (!bruto) return prefsPadrao();
    const salvo = JSON.parse(bruto);
    return { ...prefsPadrao(), ...salvo };
  } catch {
    return prefsPadrao();
  }
}

function persistirPrefs(prefs) {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem persistir
  }
}

function aplicarTemaNoDocumento(tema) {
  document.documentElement.setAttribute('data-tema', tema === 'escuro' ? 'escuro' : 'claro');
}

function dataISOLocal(timestampMs) {
  const d = new Date(timestampMs);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

const estadoApp = {
  prefs: prefsPadrao(),
  tabuadasJson: null,
  fatosCache: [],
  viewAtual: null,
  viewAtualModulo: null,
};

function getPrefs() {
  return estadoApp.prefs;
}

function salvarPrefs(parcial) {
  estadoApp.prefs = { ...estadoApp.prefs, ...parcial };
  persistirPrefs(estadoApp.prefs);
  if (parcial.tema) aplicarTemaNoDocumento(estadoApp.prefs.tema);
  if ('vozPreferidaURI' in parcial) tts.definirVozPreferida(estadoApp.prefs.vozPreferidaURI);
  return estadoApp.prefs;
}

function getFatosState() {
  return estadoApp.fatosCache;
}

function atualizarFatoEmCache(fatoAtualizado) {
  const idx = estadoApp.fatosCache.findIndex((f) => f.chave === fatoAtualizado.chave);
  if (idx >= 0) {
    estadoApp.fatosCache = [
      ...estadoApp.fatosCache.slice(0, idx),
      fatoAtualizado,
      ...estadoApp.fatosCache.slice(idx + 1),
    ];
  } else {
    estadoApp.fatosCache = [...estadoApp.fatosCache, fatoAtualizado];
  }
}

async function recarregarFatosCache() {
  estadoApp.fatosCache = await db.getTodosFatos();
  return estadoApp.fatosCache;
}

/** Garante que os 55 fatos existam no IndexedDB, semeando os que faltarem. */
async function hidratarFatosNoBanco(tabuadasJson, conhecidas) {
  const existentes = await db.getTodosFatos();
  const chavesExistentes = new Set(existentes.map((f) => f.chave));
  const faltantes = tabuadasJson.fatos.filter((f) => !chavesExistentes.has(f.chave));

  for (const fatoJson of faltantes) {
    const novo = scheduler.criarFatoInicial(fatoJson, { conhecidas, agora: Date.now() });
    await db.putFato(novo);
  }

  return db.getTodosFatos();
}

function montarCtx() {
  return {
    db,
    scheduler,
    session,
    analytics,
    tts,
    config,
    getPrefs,
    salvarPrefs,
    getFatosState,
    atualizarFatoEmCache,
    recarregarFatosCache,
    getTabuadasJson: () => estadoApp.tabuadasJson,
    navegarPara,
  };
}

function rotaAtual() {
  const caminho = location.hash.replace(/^#/, '');
  return ROTAS[caminho] || 'home';
}

export function navegarPara(rota) {
  if (location.hash === `#${rota}`) {
    renderizar();
  } else {
    location.hash = rota;
  }
}

async function renderizar() {
  const container = document.getElementById('app');
  if (!container) return;

  const nomeView = rotaAtual();

  // Pausa dos pais: bloqueia tudo, exceto o próprio painel dos pais (para
  // poderem desfazer a pausa).
  const pausaAtiva =
    estadoApp.prefs.pausaAteTimestamp && estadoApp.prefs.pausaAteTimestamp > Date.now();
  if (pausaAtiva && nomeView !== 'responsavel') {
    if (estadoApp.viewAtualModulo?.desmontar) estadoApp.viewAtualModulo.desmontar();
    container.innerHTML = '';
    renderizarTelaPausa(container);
    estadoApp.viewAtualModulo = null;
    return;
  }

  if (estadoApp.viewAtualModulo?.desmontar) {
    try {
      estadoApp.viewAtualModulo.desmontar();
    } catch {
      // segue mesmo se a view não limpar direito
    }
  }

  container.innerHTML = '';
  salvarPrefs({ ultimoModo: nomeView });

  try {
    const modulo = await import(`./ui/${nomeView}.js`);
    estadoApp.viewAtualModulo = modulo;
    estadoApp.viewAtual = nomeView;
    await modulo.montar(container, montarCtx());
  } catch (erro) {
    console.error('Erro ao montar a tela', nomeView, erro);
    container.innerHTML =
      '<p class="aviso-caixa">Ops! Não consegui abrir esta tela. Tente voltar para o início.</p>';
  }
}

function renderizarTelaPausa(container) {
  const restanteMs = estadoApp.prefs.pausaAteTimestamp - Date.now();
  const minutos = Math.max(1, Math.round(restanteMs / 60000));
  const div = document.createElement('div');
  div.className = 'dialogo-pin';
  div.innerHTML = `
    <p style="font-size:2.5rem">⏸️</p>
    <h1 class="tela-titulo">Pausa combinada</h1>
    <p>O app volta a liberar a prática em cerca de ${minutos} minuto${minutos === 1 ? '' : 's'}.</p>
    <button class="botao botao--secundario" type="button" data-acao="responsavel">Sou responsável 🔒</button>
  `;
  div.querySelector('[data-acao="responsavel"]').addEventListener('click', () => {
    navegarPara('/responsavel');
  });
  container.appendChild(div);
}

export async function iniciar() {
  estadoApp.prefs = carregarPrefs();
  aplicarTemaNoDocumento(estadoApp.prefs.tema);
  tts.definirVozPreferida(estadoApp.prefs.vozPreferidaURI);

  const resposta = await fetch('./data/tabuadas.json');
  estadoApp.tabuadasJson = await resposta.json();

  await hidratarFatosNoBanco(estadoApp.tabuadasJson, estadoApp.prefs.tabuadasConhecidas);
  await recarregarFatosCache();

  window.addEventListener('hashchange', renderizar);

  if (!location.hash) {
    const hoje = dataISOLocal(Date.now());
    const primeiraAberturaDoDia = estadoApp.prefs.ultimaDataAcesso !== hoje;
    // Definir o hash dispara 'hashchange', que já chama renderizar().
    location.hash = primeiraAberturaDoDia ? '/praticar' : '/';
  } else {
    await renderizar();
  }
}
