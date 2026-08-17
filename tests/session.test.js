// tests/session.test.js
// Roda com: node --test tests/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarSessao, avaliarResposta, avancarFase, calcularResumoSessao } from '../js/session.js';
import { criarFatoInicial } from '../js/scheduler.js';
import { T_META } from '../js/config.js';

function criarRng(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

const AGORA = new Date('2026-08-15T12:00:00Z').getTime();

/** Monta um pool de fatos maduros (para warm-up) + alguns novos (semana 1). */
function montarFatosState() {
  const fatos = [];
  for (let i = 0; i < 12; i++) {
    const a = 1 + (i % 9);
    const b = 2 + ((i + 3) % 8);
    const chave = a <= b ? `${a}x${b}` : `${b}x${a}`;
    fatos.push(
      criarFatoInicial(
        { a: Math.min(a, b), b: Math.max(a, b), chave, trivial: false, semanaSugerida: 1 },
        { conhecidas: [3], agora: AGORA - 100 * 86400000 }
      )
    );
  }
  // garante alguns maduros de fato (com histórico de acerto rápido e halfLife alto)
  return fatos.map((f, i) => ({
    ...f,
    introduzido: true,
    nextReview: AGORA - 1000,
    halfLife: 10,
    ultimasRespostas: [
      { correto: true, tempoMs: 900 },
      { correto: true, tempoMs: 900 },
      { correto: true, tempoMs: 900 },
    ],
    totalAcertos: 3,
  }));
}

describe('criarSessao', () => {
  test('começa na fase warmup, com 8 a 10 fatos, sem fatos novos', () => {
    const fatosState = montarFatosState();
    const sessao = criarSessao({ fatosState, agora: AGORA, semanaAtual: 1, rng: criarRng(1) });
    assert.equal(sessao.fase, 'warmup');
    assert.ok(sessao.fila.length >= 8 && sessao.fila.length <= 10);
    assert.ok(sessao.fatoAtual !== null);
  });
});

describe('avaliarResposta', () => {
  function sessaoComUmFato() {
    const fatosState = [
      criarFatoInicial(
        { a: 4, b: 6, chave: '4x6', trivial: false, semanaSugerida: 4 },
        { agora: AGORA }
      ),
    ];
    fatosState[0].introduzido = true;
    fatosState[0].nextReview = AGORA;
    const sessao = {
      fase: 'novo',
      fila: ['4x6'],
      indiceAtual: 0,
      fatoAtual: { chave: '4x6', a: 4, b: 6, ordemInvertida: false },
      tentativasFatoAtual: 0,
      inicioFatoAtual: AGORA,
      corrigindoErro: false,
      resultados: [],
      inicioSessao: AGORA,
      fimSessao: null,
    };
    return { sessao, fatosState };
  }

  test('acerto <= T_META avança (acao proximo) e registra resultado', () => {
    const { sessao, fatosState } = sessaoComUmFato();
    const r = avaliarResposta(sessao, 24, fatosState, AGORA + 1000);
    assert.equal(r.correto, true);
    assert.equal(r.acao, 'proximo');
    assert.equal(r.novoEstado.indiceAtual, 1);
    assert.equal(r.novoEstado.resultados.length, 1);
    assert.equal(r.novoEstado.resultados[0].correto, true);
  });

  test('acerto > T_META também avança (sem repetir pergunta) — só a velocidade influencia o halfLife', () => {
    const { sessao, fatosState } = sessaoComUmFato();
    const r = avaliarResposta(sessao, 24, fatosState, AGORA + T_META + 500);
    assert.equal(r.correto, true);
    assert.equal(r.acao, 'proximo');
    assert.equal(r.novoEstado.indiceAtual, 1);
    assert.equal(r.novoEstado.resultados.length, 1);
    assert.equal(r.novoEstado.resultados[0].correto, true);
    assert.ok(r.tempoMs > T_META);
  });

  test('erro registra resultado uma vez e entra em modo de correção', () => {
    const { sessao, fatosState } = sessaoComUmFato();
    const r = avaliarResposta(sessao, 99, fatosState, AGORA + 2000);
    assert.equal(r.correto, false);
    assert.equal(r.acao, 'erro');
    assert.equal(r.novoEstado.corrigindoErro, true);
    assert.equal(r.novoEstado.indiceAtual, 0); // não avança ainda
    assert.equal(r.novoEstado.resultados.length, 1);
    assert.equal(r.novoEstado.resultados[0].correto, false);
  });

  test('modo de correção: redigitar certo avança sem novo resultado; errado não avança e não pune', () => {
    const { sessao, fatosState } = sessaoComUmFato();
    const erro = avaliarResposta(sessao, 99, fatosState, AGORA + 2000);
    assert.equal(erro.novoEstado.resultados.length, 1);

    const tentativaErrada = avaliarResposta(erro.novoEstado, 1, fatosState, AGORA + 3000);
    assert.equal(tentativaErrada.acao, 'repetirCorrecao');
    assert.equal(tentativaErrada.novoEstado.resultados.length, 1); // não duplicou
    assert.equal(tentativaErrada.novoEstado.indiceAtual, 0);

    const correcaoCerta = avaliarResposta(tentativaErrada.novoEstado, 24, fatosState, AGORA + 4000);
    assert.equal(correcaoCerta.acao, 'proximo');
    assert.equal(correcaoCerta.novoEstado.resultados.length, 1); // ainda não duplicou
    assert.equal(correcaoCerta.novoEstado.indiceAtual, 1);
  });
});

describe('avancarFase', () => {
  test('warmup -> novo monta fila com IR quando fatoAtual esgota', () => {
    const fatosState = montarFatosState();
    // fila mínima já esgotada
    const sessao = {
      fase: 'warmup',
      fila: ['x'],
      indiceAtual: 1,
      fatoAtual: null,
      tentativasFatoAtual: 0,
      inicioFatoAtual: null,
      corrigindoErro: false,
      resultados: [],
      inicioSessao: AGORA,
      fimSessao: null,
    };
    const proxima = avancarFase(sessao, fatosState, AGORA, { semanaAtual: 1, rng: criarRng(2) });
    assert.equal(proxima.fase, 'novo');
    assert.ok(proxima.fila.length > 0);
  });

  test('novo -> concluida gera fimSessao', () => {
    const sessao = {
      fase: 'novo',
      fila: ['x'],
      indiceAtual: 1,
      fatoAtual: null,
      tentativasFatoAtual: 0,
      inicioFatoAtual: null,
      corrigindoErro: false,
      resultados: [{ chave: 'x', correto: true, tempoMs: 1000 }],
      inicioSessao: AGORA,
      fimSessao: null,
    };
    const concluida = avancarFase(sessao, [], AGORA + 5000, { semanaAtual: 1 });
    assert.equal(concluida.fase, 'concluida');
    assert.equal(concluida.fimSessao, AGORA + 5000);
  });

  test('não faz nada se a fila atual ainda não terminou', () => {
    const sessao = {
      fase: 'warmup',
      fila: ['x', 'y'],
      indiceAtual: 0,
      fatoAtual: { chave: 'x', a: 1, b: 1, ordemInvertida: false },
      tentativasFatoAtual: 0,
      inicioFatoAtual: AGORA,
      corrigindoErro: false,
      resultados: [],
      inicioSessao: AGORA,
      fimSessao: null,
    };
    const igual = avancarFase(sessao, [], AGORA, { semanaAtual: 1 });
    assert.equal(igual, sessao);
  });
});

describe('calcularResumoSessao', () => {
  test('calcula totais, acertos, erros, tempo médio e % de acerto', () => {
    const sessao = {
      resultados: [
        { chave: 'a', correto: true, tempoMs: 1000 },
        { chave: 'b', correto: true, tempoMs: 2000 },
        { chave: 'c', correto: false, tempoMs: 5000 },
        { chave: 'd', correto: true, tempoMs: 1500 },
      ],
    };
    const resumo = calcularResumoSessao(sessao);
    assert.equal(resumo.totalFatos, 4);
    assert.equal(resumo.acertos, 3);
    assert.equal(resumo.erros, 1);
    assert.equal(resumo.tempoMedioMs, 1500); // média de 1000,2000,1500
    assert.equal(resumo.acertoSemanaPct, 0.75);
  });

  test('sessão vazia não quebra (divisão por zero evitada)', () => {
    const resumo = calcularResumoSessao({ resultados: [] });
    assert.equal(resumo.totalFatos, 0);
    assert.equal(resumo.tempoMedioMs, 0);
    assert.equal(resumo.acertoSemanaPct, 0);
  });
});

describe('cenário integrado: sessão completa com >= 5 fatos', () => {
  test('do início ao fim, resumo bate com os resultados acumulados', () => {
    const fatosState = montarFatosState();
    const rng = criarRng(99);
    let sessao = criarSessao({ fatosState, agora: AGORA, semanaAtual: 1, rng });
    let agora = AGORA;
    let respostas = 0;
    const limiteSeguranca = 200;
    let voltas = 0;

    while (sessao.fase !== 'concluida' && voltas < limiteSeguranca) {
      voltas++;
      if (sessao.fatoAtual === null) {
        sessao = avancarFase(sessao, fatosState, agora, { semanaAtual: 1, rng });
        continue;
      }
      agora += 1000; // resposta rápida e correta sempre
      const respostaCerta = sessao.fatoAtual.a * sessao.fatoAtual.b;
      const r = avaliarResposta(sessao, respostaCerta, fatosState, agora, rng);
      sessao = r.novoEstado;
      if (r.acao === 'proximo') respostas++;
    }

    assert.equal(sessao.fase, 'concluida');
    assert.ok(respostas >= 5, `esperava >=5 respostas registradas, obteve ${respostas}`);
    const resumo = calcularResumoSessao(sessao);
    assert.equal(resumo.totalFatos, sessao.resultados.length);
    assert.equal(resumo.acertos, sessao.resultados.filter((r) => r.correto).length);
  });
});
