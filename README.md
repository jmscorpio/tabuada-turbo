# Tabuada Turbo 🟣✖️

PWA (Progressive Web App) de memorização de tabuada para uma criança do 4º
ano do Ensino Fundamental, em português brasileiro. Usa retrieval practice,
repetição espaçada adaptativa por fato e Incremental Rehearsal (IR) para
gerar fluência de verdade — sem decoreba mecânica, sem "vidas", sem punição
por erro, sem ranking, sem compras, sem pet virtual.

100% HTML/CSS/JavaScript (ES2022) vanilla — sem framework, sem bundler, sem
backend, sem login, sem CDN, sem fontes externas e **zero requisições de
rede após o primeiro carregamento** (importante para privacidade de dados
de criança / LGPD). Todo o histórico de respostas fica só no navegador
(IndexedDB); as preferências ficam no `localStorage`.

## Como rodar localmente

Não há build nem `npm install` — é só servir os arquivos estáticos.

```bash
python3 -m http.server 8000
```

Abra **http://localhost:8000** no navegador. Pronto.

## Como rodar os testes

Os testes usam `node:test` (nativo do Node, sem `package.json` e sem
dependências), Node 18+:

```bash
node --test tests/*.test.js
```

> **Nota de compatibilidade:** o comando literal `node --test tests/`
> (apontando para o diretório, sem glob) é o jeito "canônico" documentado
> pelo Node para descobrir os testes automaticamente. Em alguns builds do
> Node (constatado aqui com Node v24.17.0 e v26.3.1 em macOS) passar um
> diretório *explicitamente* como argumento tem um bug de resolução e o
> comando falha com `MODULE_NOT_FOUND`. `node --test tests/*.test.js` (ou
> simplesmente `node --test`, que usa a descoberta automática padrão) roda
> exatamente a mesma suíte sem esse problema — foi o que foi usado durante
> todo o desenvolvimento e validação deste projeto.

Cobertura: `js/scheduler.js` (repetição espaçada + IR), `js/session.js`
(loop de sessão) e `js/db.js` (wrapper IndexedDB, testado contra um fake
simples de IndexedDB escrito no próprio arquivo de teste) — os três são
lógica pura, importável e testável em Node sem DOM.

## Como gerar os ícones

Os PNGs em `icons/` já estão versionados, mas se quiser regerá-los (o
script escreve os bytes crus do PNG usando só `struct`/`zlib` da stdlib do
Python, sem Pillow):

```bash
python3 tools/make_icons.py
```

## Estrutura do projeto

```
index.html                 shell da página + registro do Service Worker
manifest.webmanifest       manifest do PWA
sw.js                      Service Worker (cache-first, offline-first)
icons/                     ícones do PWA (gerados por tools/make_icons.py)
css/theme.css              variáveis de tema + claro/escuro
css/components.css         componentes (cards, botões, input, gráfico...)
css/kid-mode.css           tipografia grande e formas arredondadas
js/config.js               constantes do sistema (única fonte da verdade)
js/main.js                 entrada: registra o SW e inicia o app
js/app.js                  estado global + roteador de views por hash
js/db.js                   wrapper do IndexedDB
js/scheduler.js            repetição espaçada adaptativa + IR (lógica pura)
js/session.js              loop de sessão diário (lógica pura)
js/tts.js                  Web Speech API em pt-BR, com degradação graciosa
js/analytics.js            tracking local (liga scheduler + db + prefs)
js/ui/*.js                 as 6 telas (home, praticar, jogar, conhecer,
                            entender, responsável)
data/tabuadas.json         55 fatos únicos + agrupamento semanal
tests/*.test.js            testes de scheduler, session e db
```

## Instalar no iPhone (Safari)

1. Sirva o app (localmente com o comando acima, ou hospedado — veja a
   seção da Vercel abaixo) e abra a URL no **Safari** do iPhone.
2. Toque no ícone de **Compartilhar** (o quadrado com a seta pra cima).
3. Toque em **"Adicionar à Tela de Início"**.
4. Abra o app pelo ícone que aparece na tela de início — ele roda em modo
   standalone (sem a barra do Safari).

## Hospedar grátis na Vercel

Como não há build nem backend, o deploy é o de um site estático puro:

1. Crie uma conta gratuita em [vercel.com](https://vercel.com) (dá pra
   entrar com GitHub).
2. Suba este repositório para o GitHub (ou use a CLI da Vercel direto
   nesta pasta: `npx vercel`).
3. No painel da Vercel, "Add New Project" → importe o repositório.
4. **Framework Preset:** "Other" (não é Next.js/Vite/etc — é HTML puro).
   **Build Command:** deixe vazio. **Output Directory:** `.` (a raiz do
   repositório).
5. Deploy. A Vercel te dá uma URL `https://SEU-PROJETO.vercel.app` —
   é essa URL que você abre no Safari do iPhone pra instalar.

## Painel dos pais

Ícone 🔒 discreto no canto da tela inicial → PIN **1234** (fixo nesta
versão MVP, definido em `js/config.js`). O painel mostra:

- Status por tabuada (🟢 sabe bem / 🟡 está aprendendo / 🔴 precisa de mais
  prática) com base nos dados reais gravados nas sessões.
- Gráfico simples dos últimos 7 dias de prática.
- Checkboxes de "tabuadas que ela já sabe" (a do 3 vem marcada por
  padrão) — marcar uma tabuada aqui já a considera dominada, sem precisar
  mexer em código.
- Seletor da semana atual do agrupamento anti-interferência.
- Botão para pausar o app por X horas.
- Botão para exportar todos os dados em JSON.

## Critérios manuais — para o responsável testar

Estes não dá para automatizar de dentro do próprio app; peça pra alguém
conferir na prática:

- [ ] Instalar no iPhone via Safari e abrir pelo ícone da tela de início.
- [ ] Funcionar offline no iPhone depois do primeiro carregamento (abra
      uma vez com internet, depois ative o modo avião e abra de novo).
- [ ] TTS em pt-BR audível no iOS — e, se o aparelho não tiver nenhuma voz
      em português instalada, o app deve degradar graciosamente: mostra o
      texto, segue sem áudio, e o jogo "Detetive" avisa e exibe a conta na
      tela em vez de travar.

## Privacidade

Sem backend, sem login, sem analytics externo, sem CDN. Depois do
primeiro carregamento, o app não faz **nenhuma** requisição de rede — tudo
roda e fica salvo localmente no aparelho (IndexedDB + localStorage). Isso
foi uma decisão deliberada de design pensando em dados de criança (LGPD).
