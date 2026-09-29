/*
 * ゲームのルール（見た目には関与しない）。
 *
 * 盤面は列の配列。各列は下から上への星の配列で、columns[c][0] が一番下。
 * 変化は listener のコールバックで表示側へ通知する。
 */
(function (global) {
  'use strict';

  var WIDTH = 8;          // 列数
  var HEIGHT = 10;        // これを超えて積み上がったらゲームオーバー
  var COLORS = 4;
  var INITIAL_ROWS = 5;
  var TICK_MS = 1000;

  var nextId = 1;

  function Game(listener) {
    this.listener = listener;
    this.columns = [];
    this.selection = [];
    this.score = 0;
    this.time = 0;
    this.timer = null;
    this.over = false;
  }

  Game.WIDTH = WIDTH;
  Game.HEIGHT = HEIGHT;

  Game.prototype.newStar = function () {
    return { id: nextId++, color: 1 + Math.floor(Math.random() * COLORS) };
  };

  Game.prototype.build = function () {
    this.columns = [];
    for (var c = 0; c < WIDTH; c++) {
      var col = [];
      for (var r = 0; r < INITIAL_ROWS; r++) col.push(this.newStar());
      this.columns.push(col);
    }
    return this;
  };

  Game.prototype.start = function () {
    var self = this;
    this.timer = setInterval(function () { self.tick(); }, TICK_MS);
  };

  Game.prototype.stop = function () {
    clearInterval(this.timer);
    this.timer = null;
  };

  // せり上がりの間隔: 経過秒数が limit を超えたら1段追加（= limit+1 秒ごと）
  Game.prototype.riseLimit = function () {
    if (this.score > 300) return 2;
    if (this.score > 100) return 3;
    return 5;
  };

  Game.prototype.tick = function () {
    this.time++;
    if (this.time <= this.riseLimit()) return;
    this.time = 0;
    this.insertRow();
    for (var c = 0; c < this.columns.length; c++) {
      if (this.columns[c].length > HEIGHT) {
        this.stop();
        this.over = true;
        this.listener.onEnd(this.score);
        return;
      }
    }
  };

  // 全列の一番下に1個ずつ追加する。空いて詰められた右端の列もここで復活する
  Game.prototype.insertRow = function () {
    for (var c = 0; c < WIDTH; c++) {
      if (!this.columns[c]) this.columns[c] = [];
      var star = this.newStar();
      this.listener.onRowStar(star, c);
      this.columns[c].unshift(star);
    }
    this.listener.onRowInserted();
  };

  Game.prototype.find = function (star) {
    for (var c = 0; c < this.columns.length; c++) {
      var r = this.columns[c].indexOf(star);
      if (r !== -1) return { col: c, row: r };
    }
    return null;
  };

  Game.prototype.at = function (c, r) {
    return this.columns[c] ? this.columns[c][r] : undefined;
  };

  Game.prototype.neighbors = function (star) {
    var p = this.find(star);
    if (!p) return [];
    return [
      this.at(p.col + 1, p.row),
      this.at(p.col - 1, p.row),
      this.at(p.col, p.row + 1),
      this.at(p.col, p.row - 1)
    ];
  };

  Game.prototype.clearSelection = function () {
    this.selection.forEach(function (s) { delete s.selected; });
    this.selection.length = 0;
  };

  // タップした星とつながる同色の塊を選ぶ。3個未満なら選ばない
  Game.prototype.select = function (star) {
    this.clearSelection();
    this.flood(star);
    if (this.selection.length < 3) this.clearSelection();
  };

  Game.prototype.flood = function (star) {
    if (star.selected) return;
    this.selection.push(star);
    star.selected = true;
    var self = this;
    this.neighbors(star).forEach(function (n) {
      if (n && n.color === star.color) self.flood(n);
    });
  };

  Game.prototype.tap = function (star) {
    if (this.over) return;
    this.select(star);
    if (!star.selected) return;

    var removed = this.selection.slice();
    var self = this;
    removed.forEach(function (s) {
      var p = self.find(s);
      if (p) self.columns[p.col].splice(p.row, 1);
      s.removed = true;
    });
    this.score += removed.length * removed.length;
    this.clearSelection();
    this.listener.onRemove(removed);
    this.listener.onScore(this.score);

    // 空になった列を取り除き、右側の列を左へ詰める
    this.columns = this.columns.filter(function (col) { return col.length > 0; });
    this.listener.onSettle();
  };

  global.Game = Game;
})(window);
