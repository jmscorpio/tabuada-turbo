// js/scheduler.js
// Spaced repetition adaptativo + Incremental Rehearsal (IR) — lógica pura.
// Nenhuma função aqui faz I/O (sem fetch/fs/indexedDB) nem lê o relógio direto:
// `agora` e `rng` são sempre recebidos por parâmetro, o que torna tudo
// determinístico e testável em Node.

import {
  T_RAPIDO,
  T_META,
  HALFLIFE_INICIAL,
  HALFLIFE_CAP,
  HALFLIFE_MIN_ERRO,
  MS_POR_DIA,
  MATURO_HALFLIFE_MIN,
  MATURO_ULTIMAS_N,
  IR_ESPACAMENTO_MIN,
  IR_ESPACAMENTO_MAX,
  IR_REPETICOES_NOVO,
  MAX_NOVOS_POR_SESSAO,
  AVANCO_SEMANA_PCT,
  AVANCO_SEMANA_SESSOES,
  SEMANA_MAX,
  STATUS_VERMELHO_TAXA_ERRO,
  NUMEROS_FACEIS,
} from './config.js';

// Quantos fatos "problemáticos" (erro recorrente) ganham uma repetição
// extra dentro da mesma sessão — capado pra não inflar a fila (mesma lição
// aprendida com o IR: reforço demais vira maratona, não ajuda).
const REFORCO_MAX_FATOS_POR_SESSAO = 3;

/**
 * Embaralha uma cópia do array (Fisher-Yates). `rng` deve retornar em [0,1).
 * @param {any[]} array
 * @param {() => number} rng
 */
export function shuffle(array, rng = Math.random) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Cria o estado inicial de um fato a partir da entrada crua do JSON.
 * Se a tabuada de `a` ou `b` estiver em `conhecidas`, o fato nasce "maduro"
 * (seed), como pedido para a tabuada do 3 (halfLife = MATURO_HALFLIFE_MIN).
 * @param {{a:number,b:number,chave:string,trivial:boolean,semanaSugerida:number}} fatoJson
 * @param {{conhecidas?: number[], agora?: number}} opts
 */
export function criarFatoInicial(fatoJson, { conhecidas = [], agora = Date.now() } = {}) {
  const jaConhecido = conhecidas.includes(fatoJson.a) || conhecidas.includes(fatoJson.b);
  const halfLife = jaConhecido ? MATURO_HALFLIFE_MIN : HALFLIFE_INICIAL;
  return {
    chave: fatoJson.chave,
    a: fatoJson.a,
    b: fatoJson.b,
    trivial: !!fatoJson.trivial,
    semanaSugerida: fatoJson.semanaSugerida,
    halfLife,
    nextReview: jaConhecido ? agora : null,
    introduzido: jaConhecido,
    ultimasRespostas: [],
    totalAcertos: 0,
    totalErros: 0,
  };
}

/**
 * Aplica as 4 faixas de ajuste de meia-vida definidas no SPEC.
 * @param {number} halfLifeAtual dias
 * @param {boolean} correto
 * @param {number} tempoMs
 */
export function calcularNovoHalfLife(halfLifeAtual, correto, tempoMs) {
  let fator;
  if (!correto) {
    fator = 0.5;
  } else if (tempoMs <= T_RAPIDO) {
    fator = 2.0;
  } else if (tempoMs <= 5000) {
    fator = 1.4;
  } else {
    fator = 1.1;
  }
  const bruto = halfLifeAtual * fator;
  if (!correto) {
    return Math.max(HALFLIFE_MIN_ERRO, bruto);
  }
  return Math.min(HALFLIFE_CAP, bruto);
}

/**
 * Calcula o próximo timestamp de revisão.
 * Erro → amanhã (independente da meia-vida). Acerto → agora + halfLife dias.
 * @param {number} agora epoch ms
 * @param {number} halfLifeDias
 * @param {boolean} correto
 */
export function calcularNextReview(agora, halfLifeDias, correto) {
  if (!correto) {
    return agora + MS_POR_DIA;
  }
  return agora + halfLifeDias * MS_POR_DIA;
}

/**
 * Registra uma resposta e retorna um NOVO objeto de estado do fato (não muta
 * o original).
 * @param {object} fatoState
 * @param {{correto:boolean, tempoMs:number, agora:number}} resposta
 */
export function registrarResposta(fatoState, { correto, tempoMs, agora }) {
  const halfLife = calcularNovoHalfLife(fatoState.halfLife, correto, tempoMs);
  const nextReview = calcularNextReview(agora, halfLife, correto);
  const ultimasRespostas = [...fatoState.ultimasRespostas, { correto, tempoMs }].slice(
    -MATURO_ULTIMAS_N
  );
  return {
    ...fatoState,
    halfLife,
    nextReview,
    introduzido: true,
    ultimasRespostas,
    totalAcertos: fatoState.totalAcertos + (correto ? 1 : 0),
    totalErros: fatoState.totalErros + (correto ? 0 : 1),
  };
}

/**
 * Um fato é maduro quando:
 * - trivial (tabuada 1 ou 10): basta 1 acerto já registrado;
 * - seed sem histórico (ex.: tabuada 3): halfLife >= MATURO_HALFLIFE_MIN já
 *   é suficiente (é assim que a maturidade inicial é reconhecida antes de
 *   qualquer resposta real);
 * - caso geral: halfLife >= MATURO_HALFLIFE_MIN E as últimas
 *   MATURO_ULTIMAS_N respostas foram corretas com tempo <= T_META.
 * @param {object} fatoState
 */
export function isFatoMaduro(fatoState) {
  if (!fatoState.introduzido) return false;

  if (fatoState.trivial) {
    return fatoState.totalAcertos >= 1;
  }

  if (fatoState.ultimasRespostas.length === 0) {
    return fatoState.halfLife >= MATURO_HALFLIFE_MIN;
  }

  if (fatoState.halfLife < MATURO_HALFLIFE_MIN) return false;
  if (fatoState.ultimasRespostas.length < MATURO_ULTIMAS_N) return false;

  const ultimasN = fatoState.ultimasRespostas.slice(-MATURO_ULTIMAS_N);
  return ultimasN.every((r) => r.correto && r.tempoMs <= T_META);
}

/**
 * Um fato é "problemático" quando tem erro recorrente nas respostas mais
 * recentes (mesmo critério do status "vermelho" do painel dos pais).
 * Usado por getNextFacts para dar prioridade e reforço extra a esses fatos
 * dentro da própria sessão — sem punição, só mais oportunidade de praticar.
 * @param {object} fatoState
 * @param {number} [limiar] taxa de erro acima da qual o fato é considerado problemático
 */
export function isFatoProblematico(fatoState, limiar = STATUS_VERMELHO_TAXA_ERRO) {
  if (!fatoState.introduzido) return false;
  const respostas = fatoState.ultimasRespostas || [];
  if (respostas.length === 0) return false;
  const erros = respostas.filter((r) => !r.correto).length;
  return erros / respostas.length > limiar;
}

/**
 * Um fato é "fácil" quando os DOIS operandos estão na lista de números
 * fáceis (padrão: 1, 2, 3, 10) — usado por getNextFacts pra dar prioridade
 * mais baixa a esses fatos na fila de revisão (foco em treinar os números
 * complexos). Um fato com só um operando fácil (ex.: 7×2) continua tratado
 * como difícil, porque o número complexo (7) ainda precisa de prática.
 * @param {object} fatoState
 * @param {number[]} [numerosFaceis]
 */
export function isFatoFacil(fatoState, numerosFaceis = NUMEROS_FACEIS) {
  return numerosFaceis.includes(fatoState.a) && numerosFaceis.includes(fatoState.b);
}

/**
 * Fatos já introduzidos cuja revisão está vencida (nextReview <= agora),
 * ordenados do mais atrasado para o menos atrasado.
 * @param {object[]} fatosState
 * @param {number} agora
 */
export function getFatosParaRevisao(fatosState, agora) {
  return fatosState
    .filter((f) => f.introduzido && f.nextReview !== null && f.nextReview <= agora)
    .sort((x, y) => x.nextReview - y.nextReview);
}

/**
 * Fatos ainda não introduzidos cuja semana sugerida já chegou.
 * semanaSugerida === 0 (seed, ex.: tabuada 3) nunca aparece aqui — já nasce
 * introduzido em criarFatoInicial.
 * @param {object[]} fatosState
 * @param {number} semanaAtual
 */
export function getFatosNovosDisponiveis(fatosState, semanaAtual) {
  return fatosState.filter(
    (f) => !f.introduzido && f.semanaSugerida > 0 && f.semanaSugerida <= semanaAtual
  );
}

/**
 * Incremental Rehearsal: intercala `chaveNovo` dentro de `filaBase`,
 * reaparecendo IR_REPETICOES_NOVO vezes adicionais, cada uma separada por
 * IR_ESPACAMENTO_MIN..IR_ESPACAMENTO_MAX fatos conhecidos.
 * @param {string[]} filaBase fila já existente (chaves)
 * @param {string} chaveNovo
 * @param {string[]} chavesConhecidas pool de fatos maduros para preencher os gaps
 * @param {{repeticoes?:number, espMin?:number, espMax?:number, rng?:()=>number}} opts
 */
export function intercalarIR(
  filaBase,
  chaveNovo,
  chavesConhecidas,
  {
    repeticoes = IR_REPETICOES_NOVO,
    espMin = IR_ESPACAMENTO_MIN,
    espMax = IR_ESPACAMENTO_MAX,
    rng = Math.random,
  } = {}
) {
  const poolFonte = chavesConhecidas.filter((k) => k !== chaveNovo);
  const pool = shuffle(poolFonte, rng);
  const segmento = [chaveNovo];

  if (pool.length === 0) {
    // Sem conhecidos para intercalar (ex.: início absoluto do app) — o fato
    // novo apenas se repete, sem gap, para não quebrar o IR.
    for (let i = 0; i < repeticoes; i++) segmento.push(chaveNovo);
    return [...filaBase, ...segmento];
  }

  let idx = 0;
  for (let i = 0; i < repeticoes; i++) {
    const gap = espMin + Math.floor(rng() * (espMax - espMin + 1));
    for (let g = 0; g < gap; g++) {
      segmento.push(pool[idx % pool.length]);
      idx++;
    }
    segmento.push(chaveNovo);
  }

  return [...filaBase, ...segmento];
}

/**
 * Como intercalarIR, mas para VÁRIOS fatos novos ao mesmo tempo: eles
 * compartilham as rodadas de intercalação (cada rodada apresenta todos os
 * novos uma vez, seguida de um único gap de 7–8 conhecidos) em vez de cada
 * um ganhar seu próprio trem de repetições empilhado — isso evita que
 * MAX_NOVOS_POR_SESSAO novos infle o bloco para dezenas de perguntas.
 * @param {string[]} filaBase
 * @param {string[]} chavesNovas
 * @param {string[]} chavesConhecidas
 * @param {{repeticoes?:number, espMin?:number, espMax?:number, rng?:()=>number}} opts
 */
export function intercalarVariosIR(
  filaBase,
  chavesNovas,
  chavesConhecidas,
  {
    repeticoes = IR_REPETICOES_NOVO,
    espMin = IR_ESPACAMENTO_MIN,
    espMax = IR_ESPACAMENTO_MAX,
    rng = Math.random,
  } = {}
) {
  if (chavesNovas.length === 0) return filaBase;
  if (chavesNovas.length === 1) {
    return intercalarIR(filaBase, chavesNovas[0], chavesConhecidas, { repeticoes, espMin, espMax, rng });
  }

  const pool = shuffle(
    chavesConhecidas.filter((k) => !chavesNovas.includes(k)),
    rng
  );
  const segmento = [];
  const rodadas = repeticoes + 1;
  let idxConhecido = 0;

  for (let rodada = 0; rodada < rodadas; rodada++) {
    for (const chaveNovo of shuffle(chavesNovas, rng)) segmento.push(chaveNovo);

    if (rodada < rodadas - 1 && pool.length > 0) {
      const gap = espMin + Math.floor(rng() * (espMax - espMin + 1));
      for (let g = 0; g < gap; g++) {
        segmento.push(pool[idxConhecido % pool.length]);
        idxConhecido++;
      }
    }
  }

  return [...filaBase, ...segmento];
}

/**
 * Monta a fila de fatos da próxima leva: ~70% revisão vencida + ~30% fatos
 * novos da semana atual (respeitando maxNovosPorSessao), todos os novos
 * intercalados juntos via IR entre fatos maduros conhecidos.
 * @param {object[]} fatosState
 * @param {{agora:number, limit:number, semanaAtual:number, maxNovosPorSessao?:number, rng?:()=>number}} opts
 * @returns {string[]} chaves na ordem de apresentação
 */
export function getNextFacts(
  fatosState,
  { agora, limit, semanaAtual, maxNovosPorSessao = MAX_NOVOS_POR_SESSAO, rng = Math.random }
) {
  const revisaoOrdenada = getFatosParaRevisao(fatosState, agora);

  // Prioridade em 3 níveis na fila de revisão:
  // 1) problemáticos (erro recorrente) — nunca somem por azar do sorteio;
  // 2) difíceis (padrão) — o grosso da prática;
  // 3) fáceis (números 1/2/3/10 dos dois lados) — só entram se sobrar
  //    espaço depois dos difíceis, ou seja, aparecem excepcionalmente.
  const semProblema = revisaoOrdenada.filter((f) => !isFatoProblematico(f));
  const problematicos = shuffle(revisaoOrdenada.filter((f) => isFatoProblematico(f)), rng);
  const dificeis = shuffle(semProblema.filter((f) => !isFatoFacil(f)), rng);
  const faceis = shuffle(semProblema.filter((f) => isFatoFacil(f)), rng);
  const revisaoPriorizada = [...problematicos, ...dificeis, ...faceis];

  const novosDisponiveis = shuffle(getFatosNovosDisponiveis(fatosState, semanaAtual), rng);
  const qtdNovosAlvo = Math.min(maxNovosPorSessao, Math.round(limit * 0.3));
  const novosEscolhidos = novosDisponiveis.slice(0, Math.max(0, qtdNovosAlvo));

  const conhecidos = shuffle(
    fatosState.filter(isFatoMaduro).map((f) => f.chave),
    rng
  );

  const qtdRevisao = Math.max(0, limit - novosEscolhidos.length);
  let fila = revisaoPriorizada.slice(0, qtdRevisao).map((f) => f.chave);

  fila = intercalarVariosIR(fila, novosEscolhidos.map((f) => f.chave), conhecidos, { rng });

  // Reforço: fatos problemáticos que entraram na fila ganham mais uma
  // aparição na mesma sessão (capado, pra não inflar a fila como o IR antigo).
  const chavesProblematicasNaFila = [...new Set(fila)].filter((chave) =>
    problematicos.some((f) => f.chave === chave)
  );
  const paraReforcar = shuffle(chavesProblematicasNaFila, rng).slice(0, REFORCO_MAX_FATOS_POR_SESSAO);
  if (paraReforcar.length > 0) {
    fila = [...fila, ...paraReforcar];
  }

  return fila;
}

/**
 * Avanço automático de semana: true quando as últimas AVANCO_SEMANA_SESSOES
 * sessões JOGADAS NA SEMANA ATUAL tiveram acertoSemanaPct > AVANCO_SEMANA_PCT.
 * Sessões de semanas anteriores não contam: sem esse filtro, as mesmas
 * sessões boas antigas seriam reaproveitadas a cada avanço e a semana
 * avançaria em cascata (1 → 6 em poucas sessões), pulando os fatos novos
 * das semanas intermediárias.
 * @param {{acertoSemanaPct:number, semana:number}[]} ultimasSessoes ordenadas
 *   da mais antiga para a mais recente (usamos as N últimas da semana atual).
 * @param {number} semanaAtual
 */
export function deveAvancarSemana(ultimasSessoes, semanaAtual) {
  if (semanaAtual >= SEMANA_MAX) return false;
  const daSemanaAtual = ultimasSessoes.filter((s) => s.semana === semanaAtual);
  if (daSemanaAtual.length < AVANCO_SEMANA_SESSOES) return false;
  const recentes = daSemanaAtual.slice(-AVANCO_SEMANA_SESSOES);
  return recentes.every((s) => s.acertoSemanaPct > AVANCO_SEMANA_PCT);
}
