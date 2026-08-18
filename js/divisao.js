// js/divisao.js
// Divisão pelo Método das Estimativas (divisões parciais / subtrações
// sucessivas) — lógica pura, sem I/O, sem DOM, sem relógio direto (`rng`
// sempre injetado), testável em Node como scheduler.js. Sem pressão de
// tempo: o objetivo é compreensão e raciocínio flexível, não velocidade —
// por isso não há nenhum conceito de "resposta rápida" aqui.

import { isFatoMaduro } from './scheduler.js';
import { DIV_NIVEL_INICIAL, DIV_NIVEL_MAX, DIV_AVANCO_JANELA, DIV_AVANCO_MIN_LIMPOS, DIV_ESTRELA_FOLGA } from './config.js';

/**
 * Faixas de quociente/resto por nível, calibradas pelos exercícios reais do
 * livro/caderno do 4º ano. `comResto`:
 * - false  → resto sempre 0 (divisão exata)
 * - true   → resto sempre presente, em 1..(divisor-1)
 * - 'misto' → metade das vezes exata, metade com resto (níveis mais altos,
 *   onde os dois casos já aparecem misturados no caderno)
 */
const FAIXAS_NIVEL = {
  1: { quocienteMin: 2, quocienteMax: 9, comResto: false },
  2: { quocienteMin: 2, quocienteMax: 9, comResto: true },
  3: { quocienteMin: 11, quocienteMax: 30, comResto: false },
  4: { quocienteMin: 11, quocienteMax: 30, comResto: true },
  5: { quocienteMin: 31, quocienteMax: 99, comResto: 'misto' },
  6: { quocienteMin: 100, quocienteMax: 399, comResto: 'misto' },
};

/** Banco de ~15 modelos de enunciado, nos dois sentidos da divisão (repartir
 * em N grupos iguais × quantos grupos de N cabem), com objetos do universo
 * do livro. Cada modelo recebe (dividendo, divisor). */
const MODELOS_ENUNCIADO = [
  (d, e) => `${d} bombons foram repartidos igualmente entre ${e} crianças. Quantos bombons cada uma recebeu?`,
  (d, e) => `Uma caixa tem ${d} bombons. Se cada saquinho leva ${e} bombons, quantos saquinhos dá pra fazer?`,
  (d, e) => `${d} gibis foram divididos igualmente entre ${e} amigos. Quantos gibis cada um ficou?`,
  (d, e) => `Há ${d} gibis empilhados em pilhas de ${e}. Quantas pilhas se formam?`,
  (d, e) => `${d} lápis foram distribuídos igualmente em ${e} estojos. Quantos lápis foram em cada estojo?`,
  (d, e) => `Uma professora tem ${d} lápis e quer dar ${e} lápis para cada aluno. Para quantos alunos dá?`,
  (d, e) => `${d} empadas foram divididas igualmente entre ${e} convidados. Quantas empadas cada um comeu?`,
  (d, e) => `Uma padaria fez ${d} empadas e coloca ${e} empadas em cada bandeja. Quantas bandejas são precisas?`,
  (d, e) => `${d} figurinhas foram repartidas igualmente entre ${e} álbuns. Quantas figurinhas foram em cada álbum?`,
  (d, e) => `Um pacote tem ${d} figurinhas. Se cada envelope leva ${e} figurinhas, quantos envelopes dá pra encher?`,
  (d, e) => `${d} metros de corda foram cortados em pedaços iguais para ${e} crianças brincarem. Quantos metros cada uma ganhou?`,
  (d, e) => `Uma corda de ${d} metros foi cortada em pedaços de ${e} metros. Quantos pedaços deram?`,
  (d, e) => `${d} reais foram divididos igualmente entre ${e} irmãos. Quanto cada um recebeu?`,
  (d, e) => `Uma coleção de ${d} reais em moedas foi separada em montinhos de ${e} reais. Quantos montinhos deram?`,
  (d, e) => `${d} balas foram repartidas igualmente em ${e} potes. Quantas balas foram em cada pote?`,
];

/**
 * Peso de um divisor candidato: mais alto quanto mais madura a tabuada dele
 * estiver no módulo de tabuada (fatosState do scheduler) — a criança usa com
 * mais confiança um divisor cuja tabuada ela já domina. Sem fatosState (ou
 * sem fatos daquela tabuada ainda no banco), peso neutro.
 * @param {number} divisor
 * @param {object[]} fatosState
 */
function pesoDivisor(divisor, fatosState) {
  if (!fatosState || fatosState.length === 0) return 1;
  const fatosDaTabuada = fatosState.filter((f) => f.a === divisor || f.b === divisor);
  if (fatosDaTabuada.length === 0) return 1;
  const maduros = fatosDaTabuada.filter((f) => isFatoMaduro(f)).length;
  const proporcaoMadura = maduros / fatosDaTabuada.length;
  return 1 + proporcaoMadura * 3; // 1 (em treino) .. 4 (tabuada toda madura)
}

/**
 * Sorteia o divisor (2..9, e 10 a partir do nível 3) com peso pela maturidade
 * da tabuada correspondente. Nunca sorteia 1.
 * @param {number} nivel
 * @param {object[]} fatosState
 * @param {() => number} rng
 */
export function escolherDivisor(nivel, fatosState, rng = Math.random) {
  const candidatos = [2, 3, 4, 5, 6, 7, 8, 9];
  if (nivel >= 3) candidatos.push(10);

  const pesos = candidatos.map((d) => pesoDivisor(d, fatosState));
  const total = pesos.reduce((soma, p) => soma + p, 0);
  let alvo = rng() * total;
  for (let i = 0; i < candidatos.length; i++) {
    alvo -= pesos[i];
    if (alvo <= 0) return candidatos[i];
  }
  return candidatos[candidatos.length - 1];
}

/** Sorteia um enunciado pra (dividendo, divisor), ou `null` metade das vezes
 * (problema "seco", só a conta) — conforme o SPEC. */
function gerarEnunciado(dividendo, divisor, rng) {
  if (rng() < 0.5) return null;
  const modelo = MODELOS_ENUNCIADO[Math.floor(rng() * MODELOS_ENUNCIADO.length)];
  return modelo(dividendo, divisor);
}

/**
 * Gera um problema de divisão calibrado pelo nível, com o divisor sorteado
 * por maturidade da tabuada. dividendo = divisor × quociente + resto sempre
 * (o problema nasce do quociente/resto sorteados, nunca por tentativa e erro).
 * @param {{nivel:number, fatosState?:object[], rng?:()=>number}} opts
 */
export function gerarProblema({ nivel, fatosState = [], rng = Math.random }) {
  const faixa = FAIXAS_NIVEL[nivel] || FAIXAS_NIVEL[DIV_NIVEL_INICIAL];
  const divisor = escolherDivisor(nivel, fatosState, rng);
  const quociente =
    faixa.quocienteMin + Math.floor(rng() * (faixa.quocienteMax - faixa.quocienteMin + 1));

  let resto = 0;
  if (faixa.comResto === true) {
    resto = 1 + Math.floor(rng() * (divisor - 1));
  } else if (faixa.comResto === 'misto') {
    resto = rng() < 0.5 ? 1 + Math.floor(rng() * (divisor - 1)) : 0;
  }

  const dividendo = divisor * quociente + resto;
  const enunciado = gerarEnunciado(dividendo, divisor, rng);

  return { dividendo, divisor, quociente, resto, nivel, enunciado };
}

/**
 * Valida uma estimativa (o "quantas vezes" que a criança escolheu retirar).
 * Estimar alto demais e corrigir faz parte do método — por isso 'excede'
 * NÃO é um erro, é só um pedido gentil pra tentar um número menor.
 * @param {{restoAtual:number, divisor:number, vezes:number}} params
 */
export function validarEstimativa({ restoAtual, divisor, vezes }) {
  const vezesNum = Number(vezes);
  if (!Number.isInteger(vezesNum) || vezesNum < 1) {
    return { ok: false, motivo: 'invalida' };
  }
  const retirado = vezesNum * divisor;
  if (retirado > restoAtual) {
    return { ok: false, motivo: 'excede' };
  }
  return { ok: true, retirado, novoResto: restoAtual - retirado };
}

/** Estado inicial da "chave" de uma conta: nenhum passo dado ainda, resto = dividendo. */
export function criarEstadoConta(dividendo) {
  return { restoAtual: dividendo, passos: [] };
}

/**
 * Reducer puro: valida a estimativa e, se aceita, acumula `{vezes, retirado}`
 * nos passos e reduz o resto. Se recusada ('excede'/'invalida'), devolve o
 * estado inalterado junto da validação (pra UI mostrar o feedback gentil).
 * @param {{restoAtual:number, passos:{vezes:number,retirado:number}[]}} estado
 * @param {number} divisor
 * @param {number} vezes
 */
export function aplicarEstimativa(estado, divisor, vezes) {
  const validacao = validarEstimativa({ restoAtual: estado.restoAtual, divisor, vezes });
  if (!validacao.ok) return { validacao, estado };
  const novoEstado = {
    restoAtual: validacao.novoResto,
    passos: [...estado.passos, { vezes: Number(vezes), retirado: validacao.retirado }],
  };
  return { validacao, estado: novoEstado };
}

/** A conta termina quando o resto fica menor que o divisor. */
export function contaTerminada(estado, divisor) {
  return estado.restoAtual < divisor;
}

/** Soma da coluna de estimativas até agora (o quociente parcial/total). */
export function quocienteAcumulado(estado) {
  return estado.passos.reduce((soma, p) => soma + p.vezes, 0);
}

/**
 * Número de parcelas da decomposição por valor posicional do quociente —
 * a referência de "estimativa grande" que o livro incentiva (27 → 20+7 → 2;
 * 176 → 100+70+6 → 3). Equivale a contar os dígitos não-zero do quociente.
 * @param {number} quociente
 */
export function parDePassos(quociente) {
  const digitos = String(Math.abs(Math.trunc(quociente))).split('');
  const naoZero = digitos.filter((d) => d !== '0').length;
  return naoZero || 1;
}

/**
 * 3⭐ se a criança usou até `par` passos (parDePassos do quociente); 2⭐ até
 * par+DIV_ESTRELA_FOLGA; senão 1⭐ — nunca 0, sem punição por caminho longo.
 * @param {number} passosUsados
 * @param {number} quociente
 */
export function calcularEstrelasDivisao(passosUsados, quociente) {
  const par = parDePassos(quociente);
  if (passosUsados <= par) return 3;
  if (passosUsados <= par + DIV_ESTRELA_FOLGA) return 2;
  return 1;
}

/**
 * Avanço automático de nível: true quando, dos últimos DIV_AVANCO_JANELA
 * problemas RESOLVIDOS NO NÍVEL ATUAL, pelo menos DIV_AVANCO_MIN_LIMPOS
 * fecharam "limpos" (quociente e resto certos na 1ª tentativa de
 * fechamento). Problemas de níveis anteriores não contam — mesma lição do
 * avanço de semana da tabuada, pra não avançar em cascata. Nunca passa de
 * DIV_NIVEL_MAX.
 * @param {{nivel:number, fechouDePrimeira:boolean}[]} ultimosProblemas
 * @param {number} nivel
 */
export function deveAvancarNivel(ultimosProblemas, nivel) {
  if (nivel >= DIV_NIVEL_MAX) return false;
  const doNivelAtual = ultimosProblemas.filter((p) => p.nivel === nivel);
  if (doNivelAtual.length < DIV_AVANCO_JANELA) return false;
  const janela = doNivelAtual.slice(-DIV_AVANCO_JANELA);
  const limpos = janela.filter((p) => p.fechouDePrimeira).length;
  return limpos >= DIV_AVANCO_MIN_LIMPOS;
}
