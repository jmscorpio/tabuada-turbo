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
});

describe('deveAvancarSemana', () => {
  test('true só com 3 sessões consecutivas > 85%', () => {
    assert.equal(
      deveAvancarSemana([{ acertoSemanaPct: 0.9 }, { acertoSemanaPct: 0.9 }, { acertoSemanaPct: 0.9 }], 1),
      true
    );
  });

  test('false se qualquer uma das últimas 3 ficar <= 85%', () => {
    assert.equal(
      deveAvancarSemana([{ acertoSemanaPct: 0.9 }, { acertoSemanaPct: 0.8 }, { acertoSemanaPct: 0.9 }], 1),
      false
    );
  });

  test('false com menos de 3 sessões no histórico', () => {
    assert.equal(deveAvancarSemana([{ acertoSemanaPct: 0.95 }], 1), false);
  });

  test('false na semana máxima (6)', () => {
    assert.equal(
      deveAvancarSemana([{ acertoSemanaPct: 0.95 }, { acertoSemanaPct: 0.95 }, { acertoSemanaPct: 0.95 }], 6),
      false
    );
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
