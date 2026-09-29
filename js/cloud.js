/*
 * スコアのクラウド保存（Firestore の REST API を直接呼ぶ。SDK は使わない）。
 *
 * - ログインはしない。端末ごとに推測できない12文字の「きろくID」を作り、localStorage に覚える。
 *   同じIDを「ひきつぎコード」として入力すれば、別の端末でも同じ記録を見られる。
 * - 送れなかったスコアは localStorage の送信待ちに残し、次の機会に送り直す。
 *   スコアの文書IDは送る前に決めておき、「まだ存在しないときだけ作る」条件付きで送るので、
 *   二重に記録されることはない。
 * - 変更・削除はデータベースのルール（firestore.rules）で禁止している。
 */
(function (global) {
  'use strict';

  var PROJECT = 'hoshikeshi-6de9d';
  var API_KEY = '';   // 無くても動く。設定した場合は利用量がプロジェクトに紐づく
  var DB = 'projects/' + PROJECT + '/databases/(default)/documents';
  var BASE = 'https://firestore.googleapis.com/v1/';

  var ID_KEY = 'hoshikeshi.id';
  var NAME_KEY = 'hoshikeshi.name';
  var PENDING_KEY = 'hoshikeshi.pending';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 0/O・1/I を除いた32文字

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* 保存できない環境でも遊べる */ }
  }

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function randomId(len) {
    var bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
    return s;
  }

  function url(path) {
    return BASE + path + (API_KEY ? (path.indexOf('?') === -1 ? '?' : '&') + 'key=' + API_KEY : '');
  }

  function request(method, path, body) {
    return fetch(url(path), {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error((json.error && json.error.message) || ('HTTP ' + res.status));
          err.status = (json.error && json.error.status) || '';
          throw err;
        }
        return json;
      });
    });
  }

  function commit(writes) {
    return request('POST', DB.replace('/documents', '/documents:commit'), { writes: writes });
  }

  function int(v) { return { integerValue: String(v) }; }
  function num(field) { return field ? parseInt(field.integerValue, 10) || 0 : 0; }

  // "ABCD-EFGH-JKLM" 形式で表示する
  function formatCode(id) {
    return id ? id.slice(0, 4) + '-' + id.slice(4, 8) + '-' + id.slice(8, 12) : '';
  }

  // 入力されたコードを正規化する（小文字・全角英数・空白・ハイフンを許容）
  function normalizeCode(text) {
    var s = String(text || '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .toUpperCase()
      .replace(/[\s\-ー－‐]/g, '');
    return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null;
  }

  var Cloud = {
    id: function () { return load(ID_KEY); },
    name: function () { return load(NAME_KEY); },
    code: function () { return formatCode(load(ID_KEY)); },
    hasPlayer: function () { return !!load(ID_KEY); },

    // 名前を決めてプレイヤーを作る
    register: function (name) {
      var id = randomId(12);
      return commit([{
        update: { name: DB + '/players/' + id, fields: { name: { stringValue: name }, plays: int(0), best: int(0) } },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false }
      }]).then(function () {
        store(ID_KEY, id);
        store(NAME_KEY, name);
        return id;
      });
    },

    // ひきつぎコードで記録を呼び出す
    restore: function (text) {
      var id = normalizeCode(text);
      if (!id) return Promise.reject(new Error('code'));
      return request('GET', DB + '/players/' + id).then(function (doc) {
        var name = doc.fields.name.stringValue;
        store(ID_KEY, id);
        store(NAME_KEY, name);
        return { id: id, name: name };
      });
    },

    // スコアを送信待ちに積み、送れるだけ送る
    submit: function (score) {
      var pending = Cloud.pending();
      pending.push({ sid: randomId(20), score: score });
      store(PENDING_KEY, JSON.stringify(pending));
      return Cloud.flush();
    },

    pending: function () {
      try { return JSON.parse(load(PENDING_KEY)) || []; } catch (e) { return []; }
    },

    flush: function () {
      var id = load(ID_KEY);
      var pending = Cloud.pending();
      if (!id || !pending.length) return Promise.resolve(0);
      var sent = 0;
      return pending.reduce(function (chain, item) {
        return chain.then(function () {
          return sendOne(id, item).then(function () {
            sent++;
            var rest = Cloud.pending().filter(function (p) { return p.sid !== item.sid; });
            store(PENDING_KEY, rest.length ? JSON.stringify(rest) : null);
          });
        });
      }, Promise.resolve()).then(function () { return sent; });
    },

    // 名前・回数・ベスト・ベスト10
    records: function () {
      var id = load(ID_KEY);
      if (!id) return Promise.reject(new Error('noplayer'));
      var player = request('GET', DB + '/players/' + id);
      var top = request('POST', DB + '/players/' + id + ':runQuery', {
        structuredQuery: {
          from: [{ collectionId: 'scores' }],
          orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
          limit: 10
        }
      });
      return Promise.all([player, top]).then(function (r) {
        var f = r[0].fields;
        store(NAME_KEY, f.name.stringValue);
        return {
          name: f.name.stringValue,
          plays: num(f.plays),
          best: num(f.best),
          top: r[1].filter(function (x) { return x.document; }).map(function (x) {
            return { score: num(x.document.fields.score), at: new Date(x.document.fields.at.timestampValue) };
          })
        };
      });
    }
  };

  // 1件送る: 最新の回数とベストを読んでから、スコア追加と集計更新を1回の書き込みでまとめて行う
  function sendOne(id, item) {
    return request('GET', DB + '/players/' + id).then(function (doc) {
      var f = doc.fields;
      return commit([
        {
          update: { name: DB + '/players/' + id + '/scores/' + item.sid, fields: { score: int(item.score) } },
          updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: false }
        },
        {
          update: {
            name: DB + '/players/' + id,
            fields: { plays: int(num(f.plays) + 1), best: int(Math.max(num(f.best), item.score)) }
          },
          updateMask: { fieldPaths: ['plays', 'best'] },
          currentDocument: { exists: true }
        }
      ]);
    }).catch(function (err) {
      // すでに記録済み（前回の送信が届いていた）なら送信済みとして扱う
      if (err.status === 'ALREADY_EXISTS' || err.status === 'FAILED_PRECONDITION') return;
      throw err;
    });
  }

  global.Cloud = Cloud;
})(window);
