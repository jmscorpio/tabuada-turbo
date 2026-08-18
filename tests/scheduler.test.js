// tests/scheduler.test.js
// Roda com: node --test tests/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarFatoInicial,
  calcularNovoHalfLife,
  calcularNextReview,
  registrarResposta,
  isFatoMaduro,
  isFatoProblematico,
  isFatoFacil,
  getFatosParaRevisao,
  getFatosNovosDisponiveis,
  intercalarIR,
  intercalarVariosIR,
  getNextFacts,
  deveAvancarSemana,
  shuffle,
} from '../js/scheduler.js';
import {
  T_RAPIDO,
  T_META,
  HALFLIFE_CAP,
  HALFLIFE_MIN_ERRO,
  MS_POR_DIA,
  MATURO_HALFLIFE_MIN,
  MAX_NOVOS_POR_SESSAO,
} from '../js/config.js';

// RNG determinístico (LCG simples) para testes reproduzíveis.
function criarRng(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

const AGORA = new Date('2026-08-15T12:00:00Z').getTime();

describe('calcularNovoHalfLife', () => {
  test('acerto <= T_RAPIDO multiplica por 2.0', () => {
    assert.equal(calcularNovoHalfLife(2, true, T_RAPIDO), 4);
    assert.equal(calcularNovoHalfLife(2, true, 500), 4);
  });

  test('acerto entre T_RAPIDO e 5000ms multiplica por 1.4', () => {
    assert.equal(calcularNovoHalfLife(2, true, 2001), 2.8);
    assert.equal(calcularNovoHalfLife(2, true, 5000), 2.8);
  });

  test('acerto acima de 5000ms multiplica por 1.1', () => {
    assert.ok(Math.abs(calcularNovoHalfLife(2, true, 5001) - 2.2) < 1e-9);
  });

  test('erro multiplica por 0.5 com piso 0.5', () => {
    assert.equal(calcularNovoHalfLife(2, false, 9999), 1);
    assert.equal(calcularNovoHalfLife(0.6, false, 100), HALFLIFE_MIN_ERRO);
    assert.equal(calcularNovoHalfLife(0.1, false, 100), HALFLIFE_MIN_ERRO);
  });

  test('respeita o cap superior', () => {
    assert.equal(calcularNovoHalfLife(HALFLIFE_CAP, true, 100), HALFLIFE_CAP);
    assert.equal(calcularNovoHalfLife(29, true, 100), HALFLIFE_CAP);
  });
});

describe('calcularNextReview', () => {
  test('erro agenda para amanhã', () => {
    assert.equal(calcularNextReview(AGORA, 10, false), AGORA + MS_POR_DIA);
  });

  test('acerto agenda agora + halfLife dias', () => {
    assert.equal(calcularNextReview(AGORA, 3, true), AGORA + 3 * MS_POR_DIA);
  });
});

describe('criarFatoInicial', () => {
  test('fato comum nasce não introduzido, halfLife inicial', () => {
    const f = criarFatoInicial(
      { a: 4, b: 9, chave: '4x9', trivial: false, semanaSugerida: 2 },
      { agora: AGORA }
    );
    assert.equal(f.introduzido, false);
    assert.equal(f.nextReview, null);
    assert.equal(f.halfLife, 1);
  });

  test('fato de tabuada conhecida (ex.: 3) nasce maduro via seed', () => {
    const f = criarFatoInicial(
      { a: 3, b: 7, chave: '3x7', trivial: false, semanaSugerida: 0 },
      { conhecidas: [3], agora: AGORA }
    );
    assert.equal(f.introduzido, true);
    assert.equal(f.halfLife, MATURO_HALFLIFE_MIN);
    assert.equal(f.nextReview, AGORA);
    assert.equal(isFatoMaduro(f), true);
  });
});

describe('registrarResposta', () => {
  test('não muta o objeto original e acumula histórico (máx 3)', () => {
    let f = criarFatoInicial(
      { a: 2, b: 6, chave: '2x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    const original = f;
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    assert.notEqual(f, original);
    assert.equal(original.introduzido, false); // original intacto

    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    assert.equal(f.ultimasRespostas.length, 3);
    assert.equal(f.totalAcertos, 4);
  });
});

describe('isFatoMaduro', () => {
  test('fato trivial (tabuada 1/10) matura após 1 acerto', () => {
    let f = criarFatoInicial(
      { a: 1, b: 6, chave: '1x6', trivial: true, semanaSugerida: 1 },
      { agora: AGORA }
    );
    assert.equal(isFatoMaduro(f), false);
    f = registrarResposta(f, { correto: true, tempoMs: 4000, agora: AGORA });
    assert.equal(isFatoMaduro(f), true);
  });

  test('fato geral precisa halfLife>=7 e últimas 3 corretas com tempo<=T_META', () => {
    let f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    for (let i = 0; i < 3; i++) {
      f = registrarResposta(f, { correto: true, tempoMs: T_RAPIDO, agora: AGORA });
    }
    assert.ok(f.halfLife >= MATURO_HALFLIFE_MIN, 'halfLife deveria ter crescido para >=7');
    assert.equal(isFatoMaduro(f), true);
  });

  test('fato geral NÃO matura se a última resposta foi lenta (>T_META)', () => {
    let f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    for (let i = 0; i < 2; i++) {
      f = registrarResposta(f, { correto: true, tempoMs: T_RAPIDO, agora: AGORA });
    }
    f = registrarResposta(f, { correto: true, tempoMs: T_META + 500, agora: AGORA });
    assert.equal(isFatoMaduro(f), false);
  });
});

describe('isFatoProblematico', () => {
  test('fato ainda não introduzido nunca é problemático', () => {
    const f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    assert.equal(isFatoProblematico(f), false);
  });

  test('fato introduzido sem histórico ainda não é problemático', () => {
    let f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    f = { ...f, introduzido: true };
    assert.equal(isFatoProblematico(f), false);
  });

  test('mais de 40% de erro nas respostas recentes é problemático', () => {
    let f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    f = registrarResposta(f, { correto: false, tempoMs: 4000, agora: AGORA });
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    // 1 erro em 2 respostas = 50% > 40%
    assert.equal(isFatoProblematico(f), true);
  });

  test('taxa de erro dentro do limiar não é problemático', () => {
    let f = criarFatoInicial(
      { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
      { agora: AGORA }
    );
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    f = registrarResposta(f, { correto: true, tempoMs: 1000, agora: AGORA });
    f = registrarResposta(f, { correto: false, tempoMs: 4000, agora: AGORA });
    // 1 erro em 3 respostas ≈ 33% <= 40%
    assert.equal(isFatoProblematico(f), false);
  });
});

describe('isFatoFacil', () => {
  test('fato com os dois operandos em NUMEROS_FACEIS (padrão 1/2/3/10) é fácil', () => {
    assert.equal(isFatoFacil({ a: 2, b: 3 }), true);
    assert.equal(isFatoFacil({ a: 1, b: 10 }), true);
    assert.equal(isFatoFacil({ a: 10, b: 10 }), true);
  });

  test('fato com só um operando fácil continua difícil (o número complexo importa)', () => {
    assert.equal(isFatoFacil({ a: 2, b: 7 }), false); // 7 é complexo
    assert.equal(isFatoFacil({ a: 10, b: 6 }), false); // 6 é complexo
  });

  test('fato com os dois operandos complexos é difícil', () => {
    assert.equal(isFatoFacil({ a: 6, b: 8 }), false);
    assert.equal(isFatoFacil({ a: 4, b: 4 }), false);
  });

  test('aceita uma lista de números fáceis customizada', () => {
    assert.equal(isFatoFacil({ a: 6, b: 8 }, [6, 8]), true);
  });
});

describe('getFatosParaRevisao / getFatosNovosDisponiveis', () => {
  test('só retorna introduzidos com nextReview vencido, ordenado por mais atrasado', () => {
    const fatos = [
      { chave: 'a', introduzido: true, nextReview: AGORA - 5000 },
      { chave: 'b', introduzido: true, nextReview: AGORA - 50000 },
      { chave: 'c', introduzido: true, nextReview: AGORA + 50000 },
      { chave: 'd', introduzido: false, nextReview: null },
    ];
    const revisao = getFatosParaRevisao(fatos, AGORA);
    assert.deepEqual(
      revisao.map((f) => f.chave),
      ['b', 'a']
    );
  });

  test('novos disponíveis respeitam semanaSugerida <= semanaAtual e > 0', () => {
    const fatos = [
      { chave: 'seed', introduzido: true, semanaSugerida: 0 },
      { chave: 'w1', introduzido: false, semanaSugerida: 1 },
      { chave: 'w3', introduzido: false, semanaSugerida: 3 },
      { chave: 'jaFeito', introduzido: true, semanaSugerida: 1 },
    ];
    const novos = getFatosNovosDisponiveis(fatos, 2);
    assert.deepEqual(
      novos.map((f) => f.chave),
      ['w1']
    );
  });
});

describe('intercalarIR', () => {
  test('fato novo aparece repeticoes+1 vezes, com gaps entre espMin e espMax', () => {
    const conhecidos = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const rng = criarRng(42);
    const fila = intercalarIR([], 'NOVO', conhecidos, {
      repeticoes: 3,
      espMin: 7,
      espMax: 8,
      rng,
    });
    const posicoes = fila.reduce((acc, chave, i) => {
      if (chave === 'NOVO') acc.push(i);
      return acc;
    }, []);
    assert.equal(posicoes.length, 4); // 1 inicial + 3 repetições

    for (let i = 1; i < posicoes.length; i++) {
      const gap = posicoes[i] - posicoes[i - 1] - 1;
      assert.ok(gap >= 7 && gap <= 8, `gap ${gap} deveria estar entre 7 e 8`);
    }
  });

  test('sem fatos conhecidos, ainda assim repete o novo sem quebrar', () => {
    const fila = intercalarIR([], 'NOVO', [], { rng: criarRng(1) });
    assert.equal(fila.filter((c) => c === 'NOVO').length, 4);
  });
});

describe('intercalarVariosIR', () => {
  test('vários novos compartilham as rodadas em vez de empilhar segmentos', () => {
    const conhecidos = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const rng = criarRng(5);
    const fila = intercalarVariosIR([], ['N1', 'N2', 'N3'], conhecidos, {
      repeticoes: 3,
      espMin: 7,
      espMax: 8,
      rng,
    });

    // cada novo aparece repeticoes+1 vezes
    for (const chave of ['N1', 'N2', 'N3']) {
      assert.equal(fila.filter((c) => c === chave).length, 4);
    }

    // tamanho total limitado: 3 rodadas de novos (4 rodadas * 3 novos = 12)
    // + no máximo 3 gaps de 8 conhecidos = 24 → bem abaixo do que 3 trens
    // independentes produziriam (~3 * 26 = 78).
    assert.ok(fila.length <= 12 + 3 * 8, `fila muito longa: ${fila.length}`);
  });

  test('com um único novo, comporta-se como intercalarIR', () => {
    const conhecidos = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const filaMulti = intercalarVariosIR([], ['SOLO'], conhecidos, { rng: criarRng(2) });
    assert.equal(filaMulti.filter((c) => c === 'SOLO').length, 4);
  });
});

describe('getNextFacts', () => {
  function montarPoolFatos() {
    const fatos = [];
    // 10 fatos maduros para servir de "conhecidos"
    for (let i = 0; i < 10; i++) {
      fatos.push({
        chave: `m${i}`,
        trivial: false,
        introduzido: true,
        nextReview: AGORA + 999 * MS_POR_DIA, // não vencido
        halfLife: 10,
        ultimasRespostas: [
          { correto: true, tempoMs: 1000 },
          { correto: true, tempoMs: 1000 },
          { correto: true, tempoMs: 1000 },
        ],
        totalAcertos: 3,
        totalErros: 0,
        semanaSugerida: 1,
      });
    }
    // 5 fatos vencidos para revisão
    for (let i = 0; i < 5; i++) {
      fatos.push({
        chave: `r${i}`,
        trivial: false,
        introduzido: true,
        nextReview: AGORA - 1000,
        halfLife: 2,
        ultimasRespostas: [],
        totalAcertos: 1,
        totalErros: 0,
        semanaSugerida: 1,
      });
    }
    // 5 fatos novos disponíveis na semana 2
    for (let i = 0; i < 5; i++) {
      fatos.push({
        chave: `n${i}`,
        trivial: false,
        introduzido: false,
        nextReview: null,
        halfLife: 1,
        ultimasRespostas: [],
        totalAcertos: 0,
        totalErros: 0,
        semanaSugerida: 2,
      });
    }
    return fatos;
  }

  test('respeita MAX_NOVOS_POR_SESSAO e nunca introduz fato de semana futura', () => {
    const fatos = montarPoolFatos();
    const rng = criarRng(7);
    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 15,
      semanaAtual: 2,
      maxNovosPorSessao: MAX_NOVOS_POR_SESSAO,
      rng,
    });
    const novosNaFila = new Set(fila.filter((c) => c.startsWith('n')));
    assert.ok(novosNaFila.size <= MAX_NOVOS_POR_SESSAO);
    assert.ok(fila.length > 0);
  });

  test('sem semana liberada, não inclui fatos novos', () => {
    const fatos = montarPoolFatos();
    const rng = criarRng(3);
    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 8,
      semanaAtual: 0,
      rng,
    });
    assert.ok(fila.every((c) => !c.startsWith('n')));
  });

  test('maxNovosPorSessao=0 (warm-up) não introduz fatos novos', () => {
    const fatos = montarPoolFatos();
    const rng = criarRng(9);
    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 8,
      semanaAtual: 2,
      maxNovosPorSessao: 0,
      rng,
    });
    assert.ok(fila.every((c) => !c.startsWith('n')));
  });

  test('com MAX_NOVOS_POR_SESSAO novos, a fila não vira uma maratona (regressão)', () => {
    const fatos = montarPoolFatos();
    const rng = criarRng(11);
    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 10,
      semanaAtual: 2,
      maxNovosPorSessao: 3,
      rng,
    });
    // Antes da correção, 3 novos empilhados geravam ~80+ itens para um
    // bloco pensado para durar 3–4 minutos. Agora eles compartilham as
    // rodadas de IR e o total fica bem menor.
    assert.ok(fila.length <= 45, `fila do bloco novo muito longa: ${fila.length}`);
  });

  test('fatos problemáticos (erro recorrente) têm prioridade e não somem quando a fila é cortada', () => {
    const fatos = montarPoolFatos();
    // fatos[10..14] são os "r0".."r4" (revisão vencida) — marca 2 deles
    // como problemáticos (erro recorrente).
    const r0 = fatos.find((f) => f.chave === 'r0');
    const r1 = fatos.find((f) => f.chave === 'r1');
    r0.ultimasRespostas = [{ correto: false, tempoMs: 4000 }, { correto: true, tempoMs: 1000 }];
    r1.ultimasRespostas = [{ correto: false, tempoMs: 4000 }];

    // limit bem menor que o total de fatos de revisão (5), forçando corte
    for (let seed = 0; seed < 20; seed++) {
      const fila = getNextFacts(fatos, {
        agora: AGORA,
        limit: 2,
        semanaAtual: 1,
        maxNovosPorSessao: 0,
        rng: criarRng(seed),
      });
      assert.ok(fila.includes('r0'), `seed ${seed}: r0 (problemático) sumiu da fila`);
      assert.ok(fila.includes('r1'), `seed ${seed}: r1 (problemático) sumiu da fila`);
    }
  });

  test('fato problemático incluído na fila ganha uma repetição extra de reforço', () => {
    const fatos = montarPoolFatos();
    const r0 = fatos.find((f) => f.chave === 'r0');
    r0.ultimasRespostas = [{ correto: false, tempoMs: 4000 }, { correto: true, tempoMs: 1000 }];

    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 5,
      semanaAtual: 1,
      maxNovosPorSessao: 0,
      rng: criarRng(3),
    });
    const ocorrencias = fila.filter((c) => c === 'r0').length;
    assert.equal(ocorrencias, 2, 'fato problemático deveria aparecer 2 vezes (original + reforço)');
  });

  function montarPoolComDificuldade() {
    // 2 fatos "fáceis" (números 1/2/3/10 dos dois lados) e 4 "difíceis"
    // (pelo menos um operando complexo), todos vencidos para revisão.
    const facil = (chave, a, b) => ({
      chave, a, b, trivial: false, introduzido: true,
      nextReview: AGORA - 1000, halfLife: 2, ultimasRespostas: [],
      totalAcertos: 1, totalErros: 0, semanaSugerida: 0,
    });
    return [
      facil('2x3', 2, 3),
      facil('1x10', 1, 10),
      facil('6x8', 6, 8),
      facil('4x7', 4, 7),
      facil('5x9', 5, 9),
      facil('7x8', 7, 8),
    ];
  }

  test('fatos fáceis (1/2/3/10 dos dois lados) ficam de fora quando há difíceis suficientes', () => {
    const fatos = montarPoolComDificuldade(); // 2 fáceis + 4 difíceis
    for (let seed = 0; seed < 15; seed++) {
      const fila = getNextFacts(fatos, {
        agora: AGORA,
        limit: 4, // exatamente a quantidade de difíceis disponíveis
        semanaAtual: 1,
        maxNovosPorSessao: 0,
        rng: criarRng(seed),
      });
      assert.ok(!fila.includes('2x3'), `seed ${seed}: fato fácil 2x3 não deveria entrar (há difíceis de sobra)`);
      assert.ok(!fila.includes('1x10'), `seed ${seed}: fato fácil 1x10 não deveria entrar (há difíceis de sobra)`);
    }
  });

  test('fatos fáceis entram quando não há difíceis suficientes pra preencher a sessão', () => {
    const fatos = montarPoolComDificuldade(); // 2 fáceis + 4 difíceis = 6 no total
    const fila = getNextFacts(fatos, {
      agora: AGORA,
      limit: 6, // pede mais do que os 4 difíceis conseguem preencher sozinhos
      semanaAtual: 1,
      maxNovosPorSessao: 0,
      rng: criarRng(9),
    });
    assert.ok(fila.includes('2x3'), 'fato fácil deveria entrar como último recurso pra completar a sessão');
    assert.ok(fila.includes('1x10'), 'fato fácil deveria entrar como último recurso pra completar a sessão');
  });
});

describe('deveAvancarSemana', () => {
  const s = (pct, semana) => ({ acertoSemanaPct: pct, semana });

  test('true só com 3 sessões da semana atual > 85%', () => {
    assert.equal(deveAvancarSemana([s(0.9, 1), s(0.9, 1), s(0.9, 1)], 1), true);
  });

  test('false se qualquer uma das últimas 3 da semana ficar <= 85%', () => {
    assert.equal(deveAvancarSemana([s(0.9, 1), s(0.8, 1), s(0.9, 1)], 1), false);
  });

  test('false com menos de 3 sessões da semana atual no histórico', () => {
    assert.equal(deveAvancarSemana([s(0.95, 1)], 1), false);
  });

  test('sessões de semanas anteriores não contam (regressão: avanço em cascata)', () => {
    // Recém-avançou da semana 1 para a 2: as 2 sessões boas da semana 1 não
    // podem ser reaproveitadas para avançar de novo com 1 única sessão boa.
    assert.equal(deveAvancarSemana([s(0.95, 1), s(0.95, 1), s(0.95, 2)], 2), false);
    // Só avança quando houver 3 sessões boas jogadas NA semana 2.
    assert.equal(
      deveAvancarSemana([s(0.95, 1), s(0.95, 1), s(0.95, 2), s(0.95, 2), s(0.95, 2)], 2),
      true
    );
  });

  test('considera as últimas 3 da semana atual mesmo com sessões de outras semanas no meio', () => {
    assert.equal(deveAvancarSemana([s(0.9, 2), s(0.5, 1), s(0.9, 2), s(0.9, 2)], 2), true);
  });

  test('false na semana máxima (SEMANA_MAX)', () => {
    assert.equal(deveAvancarSemana([s(0.95, 6), s(0.95, 6), s(0.95, 6)], 6), false);
  });
});

describe('shuffle', () => {
  test('não muta o array original e preserva os elementos', () => {
    const original = [1, 2, 3, 4, 5];
    const copia = [...original];
    const embaralhado = shuffle(original, criarRng(123));
    assert.deepEqual(original, copia);
    assert.deepEqual([...embaralhado].sort(), [...original].sort());
  });
});
