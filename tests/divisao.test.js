// tests/divisao.test.js
// Roda com: node --test tests/*.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  escolherDivisor,
  gerarProblema,
  validarEstimativa,
  criarEstadoConta,
  aplicarEstimativa,
  contaTerminada,
  quocienteAcumulado,
  parDePassos,
  calcularEstrelasDivisao,
  deveAvancarNivel,
} from '../js/divisao.js';
import { criarFatoInicial } from '../js/scheduler.js';
import { DIV_NIVEL_MAX, DIV_ESTRELA_FOLGA } from '../js/config.js';

// RNG determinístico (LCG simples), mesmo padrão de tests/scheduler.test.js.
function criarRng(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

const AGORA = new Date('2026-08-15T12:00:00Z').getTime();

describe('gerarProblema', () => {
  test('dividendo = divisor × quociente + resto, sempre, em todos os níveis', () => {
    for (let nivel = 1; nivel <= 6; nivel++) {
      for (let seed = 0; seed < 50; seed++) {
        const problema = gerarProblema({ nivel, fatosState: [], rng: criarRng(seed * 7 + nivel) });
        assert.equal(problema.dividendo, problema.divisor * problema.quociente + problema.resto);
      }
    }
  });

  test('nunca sorteia divisor 1', () => {
    for (let nivel = 1; nivel <= 6; nivel++) {
      for (let seed = 0; seed < 50; seed++) {
        const problema = gerarProblema({ nivel, fatosState: [], rng: criarRng(seed * 3 + nivel) });
        assert.notEqual(problema.divisor, 1);
      }
    }
  });

  test('divisor 10 só aparece a partir do nível 3', () => {
    for (let seed = 0; seed < 300; seed++) {
      const problema = gerarProblema({ nivel: 1, fatosState: [], rng: criarRng(seed) });
      assert.notEqual(problema.divisor, 10);
    }
    for (let seed = 0; seed < 300; seed++) {
      const problema = gerarProblema({ nivel: 2, fatosState: [], rng: criarRng(seed) });
      assert.notEqual(problema.divisor, 10);
    }
  });

  test('nível 1: quociente 2..9, resto sempre 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = gerarProblema({ nivel: 1, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 2 && p.quociente <= 9);
      assert.equal(p.resto, 0);
    }
  });

  test('nível 2: quociente 2..9, resto sempre 1..(divisor-1)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = gerarProblema({ nivel: 2, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 2 && p.quociente <= 9);
      assert.ok(p.resto >= 1 && p.resto < p.divisor);
    }
  });

  test('nível 3: quociente 11..30, resto sempre 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = gerarProblema({ nivel: 3, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 11 && p.quociente <= 30);
      assert.equal(p.resto, 0);
    }
  });

  test('nível 4: quociente 11..30, resto sempre presente', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = gerarProblema({ nivel: 4, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 11 && p.quociente <= 30);
      assert.ok(p.resto >= 1 && p.resto < p.divisor);
    }
  });

  test('nível 5: quociente 31..99, mistura com e sem resto', () => {
    let comResto = 0;
    let semResto = 0;
    for (let seed = 0; seed < 200; seed++) {
      const p = gerarProblema({ nivel: 5, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 31 && p.quociente <= 99);
      if (p.resto === 0) semResto++;
      else comResto++;
    }
    assert.ok(comResto > 20, 'esperava vários problemas com resto');
    assert.ok(semResto > 20, 'esperava vários problemas sem resto');
  });

  test('nível 6: quociente 100..399, dividendo até 4 dígitos, mistura com e sem resto', () => {
    let comResto = 0;
    let semResto = 0;
    for (let seed = 0; seed < 200; seed++) {
      const p = gerarProblema({ nivel: 6, fatosState: [], rng: criarRng(seed) });
      assert.ok(p.quociente >= 100 && p.quociente <= 399);
      assert.ok(p.dividendo <= 9999);
      if (p.resto === 0) semResto++;
      else comResto++;
    }
    assert.ok(comResto > 20, 'esperava vários problemas com resto');
    assert.ok(semResto > 20, 'esperava vários problemas sem resto');
  });

  test('enunciado vem null (problema "seco") aproximadamente metade das vezes', () => {
    let comEnunciado = 0;
    let semEnunciado = 0;
    for (let seed = 0; seed < 300; seed++) {
      const p = gerarProblema({ nivel: 1, fatosState: [], rng: criarRng(seed) });
      if (p.enunciado === null) semEnunciado++;
      else comEnunciado++;
    }
    assert.ok(comEnunciado > 100 && semEnunciado > 100);
  });

  test('quando há enunciado, ele contém o dividendo e o divisor', () => {
    for (let seed = 0; seed < 100; seed++) {
      const p = gerarProblema({ nivel: 1, fatosState: [], rng: criarRng(seed) });
      if (p.enunciado !== null) {
        assert.ok(p.enunciado.includes(String(p.dividendo)));
        assert.ok(p.enunciado.includes(String(p.divisor)));
      }
    }
  });
});

describe('escolherDivisor', () => {
  function fatoMaduro(a, b) {
    return {
      chave: a <= b ? `${a}x${b}` : `${b}x${a}`,
      a,
      b,
      trivial: false,
      semanaSugerida: 1,
      halfLife: 10,
      nextReview: AGORA,
      introduzido: true,
      ultimasRespostas: [
        { correto: true, tempoMs: 900 },
        { correto: true, tempoMs: 900 },
        { correto: true, tempoMs: 900 },
      ],
      totalAcertos: 3,
      totalErros: 0,
    };
  }

  function fatoEmTreino(a, b) {
    return criarFatoInicial({ a, b, chave: a <= b ? `${a}x${b}` : `${b}x${a}`, trivial: false, semanaSugerida: 1 }, {});
  }

  test('sem fatosState, todos os divisores 2..9 podem sair (peso neutro)', () => {
    // Um único stream de rng consumido em sequência (não um novo seed por
    // tentativa): o LCG só "espalha" bem entre chamadas sucessivas do mesmo
    // gerador — sementes vizinhas (0,1,2...) produzem 1ªs saídas vizinhas,
    // não amostras independentes.
    const rng = criarRng(12345);
    const vistos = new Set();
    for (let i = 0; i < 500; i++) {
      vistos.add(escolherDivisor(1, [], rng));
    }
    for (const d of [2, 3, 4, 5, 6, 7, 8, 9]) {
      assert.ok(vistos.has(d), `esperava ver o divisor ${d} sair pelo menos uma vez`);
    }
  });

  test('tabuada madura tem peso maior que tabuada em treino', () => {
    // Tabuada do 4 totalmente madura; tabuada do 9 toda em treino (sem histórico).
    const fatosState = [];
    for (let x = 1; x <= 10; x++) {
      fatosState.push(fatoMaduro(4, x));
      fatosState.push(fatoEmTreino(9, x));
    }

    let vezes4 = 0;
    let vezes9 = 0;
    const N = 2000;
    const rng = criarRng(999);
    for (let i = 0; i < N; i++) {
      const d = escolherDivisor(1, fatosState, rng);
      if (d === 4) vezes4++;
      if (d === 9) vezes9++;
    }
    assert.ok(vezes4 > vezes9 * 1.5, `esperava tabuada madura (4) sair bem mais que em treino (9): ${vezes4} vs ${vezes9}`);
  });
});

describe('validarEstimativa', () => {
  test('estimativa que cabe no resto é aceita', () => {
    const r = validarEstimativa({ restoAtual: 60, divisor: 5, vezes: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.retirado, 10);
    assert.equal(r.novoResto, 50);
  });

  test('estimativa que consome o resto exatamente é aceita', () => {
    const r = validarEstimativa({ restoAtual: 10, divisor: 5, vezes: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.novoResto, 0);
  });

  test('estimativa que excede o resto é recusada com motivo "excede" (não é erro)', () => {
    const r = validarEstimativa({ restoAtual: 30, divisor: 7, vezes: 6 });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'excede');
  });

  test('vezes = 0 é inválida', () => {
    const r = validarEstimativa({ restoAtual: 60, divisor: 5, vezes: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalida');
  });

  test('vezes negativa é inválida', () => {
    const r = validarEstimativa({ restoAtual: 60, divisor: 5, vezes: -3 });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalida');
  });

  test('vezes não-numérica é inválida', () => {
    const r = validarEstimativa({ restoAtual: 60, divisor: 5, vezes: 'abc' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalida');
  });
});

describe('criarEstadoConta / aplicarEstimativa / contaTerminada', () => {
  test('60 ÷ 5 por seis estimativas de "2+" fecha certo', () => {
    let estado = criarEstadoConta(60);
    for (let i = 0; i < 6; i++) {
      const r = aplicarEstimativa(estado, 5, 2);
      assert.equal(r.validacao.ok, true);
      estado = r.estado;
    }
    assert.equal(contaTerminada(estado, 5), true);
    assert.equal(estado.restoAtual, 0);
    assert.equal(quocienteAcumulado(estado), 12);
  });

  test('60 ÷ 5 por "10, depois 2" fecha certo', () => {
    let estado = criarEstadoConta(60);
    estado = aplicarEstimativa(estado, 5, 10).estado;
    estado = aplicarEstimativa(estado, 5, 2).estado;
    assert.equal(contaTerminada(estado, 5), true);
    assert.equal(estado.restoAtual, 0);
    assert.equal(quocienteAcumulado(estado), 12);
  });

  test('60 ÷ 5 direto com "12" fecha certo', () => {
    let estado = criarEstadoConta(60);
    estado = aplicarEstimativa(estado, 5, 12).estado;
    assert.equal(contaTerminada(estado, 5), true);
    assert.equal(estado.restoAtual, 0);
    assert.equal(quocienteAcumulado(estado), 12);
  });

  test('58 ÷ 7 fecha com quociente 8 e resto 2', () => {
    let estado = criarEstadoConta(58);
    estado = aplicarEstimativa(estado, 7, 5).estado; // 35, resto 23
    estado = aplicarEstimativa(estado, 7, 3).estado; // 21, resto 2
    assert.equal(contaTerminada(estado, 7), true);
    assert.equal(estado.restoAtual, 2);
    assert.equal(quocienteAcumulado(estado), 8);
  });

  test('618 ÷ 7 por caminhos diferentes fecha com quociente 88 e resto 2', () => {
    // Caminho 1: 50 + 30 + 8
    let estadoA = criarEstadoConta(618);
    estadoA = aplicarEstimativa(estadoA, 7, 50).estado; // -350 -> 268
    estadoA = aplicarEstimativa(estadoA, 7, 30).estado; // -210 -> 58
    estadoA = aplicarEstimativa(estadoA, 7, 8).estado; // -56 -> 2
    assert.equal(contaTerminada(estadoA, 7), true);
    assert.equal(estadoA.restoAtual, 2);
    assert.equal(quocienteAcumulado(estadoA), 88);

    // Caminho 2: 80 + 8
    let estadoB = criarEstadoConta(618);
    estadoB = aplicarEstimativa(estadoB, 7, 80).estado; // -560 -> 58
    estadoB = aplicarEstimativa(estadoB, 7, 8).estado; // -56 -> 2
    assert.equal(contaTerminada(estadoB, 7), true);
    assert.equal(estadoB.restoAtual, 2);
    assert.equal(quocienteAcumulado(estadoB), 88);
  });

  test('estimativa recusada (excede) não altera o estado', () => {
    let estado = criarEstadoConta(30);
    const r = aplicarEstimativa(estado, 7, 6); // 6×7=42 > 30
    assert.equal(r.validacao.ok, false);
    assert.equal(r.validacao.motivo, 'excede');
    assert.deepEqual(r.estado, estado); // não mutou nem avançou
  });
});

describe('parDePassos', () => {
  test('exemplos do SPEC', () => {
    assert.equal(parDePassos(27), 2); // 20 + 7
    assert.equal(parDePassos(12), 2); // 10 + 2
    assert.equal(parDePassos(8), 1);
    assert.equal(parDePassos(176), 3); // 100 + 70 + 6
    assert.equal(parDePassos(352), 3); // 300 + 50 + 2
  });

  test('quociente com dígitos zero conta só os não-zero', () => {
    assert.equal(parDePassos(100), 1); // só "100"
    assert.equal(parDePassos(205), 2); // 200 + 5
  });
});

describe('calcularEstrelasDivisao', () => {
  test('3 estrelas quando passos <= par', () => {
    assert.equal(calcularEstrelasDivisao(2, 27), 3); // par(27) = 2
    assert.equal(calcularEstrelasDivisao(1, 27), 3);
  });

  test(`2 estrelas quando passos <= par + ${DIV_ESTRELA_FOLGA}`, () => {
    assert.equal(calcularEstrelasDivisao(4, 27), 2); // par=2, folga=2 -> até 4
  });

  test('1 estrela (nunca 0) quando passos excede par + folga', () => {
    assert.equal(calcularEstrelasDivisao(5, 27), 1);
    assert.equal(calcularEstrelasDivisao(20, 8), 1);
  });
});

describe('deveAvancarNivel', () => {
  const p = (nivel, limpo) => ({ nivel, fechouDePrimeira: limpo });

  test('true com 4 de 5 problemas do nível atual limpos', () => {
    assert.equal(
      deveAvancarNivel([p(1, true), p(1, true), p(1, false), p(1, true), p(1, true)], 1),
      true
    );
  });

  test('false com só 3 de 5 limpos', () => {
    assert.equal(
      deveAvancarNivel([p(1, true), p(1, true), p(1, false), p(1, false), p(1, true)], 1),
      false
    );
  });

  test('false com menos de 5 problemas no nível atual', () => {
    assert.equal(deveAvancarNivel([p(1, true), p(1, true), p(1, true)], 1), false);
  });

  test('problemas de níveis anteriores não contam (sem avanço em cascata)', () => {
    // 3 limpos no nível 1 (já superado) + só 2 no nível 2 atual não bastam.
    assert.equal(
      deveAvancarNivel(
        [p(1, true), p(1, true), p(1, true), p(2, true), p(2, true)],
        2
      ),
      false
    );
  });

  test('considera as últimas DIV_AVANCO_JANELA do nível atual mesmo com outros níveis no meio', () => {
    assert.equal(
      deveAvancarNivel(
        [p(2, true), p(1, false), p(2, true), p(2, true), p(2, false), p(2, true)],
        2
      ),
      true
    );
  });

  test(`nunca passa de DIV_NIVEL_MAX (${DIV_NIVEL_MAX})`, () => {
    const janelaCheiaLimpa = Array.from({ length: 5 }, () => p(DIV_NIVEL_MAX, true));
    assert.equal(deveAvancarNivel(janelaCheiaLimpa, DIV_NIVEL_MAX), false);
  });
});
