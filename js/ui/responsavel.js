// js/ui/responsavel.js
// Modo dos pais: gate de PIN (hardcoded no MVP, em js/config.js), dashboard
// com status por tabuada, gráfico dos últimos 7 dias, checkboxes de
// tabuadas já sabidas, seletor de semana, pausar app e exportar dados.

const RÓTULOS_STATUS = { verde: 'Sabe', amarelo: 'Treino', vermelho: 'Atenção' };

function renderizarGatePin(container, ctx) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="tela-cabecalho">
      <button class="botao-voltar" type="button" aria-label="Voltar ao início">←</button>
      <h1 class="tela-titulo">Modo responsável</h1>
    </div>
    <div class="dialogo-pin">
      <p style="font-size:2rem;">🔒</p>
      <p>Digite o PIN dos pais</p>
      <input class="input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-label="PIN" data-el="pin" />
      <p class="feedback-mensagem feedback-mensagem--erro" data-el="erro" aria-live="polite"></p>
      <button class="botao botao--bloco" type="button" data-acao="entrar">Entrar</button>
    </div>
  `;
  div.querySelector('.botao-voltar').addEventListener('click', () => ctx.navegarPara('/'));

  const input = div.querySelector('[data-el="pin"]');
  const erro = div.querySelector('[data-el="erro"]');

  function tentar() {
    if (input.value === ctx.config.PIN_RESPONSAVEL) {
      renderizarDashboard(container, ctx);
    } else {
      erro.textContent = 'PIN incorreto. Tente novamente.';
      input.value = '';
      input.focus();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tentar();
  });
  div.querySelector('[data-acao="entrar"]').addEventListener('click', tentar);

  container.appendChild(div);
  input.focus();
}

function badgeStatus(status) {
  return `<span class="badge-status badge-status--${status}">${RÓTULOS_STATUS[status]}</span>`;
}

async function renderizarDashboard(container, ctx) {
  container.innerHTML = '';
  const prefs = ctx.getPrefs();
  const status = await ctx.analytics.calcularStatusPorTabuada();
  const ultimos7Dias = await ctx.analytics.calcularUltimos7Dias();
  const maxTotalDia = Math.max(1, ...ultimos7Dias.map((d) => d.total));
  const statusDivisao = await ctx.analytics.calcularStatusDivisao(prefs);
  await ctx.tts.carregarVozes();
  const vozesPtBR = ctx.tts.listarVozesPtBR();

  const raiz = document.createElement('div');
  raiz.innerHTML = `
    <div class="tela-cabecalho">
      <button class="botao-voltar" type="button" aria-label="Voltar ao início">←</button>
      <h1 class="tela-titulo">Painel dos pais</h1>
    </div>

    <section>
      <h2 class="tela-titulo" style="font-size:1.1rem;">Status por tabuada</h2>
      <p style="color:var(--cor-texto-suave); font-size:0.9rem;">
        🟢 sabe bem &nbsp; 🟡 está aprendendo &nbsp; 🔴 precisa de mais prática
      </p>
      <div class="grade-tabuadas" data-el="grade-status">
        ${Array.from({ length: 10 }, (_, i) => i + 1)
          .map((t) => `<div class="tabuada-status"><span>${t}</span>${badgeStatus(status[t] || 'amarelo')}</div>`)
          .join('')}
      </div>
    </section>

    <section style="margin-top:24px;">
      <h2 class="tela-titulo" style="font-size:1.1rem;">Últimos 7 dias</h2>
      <div class="grafico-semana">
        ${ultimos7Dias
          .map((d) => {
            const alturaPct = Math.round((d.total / maxTotalDia) * 100);
            const diaCurto = d.data.slice(8, 10);
            return `
              <div class="grafico-semana__coluna" title="${d.acertos}/${d.total} corretas em ${d.data}">
                <div class="grafico-semana__barra" style="height:${alturaPct}%"></div>
                <span class="grafico-semana__rotulo">${diaCurto}</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </section>

    <section style="margin-top:24px;">
      <h2 class="tela-titulo" style="font-size:1.1rem;">Tabuadas que ela já sabe</h2>
      <div class="grade-tabuadas" data-el="checkboxes-conhecidas">
        ${Array.from({ length: 10 }, (_, i) => i + 1)
          .map(
            (t) => `
              <label class="tabuada-status" style="cursor:pointer;">
                <input type="checkbox" data-tabuada="${t}" ${prefs.tabuadasConhecidas.includes(t) ? 'checked' : ''} style="width:22px;height:22px;" />
                <span>${t}</span>
              </label>
            `
          )
          .join('')}
      </div>
    </section>

    <section style="margin-top:24px;" class="campo">
      <label for="select-voz">Voz do app (Conhecer, jogo Detetive)</label>
      ${
        vozesPtBR.length === 0
          ? '<div class="aviso-caixa">Nenhuma voz em português foi encontrada neste aparelho — o app mostra o texto na tela em vez de falar.</div>'
          : `
            <select id="select-voz" data-el="select-voz">
              <option value="">Automática (melhor voz disponível)</option>
              ${vozesPtBR
                .map(
                  (v) =>
                    `<option value="${v.voiceURI}" ${prefs.vozPreferidaURI === v.voiceURI ? 'selected' : ''}>${v.name}</option>`
                )
                .join('')}
            </select>
            <div class="linha-acoes" style="margin-top:8px;">
              <button class="botao botao--secundario" type="button" data-acao="testar-voz">🔊 Testar voz</button>
            </div>
            <p style="color:var(--cor-texto-suave); font-size:0.85rem; margin-top:8px;">
              Achou a voz muito robótica? No iPhone, baixe uma voz "Aprimorada"
              em Ajustes → Acessibilidade → Conteúdo Falado → Vozes →
              Português — ela aparece aqui automaticamente depois.
            </p>
          `
      }
    </section>

    <section style="margin-top:24px;" class="campo">
      <label for="select-semana">Semana atual (agrupamento anti-interferência)</label>
      <select id="select-semana" data-el="select-semana">
        ${[1, 2, 3, 4, 5, 6].map((s) => `<option value="${s}" ${s === prefs.semanaAtual ? 'selected' : ''}>Semana ${s}</option>`).join('')}
      </select>
    </section>

    <section style="margin-top:24px;">
      <h2 class="tela-titulo" style="font-size:1.1rem;">Divisão (Método das Estimativas)</h2>
      <p style="color:var(--cor-texto-suave); font-size:0.9rem;">
        Sem cronômetro nem meta de tempo — o foco é ela aprender a tirar
        quantidades maiores de uma vez, no ritmo dela.
      </p>
      <div class="campo">
        <label for="select-nivel-divisao">Nível atual (1 a 6)</label>
        <select id="select-nivel-divisao" data-el="select-nivel-divisao">
          ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === statusDivisao.nivelAtual ? 'selected' : ''}>Nível ${n}</option>`).join('')}
        </select>
      </div>
      <div class="grade-tabuadas">
        <div class="tabuada-status">
          <span>${statusDivisao.problemasUltimos7Dias}</span>
          <small style="text-align:center;">problemas nos últimos 7 dias</small>
        </div>
        <div class="tabuada-status">
          <span>${statusDivisao.mediaPassosUltimas10.toFixed(1)} / ${statusDivisao.mediaParUltimas10.toFixed(1)}</span>
          <small style="text-align:center;">passos usados / passos-referência (últimas 10)</small>
        </div>
        <div class="tabuada-status">
          <span>${Math.round(statusDivisao.pctFechamentoPrimeira * 100)}%</span>
          <small style="text-align:center;">fechou de primeira</small>
        </div>
      </div>
    </section>

    <section style="margin-top:24px;" class="campo">
      <label for="input-horas-pausa">Pausar o app por quantas horas?</label>
      <div class="linha-acoes">
        <input id="input-horas-pausa" type="number" min="1" max="72" value="2" style="width:80px; min-height:44px; font-size:1.1rem; text-align:center;" />
        <button class="botao" type="button" data-acao="pausar">Pausar</button>
        ${prefs.pausaAteTimestamp && prefs.pausaAteTimestamp > Date.now() ? '<button class="botao botao--secundario" type="button" data-acao="cancelar-pausa">Cancelar pausa</button>' : ''}
      </div>
    </section>

    <section style="margin-top:24px; margin-bottom:24px;">
      <button class="botao botao--bloco botao--secundario" type="button" data-acao="exportar">Exportar dados (JSON)</button>
    </section>
  `;

  raiz.querySelector('.botao-voltar').addEventListener('click', () => ctx.navegarPara('/'));

  raiz.querySelectorAll('[data-tabuada]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const tabuada = Number(checkbox.dataset.tabuada);
      const atuais = ctx.getPrefs().tabuadasConhecidas;
      let novasConhecidas;
      if (checkbox.checked) {
        novasConhecidas = [...new Set([...atuais, tabuada])];
        await ctx.analytics.aplicarTabuadasConhecidas([tabuada]);
        await ctx.recarregarFatosCache();
      } else {
        novasConhecidas = atuais.filter((t) => t !== tabuada);
      }
      ctx.salvarPrefs({ tabuadasConhecidas: novasConhecidas });
    });
  });

  raiz.querySelector('[data-el="select-semana"]').addEventListener('change', (e) => {
    ctx.salvarPrefs({ semanaAtual: Number(e.target.value) });
  });

  raiz.querySelector('[data-el="select-nivel-divisao"]').addEventListener('change', (e) => {
    ctx.salvarPrefs({ nivelDivisao: Number(e.target.value) });
  });

  raiz.querySelector('[data-el="select-voz"]')?.addEventListener('change', (e) => {
    ctx.salvarPrefs({ vozPreferidaURI: e.target.value || null });
  });

  raiz.querySelector('[data-acao="testar-voz"]')?.addEventListener('click', () => {
    ctx.tts.falar('3 vezes 7 é igual a 21');
  });

  raiz.querySelector('[data-acao="pausar"]').addEventListener('click', () => {
    const horas = Number(raiz.querySelector('#input-horas-pausa').value) || 1;
    ctx.salvarPrefs({ pausaAteTimestamp: Date.now() + horas * 3600000 });
    renderizarDashboard(container, ctx);
  });

  raiz.querySelector('[data-acao="cancelar-pausa"]')?.addEventListener('click', () => {
    ctx.salvarPrefs({ pausaAteTimestamp: null });
    renderizarDashboard(container, ctx);
  });

  raiz.querySelector('[data-acao="exportar"]').addEventListener('click', async () => {
    const dados = await ctx.db.exportarTudo();
    const pacote = { exportadoEm: new Date().toISOString(), prefs: ctx.getPrefs(), ...dados };
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tabuada-turbo-dados-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  container.appendChild(raiz);
}

export function montar(container, ctx) {
  renderizarGatePin(container, ctx);
}

export function desmontar() {}
