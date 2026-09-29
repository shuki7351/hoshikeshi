/*
 * 小さなアニメーションキュー。
 *
 * 要素（または任意のオブジェクト）ごとに直列キューを持ち、
 * 追加された処理を1つずつ順番に実行する。キューが空いていれば追加した瞬間に実行する。
 * 移動中の要素に新しい移動を頼んだ場合、割り込まずに前の移動が終わってから始まる。
 * この「後回しにされる」挙動が操作感の一部なので、あえてこの方式にしている。
 */
(function (global) {
  'use strict';

  // 緩急: 始めと終わりがゆっくり、中間が速い（コサイン曲線）
  function swing(p) {
    return 0.5 - Math.cos(p * Math.PI) / 2;
  }

  function Queue() {
    this.items = [];
    this.busy = false;
  }

  Queue.prototype.push = function (fn) {
    this.items.push(fn);
    if (!this.busy) this._next();
    return this;
  };

  Queue.prototype._next = function () {
    var fn = this.items.shift();
    if (!fn) {
      this.busy = false;
      return;
    }
    this.busy = true;
    var self = this;
    var done = false;
    fn(function () {
      if (done) return;
      done = true;
      self._next();
    });
  };

  Queue.prototype.delay = function (ms) {
    return this.push(function (next) {
      setTimeout(next, ms);
    });
  };

  Queue.prototype.call = function (fn) {
    return this.push(function (next) {
      fn();
      next();
    });
  };

  function queueOf(el) {
    return el._q || (el._q = new Queue());
  }

  function isHidden(el) {
    return el.style.display === 'none';
  }

  // 数値プロパティ（top / left / opacity）を duration ミリ秒で目標値へ動かす
  function tween(el, props, duration, next) {
    var keys = Object.keys(props);
    var from = {};
    keys.forEach(function (k) {
      from[k] = k === 'opacity'
        ? (el.style.opacity === '' ? 1 : parseFloat(el.style.opacity))
        : (parseFloat(el.style[k]) || 0);
    });
    function apply(p) {
      keys.forEach(function (k) {
        var v = from[k] + (props[k] - from[k]) * p;
        el.style[k] = k === 'opacity' ? String(v) : v + 'px';
      });
    }
    if (!(duration > 0)) {
      apply(1);
      next();
      return;
    }
    var start = performance.now();
    (function frame(now) {
      var p = Math.min(1, (now - start) / duration);
      apply(swing(p));
      if (p < 1) requestAnimationFrame(frame);
      else next();
    })(start);
  }

  var Anim = {
    Queue: Queue,
    swing: swing,

    animate: function (el, props, duration) {
      queueOf(el).push(function (next) {
        tween(el, props, duration, next);
      });
    },

    delay: function (el, ms) {
      queueOf(el).delay(ms);
    },

    then: function (el, fn) {
      queueOf(el).call(fn);
    },

    hide: function (el) {
      el.style.display = 'none';
    },

    fadeIn: function (el, duration) {
      queueOf(el).push(function (next) {
        if (!isHidden(el)) {
          setTimeout(next, duration);
          return;
        }
        el.style.opacity = '0';
        el.style.display = '';
        tween(el, { opacity: 1 }, duration, function () {
          el.style.opacity = '';
          next();
        });
      });
    },

    fadeOut: function (el, duration) {
      queueOf(el).push(function (next) {
        if (isHidden(el)) {
          setTimeout(next, duration);
          return;
        }
        tween(el, { opacity: 0 }, duration, function () {
          el.style.display = 'none';
          el.style.opacity = '';
          next();
        });
      });
    }
  };

  global.Anim = Anim;
})(window);
