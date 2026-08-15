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
  }
  open(nome) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      let db = this._dbs.get(nome);
      const ehNovo = !db;
      if (!db) {
        db = new FakeDatabase();
        this._dbs.set(nome, db);
      }
      req.result = db;
      if (ehNovo && req.onupgradeneeded) req.onupgradeneeded({ target: req });
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

  test('resetParaTestes limpa as 3 stores', async () => {
    await db.putFato({ chave: 'x', halfLife: 1 });
    await db.addResposta({ chave: 'x', correto: true, tempoMs: 1, timestamp: 1 });
    await db.addSessao({ data: 'd', totalFatos: 1, acertos: 1, erros: 0 });

    await db.resetParaTestes();

    const tudo = await db.exportarTudo();
    assert.equal(tudo.fatos.length, 0);
    assert.equal(tudo.respostas.length, 0);
    assert.equal(tudo.sessoes.length, 0);
  });
});
