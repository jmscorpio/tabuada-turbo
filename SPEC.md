# Tabuada Turbo — Especificação para o agente

Você é um engenheiro de software front-end sênior com background em educação infantil.
Construa, do zero, um PWA (Progressive Web App) de memorização de tabuada, em português
brasileiro, para uma menina de 9 anos (4º ano do Ensino Fundamental). Nome do app:
"Tabuada Turbo".

## OBJETIVO PEDAGÓGICO CENTRAL
Memorização com fluência — resposta automática e rápida. Não é decoreba mecânica:
o app usa retrieval practice (auto-teste), spaced repetition adaptativo por fato,
Incremental Rehearsal (IR) e agrupamento anti-interferência. Gamificação leve,
baseada em progresso de mastery, nunca em punição.

## CONSTANTES DO SISTEMA (defina em js/config.js e importe em todo lugar)
- T_RAPIDO = 2000 ms   → acerto "fluente": maior boost de meia-vida no scheduler
- T_META   = 3000 ms   → meta de fluência na sessão: acerto acima disso repete a pergunta
- T_ESTRELA = 1500 ms  → tempo médio por conta para ganhar 3 estrelas nos jogos
- MAX_NOVOS_POR_SESSAO = 3
- HALFLIFE_INICIAL = 1 dia; HALFLIFE_CAP = 30 dias
- FATO MADURO = halfLife ≥ 7 dias E últimas 3 respostas corretas com tempo ≤ T_META

## ESCOPO DOS FATOS — 55 fatos únicos
- Fatos são pares NÃO ordenados de 1 a 10: a chave canônica é "menorXmaior" (ex: "3x7").
  São C(10,2) + 10 = 55 fatos. NÃO existem fatos duplicados para 3×7 e 7×3.
- Na apresentação, cada fato aparece aleatoriamente numa das duas ordens (3×7 ou 7×3) —
  isso ensina comutatividade de graça. As estatísticas são do fato único.
- Tabuadas de 1 e 10 são "triviais": cada fato entra no pool maduro após 1 acerto.
- Tabuada do 3 já foi consolidada pela criança: entra como madura desde o início
  (seed: halfLife = 7 dias). O painel dos pais tem checkboxes "tabuadas que ela já sabe"
  (default: 3 marcado) para ajustar isso sem mexer em código.

## AGRUPAMENTO SEMANAL ANTI-INTERFERÊNCIA (codifique exatamente assim em data/tabuadas.json)
Fatos similares confundem a memória; 6, 7 e 8 nunca aparecem como novos na mesma semana.
- Semana 1: tabuadas 2, 5, 10
- Semana 2: tabuadas 4, 9
- Semana 3: tabuada 8 (sozinha — conflita com 6 e 7)
- Semana 4: tabuada 6 (sozinha)
- Semana 5: tabuada 7 (sozinha)
- Semana 6: integração — sem fatos novos, só mistura de revisão
Avanço de semana: automático quando a taxa de acerto nos fatos da semana atual for >85%
em 3 sessões consecutivas. A semana atual também é ajustável no painel dos pais.
Cada fato no JSON: { a, b, chave, semanaSugerida, trivial, conflitaCom: [chaves] }
(conflitaCom: fatos das tabuadas 6/7/8 conflitam entre si).

## SPACED REPETITION ADAPTATIVO (js/scheduler.js)
- Cada fato mantém: halfLife (dias), nextReview (timestamp), histórico de respostas.
- A cada resposta:
  - acertou em ≤ T_RAPIDO       → halfLife *= 2.0
  - acertou em T_RAPIDO..5000ms → halfLife *= 1.4
  - acertou em > 5000ms         → halfLife *= 1.1
  - errou                       → halfLife *= 0.5 (mínimo 0.5); nextReview = amanhã
- nextReview = agora + halfLife (em dias). Cap: HALFLIFE_CAP.
- getNextFacts(limit): retorna mistura de ~70% fatos com nextReview <= agora (revisão)
  e ~30% fatos novos da semana atual, respeitando MAX_NOVOS_POR_SESSAO.
- IR (Incremental Rehearsal): todo fato novo é intercalado com 7–8 fatos já conhecidos.

## LOOP DE SESSÃO (js/session.js)
1. Warm-up (2 min, configurável): 8–10 fatos de revisão aleatórios do pool maduro.
2. Bloco novo (3–4 min): IR — 1 fato novo por vez entre conhecidos rotativos.
3. Cronômetro discreto no canto. Ao final: tela de parabéns com estrelas.
- Resposta digitada em input numérico grande (teclado na tela + teclado físico).
- Acerto ≤ T_META: feedback verde + som curto. Acerto > T_META: "isso! agora mais
  rápido" e repete a mesma pergunta. Erro: mostra a resposta e pede para digitá-la —
  sem punição, sem perder "vidas".

## TELAS (js/ui/*)
- Home: 4 cards grandes — Praticar / Jogar / Conhecer / Entender. Streak de dias
  consecutivos embaixo (aviso amigável se quebrar, nunca culpando). Botão discreto 🔒
  no canto para o modo dos pais.
- Praticar (default na 1ª abertura do dia): roda o loop de sessão.
- Jogar — 3 mini-jogos, só com fatos maduros, medindo contra RECORDES PESSOAIS
  (não há ranking — só existe uma jogadora):
  1. "Sequência rápida": 10 contas seguidas; 3⭐ se a média por conta ≤ T_ESTRELA.
  2. "Batalha contra o Robô": vence quem acertar 20 primeiro. O oponente é um robô
     simpático que "responde" num ritmo escolhido antes de começar:
     Tranquilo = 1 ponto a cada 6s (e "erra" 10% das vezes), Esperto = a cada 4s,
     Turbo = a cada 2,5s. O robô nunca zomba ao ganhar; incentiva a revanche.
  3. "Detetive": o app FALA a conta (TTS) sem mostrar na tela; ela digita a resposta.
- Conhecer: carrossel de tabuadas; ao abrir uma, mostra os 10 fatos com TTS lendo
  e botão "praticar esta".
- Entender: 3 páginas ilustradas com SVG inline — soma de parcelas iguais,
  comutatividade (3×4 = 4×3 com retângulo girando), dobro/metade. Linguagem simples.
- Responsável (PIN 1234, hardcoded no MVP): dashboard com status por tabuada
  (verde=madura / amarelo=aprendendo / vermelho=dificuldade), gráfico simples dos
  últimos 7 dias, checkboxes "tabuadas que ela já sabe", seletor de semana atual,
  botão "pausar app por X horas", botão "exportar dados (JSON)".

## STACK OBRIGATÓRIA (NÃO MUDE)
- HTML5 + CSS3 + JavaScript ES2022 vanilla (sem React/Vue/Svelte/TypeScript/bundler).
- PWA: manifest.webmanifest + Service Worker offline-first (cache-first para o app
  shell, versão no nome do cache para cache busting).
- IndexedDB para histórico de respostas (wrapper próprio em js/db.js);
  localStorage para preferências (tema, último modo, configurações dos pais).
- SEM backend, SEM login, SEM CDN, SEM fontes externas — tipografia via
  system-ui/-apple-system, com tamanhos grandes e formas arredondadas para o
  "modo criança" (NÃO baixar Comic Neue nem nenhuma webfont).
- SEM analytics externo, zero requisições de rede após o primeiro carregamento (LGPD — criança).
- Áudio: Web Speech API nativa em pt-BR. IMPORTANTE: se o dispositivo não tiver voz
  pt-BR disponível, o app degrada graciosamente (mostra o texto, segue sem áudio,
  e o jogo "Detetive" exibe aviso e mostra a conta na tela).

## ESTRUTURA DE PASTAS (reproduza exatamente, na raiz deste repositório)
  index.html
  manifest.webmanifest
  sw.js
  icons/icon-192.png
  icons/icon-512.png
  icons/maskable-512.png
  icons/apple-touch-icon.png     (180px — iOS ignora o manifest para isso)
  tools/make_icons.py            (gera os PNGs acima usando SÓ stdlib do Python —
                                  escreve PNG cru via zlib/struct: fundo roxo #7c3aed
                                  com um "×" claro simples; rode uma vez e commite os PNGs)
  css/theme.css                  (CSS variables, tema claro default + toggle escuro)
  css/components.css
  css/kid-mode.css
  js/config.js                   (constantes do sistema)
  js/main.js                     (entry: registra SW + monta UI)
  js/app.js                      (estado global + roteador de views por hash)
  js/db.js                       (wrapper IndexedDB)
  js/scheduler.js                (SR + IR — lógica pura, testável)
  js/session.js                  (loop diário — lógica pura, testável)
  js/tts.js
  js/analytics.js                (tracking LOCAL de tempo/resposta)
  js/ui/home.js  pratica.js  jogo.js  conhecer.js  entender.js  responsavel.js
  data/tabuadas.json             (55 fatos + agrupamento semanal, como especificado)
  tests/scheduler.test.js
  tests/db.test.js
  tests/session.test.js
  README.md

## DESIGN
- Paleta alegre e neutra (roxo #7c3aed como primária, amarelo, verde, azul) —
  nada de rosa estereotipado.
- Mobile-first para iPhone 13 (390px), responsivo até desktop.
- Acessibilidade WCAG AA: contraste, navegação por teclado, aria-label em botões de ícone,
  área de toque ≥ 44px.
- Performance: JS total < 100KB, LCP < 1.5s.

## O QUE EU NÃO QUERO
- Pet virtual que precisa ser alimentado (distrai da fluência).
- Sistema de "vidas" ou qualquer punição por erro (gera ansiedade — errado pedagogicamente).
- Compras in-app, social, ranking online, notificações push.
- Modo escuro como default (pode ter toggle; default é claro).

## MODO DE TRABALHO
1. Construa na raiz deste repositório (o SPEC.md é este arquivo — mantenha-o intacto).
2. scheduler.js, session.js e db.js devem ser lógica pura importável em Node:
   escreva os testes em tests/ usando node:test (rodáveis com `node --test tests/`,
   Node 18+, sem package.json nem dependências). Para db.js, teste o wrapper contra
   um fake de IndexedDB simples incluído no próprio teste.
3. A cada bloco de ~5 arquivos, rode `node --test tests/` e mostre o output.
4. Rode tools/make_icons.py para gerar os ícones.
5. No final, sirva com `python3 -m http.server 8000` e me diga a URL.
6. README.md por último: como rodar local, como instalar no iPhone (Safari →
   Compartilhar → Adicionar à Tela de Início), como hospedar grátis na Vercel.

## CRITÉRIOS DE PRONTO — AUTOMÁTICOS (você verifica antes de entregar)
- [ ] `node --test tests/` passa (scheduler, session, db)
- [ ] App abre em http://localhost:8000 sem NENHUM erro no console
- [ ] Uma sessão de Praticar é completável com pelo menos 5 fatos
- [ ] Modo Responsável abre com PIN 1234 e mostra dados reais gravados na sessão
- [ ] manifest.webmanifest é JSON válido com name, short_name, start_url, display
      standalone, theme_color #7c3aed, background_color #fef9ff e os 3 ícones
      (valide você mesmo por script — não use validadores online)
- [ ] Service Worker registra sem erro e o app recarrega offline
      (simule: derrube o servidor e recarregue a página)

## CRITÉRIOS MANUAIS (deixe listados no README para o pai testar)
- [ ] Instalar no iPhone via Safari e abrir da tela de início
- [ ] Funcionar offline no iPhone após o primeiro carregamento
- [ ] TTS pt-BR audível no iOS (e degradação graciosa se não houver voz)
