// tests/db.test.js
// Roda com: node --test tests/
//
// Testa js/db.js contra um fake simples de IndexedDB, escrito aqui mesmo
// (sem dependências externas). O fake é instalado em `globalThis.indexedDB`
// antes de qualquer chamada às funções de db.js — por isso db.js precisa
// abrir a conexão de forma preguiçosa (nunca no escopo do módulo).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

// ---------- fake de IndexedDB (em memória, assíncrono via microtask) ----------

class FakeRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.result = undefined;
    this.error = undefined;
  }
}

function resolverComSucesso(req, resultado) {
  queueMicrotask(() => {
    req.result = resultado;
    if (req.onsuccess) req.onsuccess({ target: req });
  });
}

function criarOperacoesDeStore(infoStore) {
  return {
    get(chave) {
      const req = new FakeRequest();
      resolverComSucesso(req, infoStore.data.get(chave));
      return req;
    },
    put(valor) {
      const req = new FakeRequest();
      let chave = valor[infoStore.keyPath];
      let paraSalvar = valor;
      if (chave === undefined && infoStore.autoIncrement) {
        chave = infoStore.nextId++;
        paraSalvar = { ...valor, [infoStore.keyPath]: chave };
      } else if (typeof chave === 'number' && infoStore.autoIncrement) {
        infoStore.nextId = Math.max(infoStore.nextId, chave + 1);
      }
      infoStore.data.set(chave, paraSalvar);
      resolverComSucesso(req, chave);
      return req;
    },
    add(valor) {
      return this.put(valor);
    },
    getAll() {
      const req = new FakeRequest();
      resolverComSucesso(req, [...infoStore.data.values()]);
      return req;
    },
    clear() {
      const req = new FakeRequest();
      infoStore.data.clear();
      resolverComSucesso(req, undefined);
      return req;
    },
    delete(chave) {
      const req = new FakeRequest();
      infoStore.data.delete(chave);
      resolverComSucesso(req, undefined);
      return req;
    },
  };
}

class FakeDatabase {
  constructor() {
    this._stores = new Map();
    this.objectStoreNames = { contains: (nome) => this._stores.has(nome) };
  }
  createObjectStore(nome, { keyPath, autoIncrement = false } = {}) {
    this._stores.set(nome, { keyPath, autoIncrement, nextId: 1, data: new Map() });
    return criarOperacoesDeStore(this._stores.get(nome));
  }
  transaction(nomesStores) {
    const stores = this._stores;
    return {
      objectStore(nome) {
        const info = stores.get(nome);
        if (!info) throw new Error(`store inexistente no fake: ${nome}`);
        return criarOperacoesDeStore(info);
      },
    };
  }
}

class FakeIndexedDB {
  constructor() {
    this._dbs = new Map();
    this._versoes = new Map();
  }
  open(nome, versao = 1) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      let db = this._dbs.get(nome);
      const versaoAtual = this._versoes.get(nome) || 0;
      const ehNovo = !db;
      if (!db) {
        db = new FakeDatabase();
        this._dbs.set(nome, db);
      }
      req.result = db;
      // Dispara onupgradeneeded tanto num banco novo quanto num banco já
      // existente sendo reaberto com versão maior — como o IndexedDB real,
      // pra simular migração (os guards `contains` do app decidem o que
      // criar de novo sem mexer no que já existe).
      if ((ehNovo || versao > versaoAtual) && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req });
      }
      this._versoes.set(nome, versao);
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
}

globalThis.indexedDB = new FakeIndexedDB();

// db.js só abre a conexão (e portanto só toca `globalThis.indexedDB`) na
// primeira chamada de uma função exportada — o import estático abaixo é seguro.
const db = await import('../js/db.js');

// ---------- testes ----------

describe('js/db.js', () => {
  before(async () => {
    await db.resetParaTestes();
  });

  test('putFato / getFato: roundtrip', async () => {
    const fato = { chave: '3x7', halfLife: 7, introduzido: true };
    await db.putFato(fato);
    const lido = await db.getFato('3x7');
    assert.deepEqual(lido, fato);
  });

  test('getFato retorna undefined para chave inexistente', async () => {
    const lido = await db.getFato('inexistente');
    assert.equal(lido, undefined);
  });

  test('getTodosFatos retorna todos os fatos salvos', async () => {
    await db.resetParaTestes();
    await db.putFato({ chave: '1x1', halfLife: 1 });
    await db.putFato({ chave: '2x2', halfLife: 1 });
    const todos = await db.getTodosFatos();
    assert.equal(todos.length, 2);
    assert.deepEqual(
      todos.map((f) => f.chave).sort(),
      ['1x1', '2x2']
    );
  });

  test('addResposta gera id autoIncrement e getTodasRespostas lista tudo', async () => {
    await db.resetParaTestes();
    const id1 = await db.addResposta({ chave: '4x6', correto: true, tempoMs: 1200, timestamp: 1 });
    const id2 = await db.addResposta({ chave: '4x6', correto: false, tempoMs: 4000, timestamp: 2 });
    assert.notEqual(id1, id2);
    const todas = await db.getTodasRespostas();
    assert.equal(todas.length, 2);
  });

  test('addSessao / getUltimasSessoes respeita ordem e limite', async () => {
    await db.resetParaTestes();
    for (let i = 0; i < 5; i++) {
      await db.addSessao({ data: `2026-08-1${i}`, totalFatos: 8, acertos: 8, erros: 0 });
    }
    const ultimas3 = await db.getUltimasSessoes(3);
    assert.equal(ultimas3.length, 3);
    // deve ser a ordem cronológica (por id crescente) das 3 últimas inseridas
    assert.deepEqual(
      ultimas3.map((s) => s.data),
      ['2026-08-12', '2026-08-13', '2026-08-14']
    );
  });

  test('exportarTudo retorna as 3 coleções', async () => {
    await db.resetParaTestes();
    await db.putFato({ chave: '5x5', halfLife: 3 });
    await db.addResposta({ chave: '5x5', correto: true, tempoMs: 900, timestamp: 1 });
    await db.addSessao({ data: '2026-08-15', totalFatos: 8, acertos: 7, erros: 1 });

    const tudo = await db.exportarTudo();
    assert.equal(tudo.fatos.length, 1);
    assert.equal(tudo.respostas.length, 1);
    assert.equal(tudo.sessoes.length, 1);
  });

  test('resetParaTestes limpa as 4 stores', async () => {
    await db.putFato({ chave: 'x', halfLife: 1 });
    await db.addResposta({ chave: 'x', correto: true, tempoMs: 1, timestamp: 1 });
    await db.addSessao({ data: 'd', totalFatos: 1, acertos: 1, erros: 0 });
    await db.addDivisao({ timestamp: 1, dividendo: 60, divisor: 5, quociente: 12, resto: 0 });

    await db.resetParaTestes();

    const tudo = await db.exportarTudo();
    assert.equal(tudo.fatos.length, 0);
    assert.equal(tudo.respostas.length, 0);
    assert.equal(tudo.sessoes.length, 0);
    assert.equal(tudo.divisoes.length, 0);
  });

  test('addDivisao gera id autoIncrement e getTodasDivisoes respeita ordem', async () => {
    await db.resetParaTestes();
    await db.addDivisao({ timestamp: 1, dividendo: 60, divisor: 5, quociente: 12, resto: 0, nivel: 1 });
    await db.addDivisao({ timestamp: 2, dividendo: 58, divisor: 7, quociente: 8, resto: 2, nivel: 2 });
    const todas = await db.getTodasDivisoes();
    assert.equal(todas.length, 2);
    assert.deepEqual(
      todas.map((d) => d.dividendo),
      [60, 58]
    );
  });

  test('exportarTudo inclui divisoes', async () => {
    await db.resetParaTestes();
    await db.addDivisao({ timestamp: 1, dividendo: 60, divisor: 5, quociente: 12, resto: 0, nivel: 1 });
    const tudo = await db.exportarTudo();
    assert.equal(tudo.divisoes.length, 1);
    assert.equal(tudo.divisoes[0].dividendo, 60);
  });
});

describe('migração v1 → v2 (store divisoes nova, sem perder dados de tabuada)', () => {
  test('banco pré-existente sem a store divisoes ganha ela ao reabrir na v2, preservando fatos/respostas/sessões', async () => {
    // Simula um banco já em produção na v1: 3 stores, já com dados, sem
    // `divisoes`. Registrado manualmente (não via js/db.js) numa instância
    // NOVA e isolada do fake, com versão 1 já "commitada".
    const fakeIsolado = new FakeIndexedDB();
    const dbV1 = new FakeDatabase();
    dbV1.createObjectStore('fatos', { keyPath: 'chave' });
    dbV1.createObjectStore('respostas', { keyPath: 'id', autoIncrement: true });
    dbV1.createObjectStore('sessoes', { keyPath: 'id', autoIncrement: true });
    const opsFatos = dbV1._stores.get('fatos');
    opsFatos.data.set('3x7', { chave: '3x7', halfLife: 7, introduzido: true });
    const opsRespostas = dbV1._stores.get('respostas');
    opsRespostas.data.set(1, { id: 1, chave: '3x7', correto: true, tempoMs: 900, timestamp: 1 });
    fakeIsolado._dbs.set('tabuada-turbo-db', dbV1);
    fakeIsolado._versoes.set('tabuada-turbo-db', 1);

    globalThis.indexedDB = fakeIsolado;

    // Cache-busting: força o Node a reexecutar js/db.js do zero (conexaoPromise
    // limpo), em vez de reusar o módulo já aberto na v2 pelos testes acima.
    const dbMigrado = await import('../js/db.js?migracao-v1-v2');

    const fatos = await dbMigrado.getTodosFatos();
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0].chave, '3x7');

    const respostas = await dbMigrado.getTodasRespostas();
    assert.equal(respostas.length, 1);

    // A store nova existe e funciona (prova que o onupgradeneeded rodou de
    // fato na migração, não só na criação de um banco do zero).
    await dbMigrado.addDivisao({ timestamp: 1, dividendo: 60, divisor: 5, quociente: 12, resto: 0, nivel: 1 });
    const divisoes = await dbMigrado.getTodasDivisoes();
    assert.equal(divisoes.length, 1);
  });
});
