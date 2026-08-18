// js/session.js
// Loop diário de sessão — máquina de estados pura (sem I/O, sem DOM, sem
// relógio direto: `agora`/`rng` sempre injetados). Compõe com scheduler.js
// (também puro) para montar as filas de fatos.

import { WARMUP_MIN_FATOS, WARMUP_MAX_FATOS, MAX_NOVOS_POR_SESSAO, T_META } from './config.js';
import { getNextFacts } from './scheduler.js';

function buscarFato(fatosState, chave) {
  const fato = fatosState.find((f) => f.chave === chave);
  if (!fato) throw new Error(`fato não encontrado no estado: ${chave}`);
  return fato;
}

function montarFatoAtual(fatosState, chave, rng) {
  const fato = buscarFato(fatosState, chave);
  return {
    chave: fato.chave,
    a: fato.a,
    b: fato.b,
    ordemInvertida: rng() < 0.5,
  };
}

/**
 * Posiciona a sessão no item `indiceAtual` da fila, montando `fatoAtual`.
 * Se a fila já foi consumida, `fatoAtual` fica `null` (sinal para o chamador
 * invocar `avancarFase`).
 */
export function proximaPergunta(sessionState, fatosState, rng = Math.random, agora = Date.now()) {
  if (sessionState.indiceAtual >= sessionState.fila.length) {
    return { ...sessionState, fatoAtual: null };
  }
  const chave = sessionState.fila[sessionState.indiceAtual];
  return {
    ...sessionState,
    fatoAtual: montarFatoAtual(fatosState, chave, rng),
    tentativasFatoAtual: 0,
    inicioFatoAtual: agora,
    corrigindoErro: false,
  };
}

/**
 * Cria a sessão do dia: fase 'warmup' com 8–10 fatos de revisão (sem fatos
 * novos — IR do bloco novo acontece só na fase 'novo', via avancarFase).
 */
export function criarSessao({ fatosState, agora, semanaAtual, rng = Math.random }) {
  const tamanhoWarmup =
    WARMUP_MIN_FATOS + Math.floor(rng() * (WARMUP_MAX_FATOS - WARMUP_MIN_FATOS + 1));
  const fila = getNextFacts(fatosState, {
    agora,
    limit: tamanhoWarmup,
    semanaAtual,
    maxNovosPorSessao: 0,
    rng,
  });

  const inicial = {
    fase: 'warmup',
    fila,
    indiceAtual: 0,
    fatoAtual: null,
    tentativasFatoAtual: 0,
    inicioFatoAtual: null,
    corrigindoErro: false,
    resultados: [],
    inicioSessao: agora,
    fimSessao: null,
  };

  return proximaPergunta(inicial, fatosState, rng, agora);
}

/**
 * Avalia uma resposta digitada. Duas situações:
 *
 * 1. Fluxo normal (corrigindoErro === false):
 *    - correto → acao 'proximo': avança a fila e registra o resultado,
 *      não importa a velocidade. O tempo de resposta (tempoMs) segue
 *      influenciando o halfLife no scheduler (respostas rápidas fazem o
 *      fato "amadurecer" mais rápido) — só não existe mais repetição de
 *      pergunta na tela por causa da velocidade, pra não gerar irritação.
 *    - errado → acao 'erro': registra o resultado (uma única vez, correto
 *      false) e entra em modo de correção (sem punição, sem "vidas").
 *
 * 2. Modo de correção (corrigindoErro === true, após um erro): a criança
 *    apenas redigita a resposta mostrada na tela. Isso NÃO é cronometrado
 *    nem gera um novo evento de resposta (não duplica o registro no
 *    scheduler) — só avança a fila quando acertar a cópia.
 *
 * @returns {{correto:boolean, tempoMs:number|null, acao:'proximo'|'erro'|'repetirCorrecao', novoEstado:object}}
 */
export function avaliarResposta(sessionState, respostaNumerica, fatosState, agora, rng = Math.random) {
  const { fatoAtual } = sessionState;
  if (!fatoAtual) throw new Error('avaliarResposta chamado sem fatoAtual ativo');

  const respostaCerta = fatoAtual.a * fatoAtual.b;
  const acertouValor = Number(respostaNumerica) === respostaCerta;

  if (sessionState.corrigindoErro) {
    if (acertouValor) {
      const avancado = avancarIndice(sessionState);
      const novoEstado = proximaPergunta(avancado, fatosState, rng, agora);
      return { correto: true, tempoMs: null, acao: 'proximo', novoEstado };
    }
    return {
      correto: false,
      tempoMs: null,
      acao: 'repetirCorrecao',
      novoEstado: { ...sessionState, tentativasFatoAtual: sessionState.tentativasFatoAtual + 1 },
    };
  }

  const tempoMs = agora - sessionState.inicioFatoAtual;

  if (acertouValor) {
    const resultados = [
      ...sessionState.resultados,
      { chave: fatoAtual.chave, correto: true, tempoMs },
    ];
    const avancado = avancarIndice({ ...sessionState, resultados });
    const novoEstado = proximaPergunta(avancado, fatosState, rng, agora);
    return { correto: true, tempoMs, acao: 'proximo', novoEstado };
  }

  // errou
  const resultados = [...sessionState.resultados, { chave: fatoAtual.chave, correto: false, tempoMs }];
  const novoEstado = { ...sessionState, resultados, corrigindoErro: true };
  return { correto: false, tempoMs, acao: 'erro', novoEstado };
}

function avancarIndice(sessionState) {
  return { ...sessionState, indiceAtual: sessionState.indiceAtual + 1 };
}

/**
 * Transiciona a sessão quando a fila da fase atual se esgota (fatoAtual
 * null): 'warmup' → 'novo' (monta fila do bloco novo com IR); 'novo' →
 * 'concluida' (calcula o resumo final).
 */
export function avancarFase(sessionState, fatosState, agora, { semanaAtual, rng = Math.random } = {}) {
  if (sessionState.fatoAtual !== null) return sessionState; // fila atual ainda não terminou

  if (sessionState.fase === 'warmup') {
    const fila = getNextFacts(fatosState, {
      agora,
      limit: 10,
      semanaAtual,
      maxNovosPorSessao: MAX_NOVOS_POR_SESSAO,
      rng,
    });
    const proxima = {
      ...sessionState,
      fase: 'novo',
      fila,
      indiceAtual: 0,
    };
    return proximaPergunta(proxima, fatosState, rng, agora);
  }

  if (sessionState.fase === 'novo') {
    return { ...sessionState, fase: 'concluida', fimSessao: agora };
  }

  return sessionState;
}

/**
 * Resumo da sessão a partir dos resultados acumulados.
 * Com `fatosState` + `semanaAtual`, acertoSemanaPct é calculado só sobre os
 * resultados de fatos da semana atual (critério do SPEC para o avanço de
 * semana). Se a sessão não tocou nenhum fato da semana atual (ex.: semana 6,
 * de integração) — ou sem os parâmetros — cai no percentual geral da sessão.
 */
export function calcularResumoSessao(sessionState, { fatosState = null, semanaAtual = null } = {}) {
  const { resultados } = sessionState;
  const totalFatos = resultados.length;
  const acertos = resultados.filter((r) => r.correto).length;
  const erros = totalFatos - acertos;
  const temposValidos = resultados.filter((r) => r.correto).map((r) => r.tempoMs);
  const tempoMedioMs =
    temposValidos.length > 0
      ? temposValidos.reduce((soma, t) => soma + t, 0) / temposValidos.length
      : 0;

  let acertoSemanaPct = totalFatos > 0 ? acertos / totalFatos : 0;
  if (fatosState && semanaAtual !== null) {
    const chavesDaSemana = new Set(
      fatosState.filter((f) => f.semanaSugerida === semanaAtual).map((f) => f.chave)
    );
    const daSemana = resultados.filter((r) => chavesDaSemana.has(r.chave));
    if (daSemana.length > 0) {
      acertoSemanaPct = daSemana.filter((r) => r.correto).length / daSemana.length;
    }
  }

  return { totalFatos, acertos, erros, tempoMedioMs, acertoSemanaPct };
}
