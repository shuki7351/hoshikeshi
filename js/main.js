/*
 * 表示と操作。ゲーム画面は 640x800 の固定座標で組み立て、外側で画面に合わせて拡大縮小する。
 */
(function () {
  'use strict';

  var CELL_W = 72;
  var CELL_H = 66;
  var BOARD_W = Game.WIDTH * CELL_W;   // 576
  var BOARD_H = Game.HEIGHT * CELL_H;  // 660
  var MOVE_MS = 300;                   // 星の移動・消えるフェードの長さ
  var COLOR_CLASS = { 1: 'red', 2: 'pink', 3: 'yellow', 4: 'cyan' };
  var BEST_KEY = 'hoshikeshi.best';

  var stage = document.getElementById('stage');
  var session = null;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 保存できなくても遊べる */ }
  }

  // 星はタッチが触れた瞬間に反応させ、続くクリックやズームは起こさない（ボタンは通常の click）
  function onPress(target, fn) {
    target.addEventListener('touchstart', function (e) {
      if (e.touches.length > 1) return;
      e.preventDefault();
      fn(e);
    }, { passive: false });
    target.addEventListener('click', fn);
  }

  function Session() {
    var self = this;
    var views = {};            // star.id -> 要素
    var viewQueue = new Anim.Queue();   // 盤面全体の再配置のタイミング管理
    var game = new Game({
      onRowStar: function (star, col) { place(star, col, -1, 0); },
      onRowInserted: function () { render(1); },
      onRemove: function (stars) { removeStars(stars); },
      onScore: function (score) { setScore(score); },
      onSettle: function () { render(200); },
      onEnd: function (score) { end(score); }
    });

    stage.textContent = '';

    // --- 盤面 ---
    var board = el('div', 'board');
    board.appendChild(el('div', 'cells'));
    Anim.hide(board);
    Anim.delay(board, 500);
    Anim.fadeIn(board, 200);
    stage.appendChild(board);

    function viewOf(star) {
      if (views[star.id]) return views[star.id];
      var v = el('div', 'star ' + COLOR_CLASS[star.color]);
      v.star = star;
      onPress(v, function () { game.tap(star); });
      board.appendChild(v);
      return (views[star.id] = v);
    }

    // col 列目・下から row 段目の位置へ duration ミリ秒で移動させる
    function place(star, col, row, duration) {
      var v = viewOf(star);
      if (star.top === undefined) {
        // 初登場の星は、目標の段数ぶん盤面の上（row=-1 は盤面のすぐ下）から現れる
        Anim.animate(v, { top: -CELL_H * (row + 1), left: col * CELL_W }, 0);
      }
      star.top = BOARD_H - row * CELL_H - CELL_H;
      star.left = col * CELL_W;
      Anim.animate(v, { top: star.top, left: star.left }, duration);
    }

    function layoutAll() {
      game.columns.forEach(function (col, c) {
        col.forEach(function (star, r) { place(star, c, r, MOVE_MS); });
      });
    }

    function render(wait) {
      viewQueue.delay(wait).call(layoutAll);
    }

    function removeStars(stars) {
      viewQueue.call(function () {
        stars.forEach(function (star) {
          var v = viewOf(star);
          v.style.zIndex = '1';
          Anim.fadeOut(v, MOVE_MS);
          Anim.then(v, function () {
            v.remove();
            delete views[star.id];
          });
        });
      }).delay(MOVE_MS);
    }

    // --- 画面パーツ（重なり順は追加順） ---
    var decoL = el('div', 'deco left');
    var decoR = el('div', 'deco right');

    var reset = el('div', 'button reset', 'リセット');
    Anim.hide(reset);
    reset.addEventListener('click', function () { session = new Session(); });

    var score = el('div', 'score');
    score.appendChild(el('div', 'tab', 'SCORE'));
    var scoreLabel = el('div', 'label', '0');
    score.appendChild(scoreLabel);
    Anim.hide(score);

    var blocker = el('div', 'blocker');

    var title = el('div', 'title');
    var logo = el('div', 'logo', 'ほしけし');
    logo.setAttribute('data-text', 'ほしけし');
    title.appendChild(logo);
    title.appendChild(el('div', 'sub', 'HOSHIKESHI'));

    var startBtn = el('div', 'button coin start', 'スタート');
    var helpBtn = el('div', 'button coin howto', 'あそびかた');

    var result = el('div', 'result');
    result.appendChild(el('div', 'ornament'));
    result.appendChild(el('div', 'heading', 'とくてん'));
    result.appendChild(el('div', 'box'));
    var resultLabel = el('div', 'label', '0');
    result.appendChild(resultLabel);
    var bestLabel = el('div', 'best');
    result.appendChild(bestLabel);
    var retry = el('div', 'button pill retry', 'タイトルへ');
    result.appendChild(retry);
    Anim.hide(result);
    retry.addEventListener('click', function () { session = new Session(); });

    var help = el('div', 'window helpwin');
    help.appendChild(el('div', 'heading', 'あそびかた'));
    var body = el('div', 'body');
    [
      'おなじ色の星が 3つ以上 くっついているところを',
      'タップすると、まとめて消せるよ。',
      '下から星がどんどん せり上がってくるよ。',
      'いちばん上まで つみ上がったら おしまい！',
      'いっぺんに たくさん消すほど 高得点。',
      '（消した数 × 消した数 がとくてんになるよ）'
    ].forEach(function (line) { body.appendChild(el('p', null, line)); });
    help.appendChild(body);
    var sample = el('div', 'sample');
    ['red', 'pink', 'yellow', 'cyan'].forEach(function (c) { sample.appendChild(el('span', 'star-icon ' + c)); });
    help.appendChild(sample);
    var close = el('div', 'button pill close', 'とじる');
    help.appendChild(close);
    Anim.hide(help);

    [decoL, decoR, reset, score, blocker, title, startBtn, helpBtn, result, help]
      .forEach(function (e) { stage.appendChild(e); });

    startBtn.addEventListener('click', function () {
      game.start();
      blocker.style.height = '0';
      Anim.fadeOut(help, 300);
      [title, startBtn, helpBtn].forEach(function (e) { Anim.fadeOut(e, 200); });
      [score, reset].forEach(function (e) { Anim.fadeIn(e, 200); });
    });
    helpBtn.addEventListener('click', function () { Anim.fadeIn(help, 300); });
    close.addEventListener('click', function () { Anim.fadeOut(help, 300); });

    function setScore(v) {
      scoreLabel.textContent = String(v);
      resultLabel.textContent = String(v);
    }

    function end(finalScore) {
      var best = loadBest();
      if (finalScore > best) {
        saveBest(finalScore);
        bestLabel.textContent = 'ベスト更新！';
        bestLabel.classList.add('new');
      } else {
        bestLabel.textContent = 'ベスト ' + best;
      }
      Anim.delay(result, 500);
      Anim.fadeIn(result, 500);
      blocker.style.height = '100%';
      blocker.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
      Anim.hide(blocker);
      Anim.fadeIn(blocker, 1000);
    }

    this.dispose = function () { game.stop(); };
    if (session) session.dispose();

    game.build();
    layoutAll();

    // 動作確認用（ゲームには影響しない）
    window.__hoshikeshi = { game: game, views: views };
  }

  // --- 画面サイズに合わせて 640x800 を拡大縮小 ---
  var frame = document.getElementById('frame');
  function fit() {
    var s = Math.min(frame.clientWidth / 640, frame.clientHeight / 800);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 100); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  session = new Session();
})();
